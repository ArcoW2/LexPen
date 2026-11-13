import base64, pathlib
# The demo files next to these scripts (LexPen gets full paths).
DEMO = str(pathlib.Path(__file__).resolve().parent / 'demo') + '\\'
MASK = '''() => {
  const B = String.fromCharCode(92), to = 'C:' + B + 'Work' + B + 'warehouse';
  let c = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const t = n.nodeValue.replace(/(?<![A-Za-z])[A-Za-z]:(?! ).{0,200}?brag-output.work.data/g, '%LOCALAPPDATA%' + B + 'LexPen').replace(/(?<![A-Za-z])[A-Za-z]:(?! ).{0,200}?brag-output.work.demo/g, to);
    if (t !== n.nodeValue) { n.nodeValue = t; c++; } }
  return c; }'''
async def mask(page):
    for f in page.frames:
        try: await f.evaluate(MASK)
        except Exception as e: print('mask fail', f.url, e)
async def snap(page, s, path, scale=1.5):
    await mask(page)
    r = await s.send('Page.captureScreenshot', {'format':'png','clip':{'x':0,'y':0,'width':1440,'height':810,'scale':scale},'captureBeyondViewport':False})
    open(path,'wb').write(base64.b64decode(r['data']))
async def setup(page):
    s = await page.context.new_cdp_session(page)
    await s.send('Emulation.setDeviceMetricsOverride', {'width':1440,'height':810,'deviceScaleFactor':1,'mobile':False})
    await page.wait_for_timeout(800)
    return s
