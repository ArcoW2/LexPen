import base64
sp = [pg for c in b.contexts for pg in c.pages if 'settings' in pg.url][0]
ss = await sp.context.new_cdp_session(sp)
K = [0]
async def shot(w=500):
    await sp.wait_for_timeout(w)
    r = await ss.send('Page.captureScreenshot', {'format':'png','clip':{'x':0,'y':0,'width':904,'height':758,'scale':1.5}})
    open(f'capN/{K[0]:03d}.png','wb').write(base64.b64decode(r['data'])); K[0] += 1
await sp.get_by_text('General', exact=True).first.click(); await shot()
for name in ['Editor', 'Editor view', 'Preview', 'App']:
    await sp.get_by_text(name, exact=True).first.click(); await shot()
await sp.click('.st-search')
for ch in 'ruler':
    await sp.keyboard.type(ch); await shot(250)
return await sp.evaluate("document.body.innerText.slice(0, 900)")
