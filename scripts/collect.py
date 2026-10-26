"""Collect cached CNY fares. Token stays in environment, never in public JSON."""
import datetime as dt
import json
import os
from pathlib import Path
import time
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc

def normalize(row, origin, destination, start, end):
    try:
        date = dt.date.fromisoformat(str(row['depart_date'])[:10])
        price = float(row['value'])
        found = dt.datetime.fromisoformat(row['found_at'].replace('Z', '+00:00'))
        stops = int(row['number_of_changes'])
        if row.get('actual') is False or row.get('return_date') or not start <= date <= end or not 0 < price < 1000000 or stops < 0 or found.tzinfo is None:
            return None
        if row.get('origin') != origin or row.get('destination') != destination:
            return None
        return dict(origin=origin, destination=destination, date=date.isoformat(), price=price, currency='CNY', stops=stops, found_at=found.isoformat(), source='Aviasales 缓存', baggage='未提供', taxes='供应商报价，税费待购票页核实')
    except (KeyError, ValueError, TypeError, OverflowError):
        return None

def main():
    token = os.getenv('TRAVELPAYOUTS_TOKEN')
    if not token:
        raise SystemExit('请先设置 TRAVELPAYOUTS_TOKEN 环境变量或仓库 Secret；已有票价不会被覆盖。')
    config = json.loads((ROOT/'public/data/config.json').read_text())
    start = dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    end = start + dt.timedelta(days=180)
    policy=json.loads((ROOT/'notifications.json').read_text())
    monitor_end=dt.date.fromisoformat(policy['depart_end'])+dt.timedelta(days=policy['max_stay'] if policy['mode']=='round' else 0)
    monitored={(h,d) for h in policy['homes'] for d in policy['destinations']}
    monitored|={(b,a) for a,b in list(monitored)}
    fares, errors = [], []
    query_count=0
    for origin,destination in config['routes']:
        route_end=max(end,monitor_end) if policy['enabled'] and (origin,destination) in monitored else end
        months=sorted({(start+dt.timedelta(days=n)).strftime('%Y-%m-01') for n in range((route_end-start).days+1)})
        for month in months:
            query_count+=1
            query = urllib.parse.urlencode(dict(origin=origin,destination=destination,month=month,currency='cny',one_way='true',show_to_affiliates='false',limit=31))
            request = urllib.request.Request('https://api.travelpayouts.com/v2/prices/month-matrix?'+query,headers={'X-Access-Token':token})
            payload = None
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(request,timeout=25) as response:
                        payload = json.load(response)
                    if payload.get('success') is not True or not isinstance(payload.get('data'),list):
                        raise ValueError('invalid response')
                    break
                except Exception:
                    payload = None
                    time.sleep(2**attempt)
            if payload is None:
                errors.append(dict(route=f'{origin}-{destination}',month=month,reason='请求失败；未使用旧报价补充'))
            else:
                for row in payload['data']:
                    fare = normalize(row,origin,destination,start,route_end)
                    if fare: fares.append(fare)
            time.sleep(0.35)
    if len(errors)==query_count:
        raise SystemExit('全部请求失败，保留上次数据；请检查 Token 权限和供应商状态。')
    unique={ (f['origin'],f['destination'],f['date'],f['stops']):f for f in sorted(fares,key=lambda x:x['price'],reverse=True) }
    result=dict(status='partial' if errors else 'ok',updated_at=dt.datetime.now(UTC).isoformat(),coverage_end=max(end,monitor_end if policy['enabled'] else end).isoformat(),fares=list(unique.values()),errors=errors)
    target=ROOT/'public/data/fares.json'
    temp=target.with_suffix('.tmp')
    temp.write_text(json.dumps(result,ensure_ascii=False,indent=2))
    temp.replace(target)
    print(f'已更新 {len(unique)} 条缓存报价，{len(errors)} 个查询失败。')

if __name__=='__main__': main()
