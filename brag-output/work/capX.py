import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("setSetting('commandBar', 'menu')")
await page.evaluate("p => goToOrOpen(p)", d + 'wave_pick.sql')
await page.wait_for_timeout(1200)
await page.evaluate("if (state.hidden === null) hidePane(1)")
CM = "[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror"
src = open("demo/wave_pick.sql", encoding="utf-8").read()
await page.evaluate("t => { const cm = " + CM + "; cm.setValue(t); cm.setCursor(0, 0); cm.focus(); cm.scrollTo(0, 0); }", src)
await page.wait_for_timeout(600)
await snap(page, s, 'capX/000.png')
btn = await page.evaluate("(() => { const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent && /Reformat/.test(b.title || b.dataset.title || '')); const r = b[0].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
print('btn', btn)
await page.mouse.click(btn[0], btn[1])
await page.wait_for_timeout(1000)
await snap(page, s, 'capX/001.png')
return await page.evaluate(CM + ".getValue()")
