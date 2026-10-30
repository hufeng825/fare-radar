import copy
import datetime as dt
import importlib.util
import json
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('policy',Path(__file__).parents[1]/'scripts/policy.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
ROOT=Path(__file__).parents[1]
CFG=dict(enabled=True,homes=['HGH','SHA'],destinations=['OSA'],mode='round',depart_start='2027-01-01',depart_end='2027-12-31',budget_cny=1600,per_leg_budget_cny=800,direct_only=True,min_stay=3,max_stay=14,min_drop_cny=30,max_items_per_digest=10,max_digests_per_day=4,max_per_route=2,wechat_enabled=True,email_enabled=False)
ROUTES=json.loads((ROOT/'public/data/config.json').read_text())
class PolicyTests(unittest.TestCase):
 def test_owner_event_accepts_configuration_and_rejects_other_senders(self):
  e=dict(repository={'owner':{'login':'owner'}},sender={'login':'owner'},issue={'user':{'login':'owner'},'title':p.TITLE,'body':'```json\n'+json.dumps(CFG)+'\n```'})
  self.assertEqual(p.from_event(e,ROUTES),CFG)
  other=copy.deepcopy(e);other['sender']['login']='stranger'
  with self.assertRaises(ValueError):p.from_event(other,ROUTES)
  other=copy.deepcopy(e);other['issue']['user']['login']='stranger'
  with self.assertRaises(ValueError):p.from_event(other,ROUTES)
 def test_configuration_rejects_bad_dates_values_and_extra_fields(self):
  for change in [dict(budget_cny=-1),dict(homes=[]),dict(destinations=['XXX']),dict(depart_end='2035-01-01'),dict(min_stay=30,max_stay=3),dict(wechat_enabled='yes'),dict(token='not-allowed')]:
   with self.assertRaises((ValueError,TypeError)):p.validate(dict(CFG,**change),ROUTES,dt.date(2026,10,26))
 def test_next_year_policy_is_valid(self):
  self.assertEqual(p.validate(CFG,ROUTES,dt.date(2026,10,26))['destinations'],['OSA'])
 def test_custom_cities_are_validated_against_catalog_and_bounded(self):
  c=dict(CFG,destinations=['SDJ','BKK'])
  self.assertEqual(p.validate(c,ROUTES,dt.date(2026,10,26))['destinations'],['SDJ','BKK'])
  for values in [['HGH'],['SDJ','SDJ'],['not-a-city'],list(p.catalog())[:13]]:
   with self.assertRaises(ValueError):p.validate(dict(CFG,destinations=values),ROUTES,dt.date(2026,10,26))
 def test_custom_city_expands_both_collectable_directions_and_names(self):
  expanded=p.expand_config(ROUTES,dict(CFG,destinations=['SDJ']))
  pairs={tuple(r) for r in expanded['routes']}
  self.assertTrue({('HGH','SDJ'),('SDJ','HGH'),('SHA','SDJ'),('SDJ','SHA')}<=pairs)
  self.assertEqual(expanded['cities']['SDJ']['name'],'仙台')
  self.assertNotIn('SDJ',ROUTES['cities'])
