import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
CM = "[...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror"
src = open('demo/PickService.cs', encoding='utf-8').read()
await page.evaluate("t => { const cm = " + CM + "; cm.setValue(t); let a = 0; for (let i = 0; i < cm.lineCount(); i++) if (cm.getLine(i).includes('public int Count')) a = i; cm.setSelection({ line: a, ch: 0 }, { line: a + 11, ch: 0 }); cm.focus(); cm.scrollTo(0, cm.heightAtLine(a - 8, 'local')); }", src)
await page.wait_for_timeout(500); await snap(page, s, 'capS/000.png')
btn = await page.evaluate("(() => { const b = [...document.querySelectorAll('button')].filter(b => b.offsetParent && /Reformat/.test(b.title || b.dataset.title || '')); const r = b[0].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
await page.mouse.click(btn[0], btn[1])
await page.wait_for_timeout(900); await snap(page, s, 'capS/001.png')
