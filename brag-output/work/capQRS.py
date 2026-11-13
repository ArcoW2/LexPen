import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
await page.evaluate("setSetting('indentSize', 4)")
await page.wait_for_timeout(500)
src = open('demo/PickService.cs', encoding='utf-8').read()
CM = "[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror"
await page.evaluate("t => { const cm = " + CM + "; cm.setValue(t); cm.setCursor(6, 4); cm.focus(); cm.scrollTo(0, 0); }", src)
async def shot(d, k, w=500):
    await page.wait_for_timeout(w); await snap(page, s, f'{d}/{k:03d}.png')
# next block: Start -> Pick -> Finish -> Count
await shot('capQ', 0)
for k in range(1, 4):
    await page.keyboard.press('Alt+PageDown'); await shot('capQ', k)
# move a block: the guard in Start down into Pick
await page.evaluate("(() => { const cm = " + CM + "; cm.setCursor(8, 0); cm.focus(); cm.scrollTo(0, 0); })()")
await shot('capR', 0)
for i in range(4): await page.keyboard.press('Shift+ArrowDown')
await shot('capR', 1)
await page.keyboard.press('Control+l'); await page.keyboard.press('ArrowDown'); await shot('capR', 2)
for k in range(3, 7):
    await page.keyboard.press('ArrowDown'); await shot('capR', k, 350)
await page.keyboard.press('Escape'); await shot('capR', 7)
# reformat: the Count method
await page.evaluate("(() => { const cm = " + CM + "; let a = 0; for (let i = 0; i < cm.lineCount(); i++) if (cm.getLine(i).includes('public int Count')) a = i; cm.setSelection({ line: a, ch: 0 }, { line: a + 11, ch: 0 }); cm.focus(); })()")
await shot('capS', 0)
btn = await page.evaluate("(() => { const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent && /Reformat/.test(b.title || b.dataset.title || '')); const r = b[0]?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()")
print('btn', btn)
await page.mouse.click(btn[0], btn[1]); await shot('capS', 1, 900)
return await page.evaluate(CM + ".getValue()")
