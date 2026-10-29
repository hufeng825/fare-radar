import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('notify',Path(__file__).parents[1]/'scripts/notify.py')
n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
NOW=dt.datetime(2026,10,26,12,tzinfo=dt.timezone.utc)
CONFIG=dict(budget_cny=800,direct_only=True,horizon_days=90,min_drop_cny=30,max_items_per_digest=20,max_digests_per_day=4)
FARE=dict(origin='HGH',destination='OSA',date='2026-11-01',price=400,currency='CNY',stops=0,found_at='2026-10-26T10:00:00Z')
class NotifyTests(unittest.TestCase):
 def test_candidates_reject_old_wrong_currency_and_unconfigured_routes(self):
  rows=[FARE,dict(FARE,found_at='2026-10-20T00:00:00Z'),dict(FARE,currency='RUB'),dict(FARE,origin='LON'),dict(FARE,price=float('nan')),dict(FARE,stops=1)]
  self.assertEqual(n.candidates(rows,CONFIG,{('HGH','OSA')},NOW),[FARE])
 def test_persistent_dedupe_price_drop_and_daily_cap(self):
  channel={};today='2026-10-26'
  n.mark(channel,[FARE],today)
  with tempfile.TemporaryDirectory() as folder:
   store=n.State(Path(folder)/'state.json');store.save(dict(channels={'email:hash':channel}));restored=store.load()['channels']['email:hash']
  self.assertEqual(n.select([FARE,dict(FARE,price=380)],restored,CONFIG,today),[])
  self.assertEqual(len(n.select([dict(FARE,price=370)],restored,CONFIG,today)),1)
  restored['digests']=4
  self.assertEqual(n.select([dict(FARE,price=300)],restored,CONFIG,today),[])
  self.assertEqual(len(n.select([dict(FARE,price=300)],restored,CONFIG,'2026-10-27')),1)
 def test_channel_failure_does_not_mark_or_resend_successful_channel(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'public/data').mkdir(parents=True)
   (root/'notifications.json').write_text(json.dumps(CONFIG))
   (root/'public/data/config.json').write_text(json.dumps(dict(routes=[['HGH','OSA']],cities={'HGH':{'name':'杭州'},'OSA':{'name':'大阪'}})))
   current=dt.datetime.now(dt.timezone.utc);fare=dict(FARE,date=(current.astimezone(n.TZ).date()+dt.timedelta(days=5)).isoformat(),found_at=current.isoformat())
   (root/'public/data/fares.json').write_text(json.dumps(dict(status='ok',updated_at=current.isoformat(),fares=[fare])))
   args=['notify','--state',str(root/'state.json')]
   env=dict(SMTP_USER='sender@example.com',SMTP_PASSWORD='private-password',EMAIL_TO='receiver@example.com',SERVERCHAN_SENDKEY='SCTtest')
   with patch.object(n,'ROOT',root),patch('sys.argv',args),patch.dict(n.os.environ,env,clear=True),patch.object(n,'send_email') as email,patch.object(n,'send_wechat',side_effect=RuntimeError('private-url')) as wechat:
    with self.assertRaises(SystemExit):n.main()
    self.assertEqual(email.call_count,1)
    state=(root/'state.json').read_text()
    self.assertNotIn('receiver@example.com',state);self.assertNotIn('private-password',state);self.assertNotIn('SCTtest',state)
    with self.assertRaises(SystemExit):n.main()
    self.assertEqual(email.call_count,1);self.assertEqual(wechat.call_count,2)
 def test_serverchan_error_response_is_not_success(self):
  with patch.dict(n.os.environ,{'SERVERCHAN_SENDKEY':'SCTtest'}),patch.object(n.urllib.request,'urlopen') as request:
   request.return_value.__enter__.return_value.read.return_value=b'{"code":40001}'
   with self.assertRaises(RuntimeError):n.send_wechat('test','test')
 def test_dry_template_does_not_invent_fares(self):
  title,body=n.message([],{},test=True)
  self.assertIn('通道测试',title);self.assertNotIn('¥',body)

 def test_real_alert_links_request_chinese_and_cny(self):
  title,body=n.message([FARE],{'HGH':{'name':'杭州'},'OSA':{'name':'大阪'}})
  self.assertIn('hl=zh-CN&curr=CNY&gl=CN',body)

 def test_shanghai_links_include_both_airports_in_both_directions(self):
  import base64,urllib.parse
  u=urllib.parse.urlparse(n.google_link('SHA','OSA','2027-02-23','2027-03-03'))
  t=urllib.parse.parse_qs(u.query)['tfs'][0]
  data=base64.urlsafe_b64decode(t+'='*(-len(t)%4))
  self.assertEqual(data.count(b'/m/06wjf'),2)
  self.assertNotIn(b'SHA',data)
  self.assertIn(b'\x08\x03\x12\x08/m/06wjf',data)

 def test_round_policy_rejects_jeju_wrong_year_and_over_budget_legs(self):
  config=dict(CONFIG,mode='round',homes=['HGH','SHA'],destinations=['OSA'],depart_start='2027-01-01',depart_end='2027-12-31',min_stay=3,max_stay=14,per_leg_budget_cny=800,budget_cny=1600)
  a=dict(FARE,date='2027-11-01',price=750)
  b=dict(FARE,origin='OSA',destination='HGH',date='2027-11-07',price=600)
  c=dict(a,destination='CJU',price=200)
  routes={('HGH','OSA'),('OSA','HGH'),('HGH','CJU')}
  pairs=n.candidates([a,b,c,dict(a,date='2026-11-01'),dict(b,price=900)],config,routes,NOW)
  self.assertEqual(len(pairs),1)
  self.assertEqual(pairs[0]['price'],1350)
  self.assertEqual(pairs[0]['returnFare']['date'],'2027-11-07')
  self.assertNotEqual(n.key(pairs[0]),n.key(a))
  title,body=n.message(pairs,{'HGH':{'name':'杭州'},'OSA':{'name':'大阪'}})
  self.assertIn('⇄',title);self.assertIn('返程：',body);self.assertIn('2027-11-07',body)
 def test_digest_balances_routes(self):
  a=dict(FARE,date='2026-11-01');b=dict(FARE,date='2026-11-02');c=dict(FARE,destination='TYO')
  picked=n.select([a,b,c],{},dict(CONFIG,max_per_route=1),'2026-10-26')
  self.assertEqual([f['destination'] for f in picked],['OSA','TYO'])
