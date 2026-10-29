"""Server-side notifications. No secrets or recipient addresses in state/public assets."""
import argparse
import base64
import datetime as dt
from email.message import EmailMessage
import hashlib
import json
import math
import os
from pathlib import Path
import re
import smtplib
import ssl
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BRANCH = 'notification-state'
STATE_PATH = '.notification-state/state.json'
TZ = dt.timezone(dt.timedelta(hours=8))

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def key(fare):
    parts=[str(fare[k]) for k in ('origin','destination','date','stops')]
    if fare.get('returnFare'):parts += [fare['returnFare']['date'],str(fare['returnFare']['stops'])]
    return digest('|'.join(parts))

def candidates(fares, config, routes, now):
    first=now.astimezone(TZ).date()
    last=first+dt.timedelta(days=config.get('horizon_days',90))
    if config.get('depart_end'):
        first=max(first,dt.date.fromisoformat(config['depart_start']))
        last=dt.date.fromisoformat(config['depart_end'])+dt.timedelta(days=config.get('max_stay',0) if config.get('mode')=='round' else 0)
    cap=min(config['budget_cny'],config.get('per_leg_budget_cny',config['budget_cny']))
    cheapest={}
    for fare in fares:
        try:
            price=float(fare['price'])
            date=dt.date.fromisoformat(fare['date'])
            found=dt.datetime.fromisoformat(fare['found_at'].replace('Z','+00:00'))
            fresh=0 <= (now-found).total_seconds() <= 48*3600
            if (fare['origin'],fare['destination']) not in routes or fare['currency']!='CNY' or not math.isfinite(price) or not 0<price<=cap or not first<=date<=last or not fresh or (config['direct_only'] and fare['stops']!=0):
                continue
            k=key(fare)
            if k not in cheapest or price<cheapest[k]['price']:
                cheapest[k]=fare
        except (KeyError,ValueError,TypeError,OverflowError):
            continue
    available=sorted(cheapest.values(),key=lambda f:f['price'])
    if not config.get('mode'):return available
    homes=config['homes'];destinations=config['destinations'];mode=config['mode']
    outbound=[f for f in available if f['origin'] in homes and f['destination'] in destinations and f['date']<=config['depart_end']]
    if mode=='out':return outbound
    if mode=='back':return [f for f in available if f['origin'] in destinations and f['destination'] in homes and f['date']<=config['depart_end']]
    pairs=[]
    for a in outbound:
        for b in available:
            if b['origin']!=a['destination'] or b['destination']!=a['origin']:continue
            days=(dt.date.fromisoformat(b['date'])-dt.date.fromisoformat(a['date'])).days
            if config['min_stay']<=days<=config['max_stay'] and a['price']+b['price']<=config['budget_cny']:
                pairs.append(dict(a,price=a['price']+b['price'],outbound_price=a['price'],returnFare=b))
    return sorted(pairs,key=lambda f:f['price'])

def select(fares, channel, config, today):
    if channel.get('day')==today and channel.get('digests',0)>=config['max_digests_per_day']:
        return []
    sent=channel.get('sent',{})
    picked=[];counts={}
    for f in fares:
        if key(f) in sent and sent[key(f)]['price']-f['price']<config['min_drop_cny']:continue
        route=(f['origin'],f['destination'])
        if counts.get(route,0)>=config.get('max_per_route',config['max_items_per_digest']):continue
        picked.append(f);counts[route]=counts.get(route,0)+1
        if len(picked)>=config['max_items_per_digest']:break
    return picked

def mark(channel, fares, today):
    count=channel.get('digests',0) if channel.get('day')==today else 0
    sent={k:v for k,v in channel.get('sent',{}).items() if v['date']>=today}
    for f in fares: sent[key(f)]=dict(price=f['price'],date=f['date'])
    channel.update(day=today,digests=count+1,sent=sent)

