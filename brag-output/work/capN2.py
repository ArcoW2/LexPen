import base64
sp = [pg for c in b.contexts for pg in c.pages if 'settings' in pg.url][0]
ss = await sp.context.new_cdp_session(sp)
await sp.get_by_text('Editor view', exact=True).first.click()
await sp.wait_for_timeout(600)
await sp.screenshot(path='settings1.png')
return await sp.evaluate("[...document.querySelectorAll('input[type=checkbox]')].filter(i => i.offsetParent).map(i => (i.closest('[class]')?.innerText || '').split(String.fromCharCode(10))[0] + ' = ' + i.checked)")
