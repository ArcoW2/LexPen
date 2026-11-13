import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'Stock.cs')
await page.wait_for_timeout(1500)
await page.evaluate("(() => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; cm.focus(); cm.setCursor(1, 1); })()")
K = [0]
async def shot(w=250):
    await page.wait_for_timeout(w); await snap(page, s, f'capG/{K[0]:03d}.png'); K[0] += 1
await shot(500)
for part in ['\n', 'void Pick(Bin b)', '\n', '{', '\n', 'if (b.Qty > 0)', '\n', '{', '\n', 'b.Qty--;', '\n', '}', '\n', '}']:
    if part == '\n': await page.keyboard.press('Enter')
    else: await page.keyboard.type(part)
    await shot(200)
return await page.evaluate("[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror.getValue()")
