import sys, asyncio; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
CM = "[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror"
# The note dialog for "Skip empty bins" (release-notes.md is the active tab, after capTU.py)
await page.evaluate("(() => { const cm = " + CM + "; for (let i = 0; i < cm.lineCount(); i++) { const a = cm.getLine(i).indexOf('Skip empty bins'); if (a >= 0) { cm.setSelection({ line: i, ch: a }, { line: i, ch: a + 15 }); break; } } cm.focus(); })()")
await page.wait_for_timeout(400)
asyncio.ensure_future(page.evaluate("runAction('highlight.note')"))
await page.wait_for_timeout(1000)
K = [0]
async def shot(w=400):
    await page.wait_for_timeout(w); await snap(page, s, f'capV/{K[0]:03d}.png'); K[0] += 1
await shot()                                   # 000: the dialog, empty
words = 'Bins with nothing left are not on the route.'.split(' ')
for i, w in enumerate(words):
    await page.keyboard.type(w + ('' if i == len(words) - 1 else ' '), delay=25)
    if i % 2 == 1 or i == len(words) - 1: await shot(150)
await page.keyboard.press('Control+Enter'); await page.wait_for_timeout(300)
await page.evaluate("(() => { const cm = " + CM + "; cm.setCursor(0, 0); })()")
await shot(900)                                # the highlight in editor and preview
async def note(text, find):
    await page.evaluate("f => { const cm = " + CM + "; for (let i = 0; i < cm.lineCount(); i++) { const a = cm.getLine(i).indexOf(f); if (a >= 0) { cm.setSelection({ line: i, ch: a }, { line: i, ch: a + f.length }); break; } } cm.focus(); }", find)
    p = asyncio.ensure_future(page.evaluate("runAction('highlight.note')"))
    await page.wait_for_timeout(700)
    await page.keyboard.type(text, delay=5)
    await page.keyboard.press('Control+Enter'); await page.wait_for_timeout(500)
await note('From the location table: aisle, then bay.', 'Aisle order from the location table')
await note('Night shift first, then Saturday.', 'Weekend shift test')
await page.evaluate("(() => { const cm = " + CM + "; cm.setCursor(0, 0); cm.focus(); })()")
await shot(900)                                # three notes
