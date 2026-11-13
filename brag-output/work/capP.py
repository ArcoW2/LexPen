import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
await page.evaluate("setSetting('commandBar', 'menu')")
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'PickService.cs')
await page.wait_for_timeout(1200)
await page.evaluate("if (state.hidden === null) hidePane(1)")
src = open('demo/PickService.cs', encoding='utf-8').read()
await page.evaluate("t => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; cm.setValue(t); cm.setCursor(0, 0); cm.focus(); cm.scrollTo(0, 0); }", src)
K = [0]
async def shot(w=500):
    await page.wait_for_timeout(w); await snap(page, s, f'capP/{K[0]:03d}.png'); K[0] += 1
await shot()
await page.keyboard.press('Control+g'); await shot()
await page.keyboard.type('31', delay=120); await shot()
await page.keyboard.press('Enter'); await shot()
