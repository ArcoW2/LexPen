import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'runbook.md')
await page.wait_for_timeout(1500)
on = await page.evaluate("document.querySelector('.mm-switch-preview').classList.contains('mm-on')")
if not on: await page.click('.mm-switch-preview')
await page.wait_for_timeout(1500)
CM = "[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror"
await page.evaluate("(() => { const cm = " + CM + "; cm.setCursor(0, 0); cm.focus(); cm.scrollTo(0, 0); })()")
await page.wait_for_timeout(800)
await snap(page, s, 'capY/000.png')
await page.evaluate("(() => { const cm = " + CM + "; cm.setCursor(cm.lineCount() - 2, 0); cm.focus(); })()")
await page.wait_for_timeout(1200)
await snap(page, s, 'capY/001.png')
