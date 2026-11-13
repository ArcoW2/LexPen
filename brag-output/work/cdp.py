import sys, asyncio
from playwright.async_api import async_playwright
async def main(code):
    async with async_playwright() as p:
        b = await p.chromium.connect_over_cdp('http://127.0.0.1:9333')
        page = [pg for c in b.contexts for pg in c.pages if 'index.html' in pg.url][0]
        await page.wait_for_timeout(700)
        g = {'page': page, 'b': b}
        exec('async def _f():\n' + '\n'.join('    ' + l for l in code.splitlines()), g)
        r = await g['_f']()
        if r is not None: print(r)
asyncio.run(main(open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()))
