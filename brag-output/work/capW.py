import base64, asyncio
# The print window of the active tab (release-notes.md, after capV.py)
asyncio.ensure_future(page.evaluate("runAction('print')"))
await page.wait_for_timeout(5000)
pp = [pg for c in b.contexts for pg in c.pages if 'print' in pg.url][0]
ss = await pp.context.new_cdp_session(pp)
await ss.send('Emulation.setDeviceMetricsOverride', {'width':1440,'height':810,'deviceScaleFactor':1,'mobile':False})
await pp.wait_for_timeout(1000)
K = [0]
async def shot(w=1500):
    await pp.wait_for_timeout(w)
    r = await ss.send('Page.captureScreenshot', {'format':'png','clip':{'x':0,'y':0,'width':1440,'height':810,'scale':1.5}})
    open(f'capW/{K[0]:03d}.png','wb').write(base64.b64decode(r['data'])); K[0] += 1
sel = lambda label: pp.locator(f"xpath=//label[normalize-space()='{label}']/following::select[1]")
printers = await sel('Printer').evaluate("s => [...s.options].map(o => o.text)")
pdf = [p for p in printers if p == 'Microsoft Print to PDF']
print('has MS PDF printer:', bool(pdf))
if pdf: await sel('Printer').select_option(label=pdf[0])
await shot()                                         # 000 as it opened (printer chosen)
await sel('Source').select_option(label='Preview'); await shot()
cols = await sel('Colours').evaluate("s => [...s.options].map(o => o.text)")
await sel('Colours').select_option(label='Light'); await shot()
notes = await sel('Notes').evaluate("s => [...s.options].map(o => o.text)")
print(notes)
await sel('Notes').select_option(label='In the right margin'); await shot()
hl = await sel('Highlights').evaluate("s => [...s.options].map(o => o.text)")
print(hl)
await sel('Highlights').select_option(label='Shaded'); await shot()
# Closed again (its own Cancel; the page has a second one in a form)
await pp.click('[data-do="cancel"]')
