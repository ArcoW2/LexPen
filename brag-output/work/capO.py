import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
K = [0]
async def shot(w=700):
    await page.wait_for_timeout(w); await snap(page, s, f'capO/{K[0]:03d}.png'); K[0] += 1
await page.evaluate("rbChangeMode(false); hideDockPane('commands'); setSetting('commandBar', 'menu')")
await shot(1000)                                                    # 000 menu only
await page.evaluate("setSetting('commandBar', 'both')"); await shot()    # 001 menu and ribbon
await page.evaluate("setSetting('commandBar', 'ribbon')"); await shot()  # 002 ribbon only
await page.evaluate("rbChangeMode(true)"); await page.evaluate("runAction('commands')")
await page.wait_for_timeout(1200)
cf = [f for f in page.frames if 'commands.html' in f.url][0]
await cf.fill('input', '')
await cf.type('input', 'IN list', delay=60)
await shot(1000)                                                    # 003 change mode, F1, the macro
off = await page.evaluate("(() => { const r = [...document.querySelectorAll('iframe')].find(f => f.src.includes('commands')).getBoundingClientRect(); return [r.x, r.y]; })()")
row = await cf.evaluate("(() => { const r = document.querySelector('.mm-pal-row').getBoundingClientRect(); return [r.x + 60, r.y + 14]; })()")
tgt = await page.evaluate(r"(() => { const g = [...document.querySelectorAll('.mm-rb-group')].find(g => /Go to/.test(g.innerText) && g.getBoundingClientRect().width); const r = g.getBoundingClientRect(); return [r.x + r.width - 12, r.y + 30]; })()")
sx, sy = off[0] + row[0], off[1] + row[1]
print('from', sx, sy, 'to', tgt)
await page.mouse.move(sx, sy); await page.mouse.down()
for i in range(1, 11):
    await page.mouse.move(sx + (tgt[0] - sx) * i / 20, sy + (tgt[1] - sy) * i / 20); await page.wait_for_timeout(30)
await shot(300)                                                     # 004 mid drag
for i in range(11, 21):
    await page.mouse.move(sx + (tgt[0] - sx) * i / 20, sy + (tgt[1] - sy) * i / 20); await page.wait_for_timeout(30)
await shot(400)                                                     # 005 over the group
await page.mouse.up()
await shot(800)                                                     # 006 dropped
await page.evaluate("rbChangeMode(false); hideDockPane('commands')")
await shot(800)                                                     # 007 done
return await page.evaluate(r"[...document.querySelectorAll('.mm-rb-group')].filter(g => /Go to/.test(g.innerText)).map(g => g.innerText.replace(/\s+/g, ' '))")
