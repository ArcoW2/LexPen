import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("([a, b]) => startCompare({ path: a }, { path: b })", [d + 'pick_route_old.sql', d + 'pick_route.sql'])
await page.wait_for_timeout(2000)
await snap(page, s, 'capD/000.png')
