import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
CM = "[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror"
kr = open('demo/PickService.cs', encoding='utf-8').read()
import re
kr = re.sub(r'\)\n(\s*)\{\n', ') {\n', kr)          # K&R: the brace on the header's line
kr = re.sub(r'(class PickService)\n\{', r'\1 {', kr)
print(kr)
await page.evaluate("t => { const cm = " + CM + "; cm.setValue(t); let a = 0; for (let i = 0; i < cm.lineCount(); i++) if (cm.getLine(i).includes('void Start')) { a = i; break; } cm.setCursor(a, 4); cm.focus(); cm.scrollTo(0, 0); }", kr)
for k in range(4):
    if k: await page.keyboard.press('Alt+PageDown')
    await page.wait_for_timeout(500); await snap(page, s, f'capQ/{k:03d}.png')
    print(await page.evaluate(CM + ".getCursor().line"))
