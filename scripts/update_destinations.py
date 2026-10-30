"""Refresh public city lookup from Travelpayouts reference data. No credentials needed."""
import datetime as dt
import json
from pathlib import Path
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
def build(cities, airports, countries):
    countries={r['code']:r['name'] for r in countries}
    serving={r['city_code'] for r in airports if r.get('flightable') and r.get('city_code')}
    result={}
    for row in cities:
        code=row['code']
        if not (row.get('has_flightable_airport') or code in serving):continue
        name=row.get('name') or row.get('name_translations',{}).get('en') or code
        result[code]=dict(name=name, en=row.get('name_translations',{}).get('en',name), region=countries.get(row['country_code'],row['country_code']), airports=[])
    for airport in airports:
        city=result.get(airport.get('city_code'))
        if city is not None and airport.get('flightable') and airport['code'] not in city['airports']:
            city['airports'].append(airport['code'])
    return dict(updated_at=dt.date.today().isoformat(),source='https://api.travelpayouts.com/data/zh-CN/cities.json',cities=dict(sorted(result.items())))

def main():
    def get(path):
        with urllib.request.urlopen('https://api.travelpayouts.com/data/'+path+'.json',timeout=30) as response:return json.load(response)
    result=build(get('zh-CN/cities'),get('airports'),get('zh-CN/countries'))
    (ROOT/'public/data/destinations.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    print(f"Updated {len(result['cities'])} city records")

if __name__=='__main__':main()
