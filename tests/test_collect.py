import importlib.util
from pathlib import Path
import datetime as dt
import unittest
spec=importlib.util.spec_from_file_location('collect',Path(__file__).parents[1]/'scripts/collect.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class NormalizeTests(unittest.TestCase):
 def test_valid_and_invalid_provider_rows(self):
  row=dict(origin='HGH',destination='OSA',depart_date='2026-11-01',value=388,found_at='2026-10-26T00:00:00Z',number_of_changes=0,actual=True)
  f=lambda r:module.normalize(r,'HGH','OSA',dt.date(2026,10,26),dt.date(2027,1,1))
  self.assertEqual(f(row)['currency'],'CNY')
  for change in [dict(value=-1),dict(value=float('nan')),dict(return_date='2026-11-10'),dict(actual=False),dict(origin='SHA'),dict(found_at='bad')]:
   self.assertIsNone(f(dict(row,**change)))
