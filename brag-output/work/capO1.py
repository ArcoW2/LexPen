import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
await page.evaluate("setDockFloating('commands', false)")
await page.wait_for_timeout(500)
await page.evaluate("showDockPane('commands')")
await page.wait_for_timeout(1500)
await snap(page, s, 'capO/look.png', scale=0.75)
return await page.evaluate("[...document.querySelectorAll('iframe')].map(f => [f.src.slice(-20), Math.round(f.getBoundingClientRect().x), Math.round(f.getBoundingClientRect().y), Math.round(f.getBoundingClientRect().width), Math.round(f.getBoundingClientRect().height)])")
