import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'RouteBuilder.cs')
await page.wait_for_timeout(1000)
# capJ.py left it in Hex: back to the text
if not await page.evaluate("!![...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent)"):
    await page.evaluate("runAction('hex.toggle')")
    await page.wait_for_timeout(1000)
await page.evaluate("(() => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; const l = cm.getLine(4); cm.focus(); cm.setCursor(4, l.indexOf('<Bin>') + 2); })()")
await page.wait_for_timeout(600)
await snap(page, s, 'capL/000.png')
await page.keyboard.press('F12')
await page.wait_for_timeout(2500)
await snap(page, s, 'capL/001.png')
return await page.evaluate("[state.hidden, panes.map(p => p.active && docName(p.active.doc))]")
