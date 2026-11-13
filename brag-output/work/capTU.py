import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'release-notes.md')
await page.wait_for_timeout(1000)
await page.evaluate("if (state.hidden === null) hidePane(1)")
CM = "[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror"
src = open('demo/release-notes.md', encoding='utf-8').read()
await page.evaluate("t => { const cm = " + CM + "; if (cm.getValue() !== t) cm.setValue(t); cm.setCursor(2, 0); cm.focus(); cm.scrollTo(0, 0); }", src)
await page.evaluate("runAction('occurrences.clear')")
if not await page.evaluate("document.querySelector('.mm-switch-preview').classList.contains('mm-on') || document.querySelector('.mm-switch-preview').getAttribute('aria-pressed') === 'true'"):
    await page.click('.mm-switch-preview')
await page.wait_for_timeout(1500)
async def shot(d, k, w=600):
    await page.wait_for_timeout(w); await snap(page, s, f'{d}/{k:03d}.png')
# occurrences of "route"
await page.evaluate("(() => { const cm = " + CM + "; const l = cm.getLine(2); const a = l.indexOf('route'); cm.setSelection({ line: 2, ch: a }, { line: 2, ch: a + 5 }); cm.focus(); })()")
await shot('capT', 0)
await page.evaluate("runAction('occurrences.show')"); await shot('capT', 1, 1000)
await page.evaluate("runAction('occurrences.clear')")
await page.evaluate("(() => { const cm = " + CM + "; cm.setCursor(0, 0); cm.focus(); })()")
# find "pick"
await shot('capU', 0)
await page.keyboard.press('Control+f'); await shot('capU', 1)
for i, ch in enumerate('pick'):
    await page.keyboard.type(ch); await shot('capU', 2 + i, 300)
await page.keyboard.press('F3'); await shot('capU', 6)
await page.keyboard.press('F3'); await shot('capU', 7)
await page.keyboard.press('Escape')
