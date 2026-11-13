await page.evaluate("runAction('settings')")
await page.wait_for_timeout(3000)
pages = [pg for c in b.contexts for pg in c.pages]
sp = [pg for pg in pages if 'settings' in pg.url]
if not sp: return [pg.url for pg in pages]
sp = sp[0]
info = await sp.evaluate("[innerWidth, innerHeight, [...document.querySelectorAll('input')].slice(0,5).map(i => i.outerHTML.slice(0,150)), document.body.innerText.slice(0, 600)]")
await sp.screenshot(path='settings0.png')
return info
