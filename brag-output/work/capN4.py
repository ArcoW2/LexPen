import base64, sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
sp = [pg for c in b.contexts for pg in c.pages if 'settings' in pg.url][0]
ss = await sp.context.new_cdp_session(sp)
await sp.locator('select').filter(visible=True).first.select_option('40')
await sp.wait_for_timeout(600)
r = await ss.send('Page.captureScreenshot', {'format':'png','clip':{'x':0,'y':0,'width':904,'height':758,'scale':1.5}})
open('capN/012.png','wb').write(base64.b64decode(r['data']))
await page.wait_for_timeout(600)
await snap(page, s, 'capN/main1.png')
