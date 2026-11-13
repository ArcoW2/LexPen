sp = [pg for c in b.contexts for pg in c.pages if 'settings' in pg.url][0]
await sp.locator('select').filter(visible=True).first.select_option('0')
await sp.locator('input[type=checkbox]').filter(visible=True).first.click()
await sp.wait_for_timeout(400)
await sp.keyboard.press('Escape')
await page.wait_for_timeout(800)
return [pg.url[-25:] for c in b.contexts for pg in c.pages]
