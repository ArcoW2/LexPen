import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
await page.evaluate("setSetting('themeDark','dark'); setSetting('theme','dark')")
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'stock.sql')
await page.wait_for_timeout(1500)
await page.evaluate("(() => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; cm.setValue('-- Stock per bin' + String.fromCharCode(10)); cm.focus(); cm.setCursor(1, 0); })()")
K = [0]
async def shot(w=250):
    await page.wait_for_timeout(w); await snap(page, s, f'capF/{K[0]:03d}.png'); K[0] += 1
await shot(600)
for ch in 'SEL':
    await page.keyboard.type(ch); await shot()
await page.keyboard.press('Control+Space'); await shot(600)
await page.keyboard.press('Enter'); await shot()
for ch in ' bin, item, qty':
    await page.keyboard.type(ch)
await shot()
await page.keyboard.press('Enter')
for ch in 'FR':
    await page.keyboard.type(ch)
await shot()
await page.keyboard.press('Control+Space'); await shot(600)
await page.keyboard.press('Enter'); await page.keyboard.type(' stock'); await shot()
return K[0]
