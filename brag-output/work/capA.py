import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
# The first run: release-notes.md (launch.ps1 opens it) in editor and preview
if not await page.evaluate("document.querySelector('.mm-switch-preview').classList.contains('mm-on')"):
    await page.click('.mm-switch-preview')
    await page.wait_for_timeout(1500)
await page.evaluate("document.querySelector('.mm-doc-name').textContent = 'C:' + String.fromCharCode(92) + 'Work' + String.fromCharCode(92) + 'warehouse' + String.fromCharCode(92) + 'release-notes.md'")
full = await page.evaluate("(() => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; window.__cm = cm; return cm.getValue(); })()")
lines = full.split('\n')
# chunks: grow by line, but the mermaid fence and table rows arrive as blocks so the preview never shows a broken fence
steps = [1,2,3,4,5,6,10,11,12,13,14,15,16,17,18,21,22,23,24]
await page.evaluate("window.__cm.setValue('')")
await page.wait_for_timeout(600)
await snap(page, s, 'capA/000.png')
for i, n in enumerate(steps, 1):
    txt = '\n'.join(lines[:n])
    await page.evaluate("t => { window.__cm.setValue(t); window.__cm.setCursor(window.__cm.lineCount(), 0); window.__cm.focus(); }", txt)
    await page.wait_for_timeout(900)
    await snap(page, s, f'capA/{i:03d}.png')
return len(steps)
