"""Custom watchlist survives the validation -> provider rows -> alert pipeline."""
import datetime as dt
import json
from pathlib import Path
import unittest
from scripts import collect, destinations, notify, policy

ROOT=Path(__file__).resolve().parents[1]

class CustomDestinationTests(unittest.TestCase):
 def test_custom_roundtrip_is_eligible_and_notification_names_are_resolved(self):
  cfg=json.loads((ROOT/'notifications.json').read_text())
  cfg.update(destinations=['SDJ'],depart_start='2027-01-01',depart_end='2027-12-31',budget_cny=1600,per_leg_budget_cny=800,mode='round')
  routes=json.loads((ROOT/'public/data/config.json').read_text())
  policy.validate(cfg,routes,dt.date(2026,10,30))
  expanded=destinations.expand_config(routes,cfg)
  def row(a,b,date,value):
   return collect.normalize(dict(origin=a,destination=b,depart_date=date,value=value,found_at='2026-10-30T01:00:00Z',number_of_changes=0,actual=True),a,b,dt.date(2026,10,30),dt.date(2028,1,14))
  fares=[row('HGH','SDJ','2027-02-01',700),row('SDJ','HGH','2027-02-08',650),row('HGH','CJU','2027-02-01',200),row('CJU','HGH','2027-02-08',200)]
  picked=notify.candidates(fares,cfg,{tuple(r) for r in expanded['routes']},dt.datetime(2026,10,30,2,tzinfo=dt.timezone.utc))
  self.assertEqual(len(picked),1)
  self.assertEqual(picked[0]['price'],1350)
  title,body=notify.message(picked,expanded['cities'])
  self.assertIn('仙台',title)
  self.assertNotIn('济州',body)
  self.assertIn('2027-02-08',body)
  self.assertIn('curr=CNY',body)
