import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
from lib import DEMO as d
await page.evaluate("p => goToOrOpen(p)", d + 'release-notes.md')
await page.wait_for_timeout(1000)
await page.evaluate("if (state.hidden === null) hidePane(1)")
await page.evaluate("setSetting('followWindows', false)")
await page.wait_for_timeout(800)
await page.evaluate("(() => { const cm = [...document.querySelectorAll('.CodeMirror')].find(e => e.offsetParent).CodeMirror; cm.setCursor(4, 0); cm.focus(); })()")
seq = [('light','light-parchment'), ('light','light-blossom'), ('dark','dark-pistachio'), ('dark','dark-wine'), ('dark','dark'), ('dark','dark-ink-paper')]
for i, (mode, th) in enumerate(seq):
    await page.evaluate("([m, t]) => { setSetting(m === 'dark' ? 'themeDark' : 'themeLight', t); setSetting('theme', m); }", [mode, th])
    await page.wait_for_timeout(1500)
    await snap(page, s, f'capM/{i:03d}.png')
await page.evaluate("setSetting('themeDark', 'dark'); setSetting('theme', 'dark')")
