import sys, re; sys.path.insert(0,'.'); from lib import snap, setup, DEMO
s = await setup(page)
await page.evaluate("p => goToOrOpen(p)", DEMO + 'pick_route.sql')
await page.wait_for_timeout(1200)
await page.evaluate("(() => { window.__cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; window.__cm.focus(); })()")
text = await page.evaluate("window.__cm.getValue()")
lines = text.split('\n')
occ = []
for ln, l in enumerate(lines):
    if l.startswith('--'): continue
    for m in re.finditer(r'\bo\b', l): occ.append((ln, m.start()))
await page.evaluate("window.__cm.setCursor(0,0)")
await page.wait_for_timeout(300)
await snap(page, s, 'capC/000.png')
for i in range(1, len(occ)+1):
    sels = [{'anchor':{'line':a,'ch':c}, 'head':{'line':a,'ch':c+1}} for a, c in occ[:i]]
    await page.evaluate("ss => window.__cm.setSelections(ss, ss.length - 1)", sels)
    await page.wait_for_timeout(350)
    await snap(page, s, f'capC/{i:03d}.png')
n = len(occ)
for j, ch in enumerate('wo', 1):
    await page.keyboard.type(ch)
    await page.wait_for_timeout(350)
    await snap(page, s, f'capC/{n+j:03d}.png')
return occ
