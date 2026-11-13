import base64, sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
sp = [pg for c in b.contexts for pg in c.pages if 'settings' in pg.url][0]
ss = await sp.context.new_cdp_session(sp)
K = [10]
async def shot(w=500):
    await sp.wait_for_timeout(w)
    r = await ss.send('Page.captureScreenshot', {'format':'png','clip':{'x':0,'y':0,'width':904,'height':758,'scale':1.5}})
    open(f'capN/{K[0]:03d}.png','wb').write(base64.b64decode(r['data'])); K[0] += 1
await snap(page, s, 'capN/main0.png')
await shot()                                  # 010: filtered, Editor view
box = sp.locator('input[type=checkbox]').filter(visible=True).first
await box.click(); await shot()               # 011: ruler on
sel = sp.locator('select').filter(visible=True).first
opts = await sel.evaluate("s => [...s.options].map(o => o.value + '|' + o.text)")
print(opts[:12])
v = [o.split('|')[0] for o in opts if o.split('|')[1].strip() in ('80', '80 characters')]
if v: await sel.select_option(v[0])
await shot()                                  # 012: guide at 80
await page.wait_for_timeout(800)
await snap(page, s, 'capN/main1.png')
