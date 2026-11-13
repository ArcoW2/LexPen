import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'stock.txt')
await page.wait_for_timeout(1500)
await page.evaluate("(() => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; setColumnMode(false); cm.setValue(['bin     wh     item        qty','A-01           pallet      12','A-02           carton      40','B-07           crate        6','B-09           carton      18','C-11           pallet       3'].join(String.fromCharCode(10))); cm.focus(); cm.setCursor(1, 8); })()")
K = [0]
async def shot(w=250):
    await page.wait_for_timeout(w); await snap(page, s, f'capH/{K[0]:03d}.png'); K[0] += 1
await shot(500)
await page.keyboard.press('Alt+c'); await shot()

for i in range(4):
    await page.keyboard.press('Shift+ArrowDown'); await shot(150)
await page.keyboard.press('Insert')
for ch in 'WH1':
    await page.keyboard.type(ch); await shot(150)
await page.wait_for_timeout(300)
r = await page.evaluate("[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror.getValue()")
await page.keyboard.press('Insert')
await page.evaluate('setColumnMode(false)')
return r
