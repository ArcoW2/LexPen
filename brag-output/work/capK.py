import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'stock.csv')
await page.wait_for_timeout(1000)
src = open('demo/stock.csv', encoding='utf-8').read()
await page.evaluate("t => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; cm.setValue(t); cm.setCursor(0, 0); }", src)
await page.wait_for_timeout(1200)
K = [0]
async def shot(w=300):
    await page.wait_for_timeout(w); await snap(page, s, f'capK/{K[0]:03d}.png'); K[0] += 1
await shot()
box = None
for f in page.frames:
    try:
        box = await f.evaluate("""() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
          while ((n = w.nextNode())) if (n.nodeValue.trim() === 'Crate' && n.parentElement.offsetParent && !n.parentElement.closest('.CodeMirror')) {
            const r = n.parentElement.getBoundingClientRect(); return [r.x + 4, r.y + r.height / 2, n.parentElement.className]; } return null; }""")
    except Exception: pass
    if box: break
print('cell', box)
await page.mouse.dblclick(box[0], box[1])
await shot(500)
for i in range(5): await page.keyboard.press('Shift+ArrowRight')
await shot()
for ch in 'Drum':
    await page.keyboard.type(ch); await shot(350)
return await page.evaluate("[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror.getLine(3)")
