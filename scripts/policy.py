"""Validate owner-authored configuration and sync it through GitHub (no browser tokens)."""
import base64
import datetime as dt
import json
import os
from pathlib import Path
import re
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
TITLE='候鸟配置：更新监控规则'
FIELDS={'enabled','homes','destinations','mode','depart_start','depart_end','budget_cny','per_leg_budget_cny','direct_only','min_stay','max_stay','min_drop_cny','max_items_per_digest','max_digests_per_day','max_per_route','wechat_enabled','email_enabled'}

def validate(value,route_config,today=None):
    today=today or dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date()
    if not isinstance(value,dict) or set(value)!=FIELDS: raise ValueError('Invalid configuration fields')
    for k in ['enabled','direct_only','wechat_enabled','email_enabled']:
        if type(value[k]) is not bool: raise ValueError('Expected boolean')
    for k,lo,hi in [('budget_cny',1,100000),('per_leg_budget_cny',1,100000),('min_stay',1,90),('max_stay',1,90),('min_drop_cny',1,10000),('max_items_per_digest',1,20),('max_digests_per_day',1,4),('max_per_route',1,5)]:
        if type(value[k]) is not int or not lo<=value[k]<=hi: raise ValueError('Invalid numeric setting')
    if value['mode'] not in ['out','back','round'] or value['min_stay']>value['max_stay']: raise ValueError('Invalid trip mode/stay')
    for k in ['homes','destinations']:
        if not isinstance(value[k],list) or not value[k] or len(value[k])!=len(set(value[k])): raise ValueError('Choose unique cities')
    if not set(value['homes'])<= {'HGH','SHA'} or not set(value['destinations'])<=set(route_config['cities'])-{'HGH','SHA'}: raise ValueError('Invalid city')
    configured={tuple(r) for r in route_config['routes']}
    if not any((h,d) in configured for h in value['homes'] for d in value['destinations']): raise ValueError('No configured routes')
    a=dt.date.fromisoformat(value['depart_start']);b=dt.date.fromisoformat(value['depart_end'])
    if a>b or b>today+dt.timedelta(days=730): raise ValueError('Dates must be ordered and within 730 days')
    # Past starts remain valid for a saved fixed-date policy; expired policies simply find no opportunities.
    return value

def api(path,method='GET',data=None):
    repo=os.environ['GITHUB_REPOSITORY'];token=os.environ['GITHUB_TOKEN']
    req=urllib.request.Request('https://api.github.com/repos/'+repo+'/'+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'})
    with urllib.request.urlopen(req,timeout=30) as r:return json.load(r)

def from_event(event,route_config):
    owner=event['repository']['owner']['login']
    issue=event.get('issue',{})
    if event['sender']['login']!=owner or issue.get('user',{}).get('login')!=owner or issue.get('title')!=TITLE or 'pull_request' in issue: raise ValueError('Only owner-authored configuration issues are allowed')
    body=issue.get('body','')
    if len(body)>12000: raise ValueError('Configuration too large')
    block=re.search(r'```json\s*\n(.*?)\n```',body,re.S)
    if not block:raise ValueError('Missing JSON configuration')
    return validate(json.loads(block.group(1)),route_config)

def main():
    routes=json.loads((ROOT/'public/data/config.json').read_text())
    cfg=json.loads((ROOT/'notifications.json').read_text())
    if os.getenv('GITHUB_REPOSITORY'):
        branch=os.getenv('GITHUB_DEFAULT_BRANCH','main')
        current=api('contents/notifications.json?ref='+branch)
        if os.getenv('GITHUB_EVENT_NAME')=='issues':
            event=json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
            cfg=from_event(event,routes)
            api('contents/notifications.json','PUT',dict(branch=branch,sha=current['sha'],message='Apply monitoring policy from owner configuration issue',content=base64.b64encode(json.dumps(cfg,ensure_ascii=False,indent=2).encode()).decode()))
        else:cfg=validate(json.loads(base64.b64decode(current['content'])),routes)
    else:cfg=validate(cfg,routes)
    (ROOT/'notifications.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2))
    (ROOT/'public/data/monitor.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2))
    print('Monitoring configuration validated and synchronized.')

if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit('Monitoring configuration rejected or could not be saved. No configuration applied; check owner identity, dates, budget and repository permissions.')
