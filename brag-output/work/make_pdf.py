# The demo PDF (demo/pick-list-wave-14.pdf) from picklist.html, printed by the installed Chrome.
import asyncio, pathlib
from playwright.async_api import async_playwright

here = pathlib.Path(__file__).resolve().parent

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        page = await b.new_page()
        await page.goto((here / 'picklist.html').as_uri())
        await page.pdf(path=str(here / 'demo' / 'pick-list-wave-14.pdf'), format='A4')
        await b.close()

asyncio.run(main())
