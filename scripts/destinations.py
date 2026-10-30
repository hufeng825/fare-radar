"""Trusted city catalog and route expansion shared by policy, collection and alerts."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_DESTINATIONS = 12

def catalog():
    return json.loads((ROOT/'public/data/destinations.json').read_text())['cities']

def expand_config(config, policy, known=None):
    known = catalog() if known is None else known
    cities = dict(config['cities'])
    routes = {tuple(r) for r in config['routes']}
    for code in policy.get('destinations', []):
        if code not in known and code not in cities:
            raise ValueError('Unknown destination')
        if code in known:
            cities[code] = dict(name=known[code]['name'], region=known[code]['region'])
        for home in policy['homes']:
            if home == code:
                raise ValueError('Origin cannot be destination')
            routes.update(((home, code), (code, home)))
    return dict(config, cities=cities, routes=[list(r) for r in sorted(routes)])
