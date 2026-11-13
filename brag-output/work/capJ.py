import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("hidePane(1)")
await page.wait_for_timeout(800)
await page.evaluate("p => goToOrOpen(p)", d + 'pick-list-wave-14.pdf')
await page.wait_for_timeout(3500)
await snap(page, s, 'capJ/000.png')
await page.evaluate("p => goToOrOpen(p)", d + 'RouteBuilder.cs')
await page.wait_for_timeout(1200)
await snap(page, s, 'capJ/001.png')
await page.evaluate("runAction('hex.toggle')")
await page.wait_for_timeout(1500)
await snap(page, s, 'capJ/002.png')