def google_link(origin,destination,date,return_date=None):
    def var(n):
        a=[]
        while n>127:a.append((n&127)|128);n>>=7
        return bytes(a+[n])
    def msg(k,b):return var(k*8+2)+var(len(b))+b
    def string(k,t):return msg(k,t.encode())
    # SHA denotes Shanghai metro in provider data; include Pudong and Hongqiao.
    def place(code):return b'\x08\x03'+string(2,'/m/06wjf') if code=='SHA' else b'\x08\x01'+string(2,code)
    def leg(a,b,d):return msg(3,string(2,d)+msg(13,place(a))+msg(14,place(b)))
    data=b'\x08\x1c\x10\x02'+leg(origin,destination,date)+(leg(destination,origin,return_date) if return_date else b'')+bytes([64,1,72,1,152,1,1 if return_date else 2])
    return 'https://www.google.com/travel/flights/search?'+urllib.parse.urlencode(dict(tfs=base64.urlsafe_b64encode(data).decode().rstrip('='),hl='zh-CN',curr='CNY',gl='CN'))

def message(fares,cities,test=False):
    if test:
        return '候鸟机票雷达 · 通道测试','这是一条推送通道测试消息，不含真实机票报价。\n收到后请回到 Codex 确认邮件/微信实际送达。'
    best=fares[0]
    arrow='⇄' if best.get('returnFare') else '→'
    title=f"¥{best['price']:g} {cities[best['origin']]['name']}{arrow}{cities[best['destination']]['name']} {best['date']} · {len(fares)}条低价"
    lines=['以下是近期用户搜索缓存报价，并非实时可购保证。人民币/成人经济舱；税费、行李、手续费请在购票页确认。','']
    for f in fares:
        a=cities[f['origin']]['name'];b=cities[f['destination']]['name']
        query=urllib.parse.quote(f"{a} {f['origin']} to {b} {f['destination']} {f['date']} one way")
        if f.get('returnFare'):
            back=f['returnFare'];back_query=urllib.parse.quote(f"{b} {f['destination']} to {a} {f['origin']} {back['date']} one way")
            lines.extend([f"{a} ⇄ {b} | {f['date']} 出发 / {back['date']} 返回 | 往返 ¥{f['price']:g}",f"去程 ¥{f['outbound_price']:g} / 返程 ¥{back['price']:g}",'往返：'+google_link(f['origin'],f['destination'],f['date'],back['date']),'去程：'+google_link(f['origin'],f['destination'],f['date']),'返程：'+google_link(back['origin'],back['destination'],back['date']),''])
        else:
            lines.extend([f"{a} → {b} | {f['date']} | ¥{f['price']:g} | {'直飞' if f['stops']==0 else str(f['stops'])+' 次中转'}",f"缓存发现时间：{f['found_at']}",google_link(f['origin'],f['destination'],f['date']),''])
    lines.append('相同行程不重复提醒；达到配置降价幅度才重发。往返组合是两张独立单程票，购票前请分别核实。')
    return title,'\n'.join(lines)

def send_email(title,body):
    msg=EmailMessage()
    msg['Subject']=title
    msg['From']=os.environ['SMTP_USER']
    msg['To']=os.environ['EMAIL_TO']
    msg.set_content(body)
    with smtplib.SMTP_SSL(os.getenv('SMTP_HOST','smtp.qq.com'),int(os.getenv('SMTP_PORT','465')),timeout=30,context=ssl.create_default_context()) as server:
        server.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
        refused=server.send_message(msg)
        if refused: raise RuntimeError('Recipient refused')

def send_wechat(title,body):
    token=os.environ['SERVERCHAN_SENDKEY']
    if not re.fullmatch(r'SCT[A-Za-z0-9]+',token):
        raise ValueError('Expect ServerChan Turbo SCT SendKey')
    # Body limited to avoid provider payload limits; email includes full digest.
    payload=urllib.parse.urlencode(dict(title=title,desp=body[:12000])).encode()
    req=urllib.request.Request('https://sctapi.ftqq.com/'+token+'.send',data=payload,method='POST')
    with urllib.request.urlopen(req,timeout=30) as response:
        result=json.load(response)
    if result.get('code')!=0: raise RuntimeError('Provider rejected notification')

class State:
    def __init__(self,path=None):
        self.path=Path(path) if path else None
        self.repo=os.getenv('GITHUB_REPOSITORY')
        self.token=os.getenv('GITHUB_TOKEN')
        self.sha=None
        if not self.path and not (self.repo and self.token):
            raise RuntimeError('State requires --state path or GitHub repository credentials')
    def api(self,path,method='GET',data=None):
        req=urllib.request.Request('https://api.github.com/repos/'+self.repo+'/'+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+self.token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=30) as response: return json.load(response)
    def load(self):
        if self.path:
            return json.loads(self.path.read_text()) if self.path.exists() else {'version':1,'channels':{}}
        try: self.api('git/ref/heads/'+BRANCH)
        except urllib.error.HTTPError as exc:
            if exc.code!=404: raise
            base=self.api('git/ref/heads/'+os.getenv('GITHUB_DEFAULT_BRANCH','main'))['object']['sha']
            self.api('git/refs','POST',dict(ref='refs/heads/'+BRANCH,sha=base))
        try:
            result=self.api('contents/'+STATE_PATH+'?ref='+BRANCH)
        except urllib.error.HTTPError as exc:
            if exc.code==404: return {'version':1,'channels':{}}
            raise
        self.sha=result['sha']
        return json.loads(base64.b64decode(result['content']))
    def save(self,state):
        content=json.dumps(state,ensure_ascii=False,indent=2)
        if self.path:
            self.path.parent.mkdir(parents=True,exist_ok=True)
            tmp=self.path.with_suffix('.tmp');tmp.write_text(content);tmp.replace(self.path)
        else:
            payload=dict(message='Persist notification deduplication state',content=base64.b64encode(content.encode()).decode(),branch=BRANCH)
            if self.sha: payload['sha']=self.sha
            result=self.api('contents/'+STATE_PATH,'PUT',payload)
            self.sha=result['content']['sha']

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--state',help='Local persistent state file; never put under public/')
    parser.add_argument('--test',action='store_true',help='Send a channel test, no fabricated fares')
    args=parser.parse_args()
    cfg=json.loads((ROOT/'notifications.json').read_text())
    routecfg=json.loads((ROOT/'public/data/config.json').read_text())
    if not cfg.get('enabled',True):
        print('Monitoring paused by saved policy.');return
    enabled=[]
    if cfg.get('email_enabled',True) and all(os.getenv(k) for k in ['SMTP_USER','SMTP_PASSWORD','EMAIL_TO']):
        enabled.append(('email',digest(os.environ['EMAIL_TO']+os.environ['SMTP_USER']),send_email))
    if cfg.get('wechat_enabled',True) and os.getenv('SERVERCHAN_SENDKEY'):
        enabled.append(('wechat',digest(os.environ['SERVERCHAN_SENDKEY']),send_wechat))
    if not enabled:
        print('No notification channels configured; skipped.');return
    now=dt.datetime.now(dt.timezone.utc);today=now.astimezone(TZ).date().isoformat()
    store=State(args.state);state=store.load()
    if state.get('version')!=1 or not isinstance(state.get('channels'),dict):
        raise RuntimeError('Invalid state; refusing to reset and duplicate notifications')
    # Verify persistence before sending. If a later write fails, stop further sends.
    store.save(state)
    if args.test: fares=[]
    else:
        snapshot=json.loads((ROOT/'public/data/fares.json').read_text())
        if snapshot.get('status') not in ['ok','partial']:
            print('No configured fare snapshot; skipped.');return
        updated=dt.datetime.fromisoformat(snapshot['updated_at'].replace('Z','+00:00'))
        if not 0<=(now-updated).total_seconds()<=24*3600:
            print('Snapshot stale; skipped.');return
        fares=candidates(snapshot['fares'],cfg,{tuple(r) for r in routecfg['routes']},now)
    failures=0
    for name,target,send in enabled:
        channel=state['channels'].setdefault(name+':'+target,{})
        picked=select(fares,channel,cfg,today)
        limited=channel.get('day')==today and channel.get('digests',0)>=cfg['max_digests_per_day']
        if limited or (not picked and not args.test):
            print(name+': no new eligible opportunities or daily limit reached.');continue
        title,body=message(picked,routecfg['cities'],args.test)
        try: send(title,body)
        except Exception:
            failures+=1
            print(name+': delivery failed; state not marked, inspect channel configuration.');continue
        mark(channel,picked,today)
        store.save(state)
        print(name+': provider accepted notification; confirm receipt on your device.')
    if failures: raise SystemExit(1)

if __name__=='__main__':
    try: main()
    except Exception:
        # Exceptions can contain SendKey URLs, SMTP addresses or auth details.
        raise SystemExit('Notification failed; no sensitive exception details logged. Check configuration/state permissions.')
