import sys; sys.path.insert(0,'.'); from lib import snap, setup
s = await setup(page)
await page.click('.mm-cmp-bar [data-cmp="copyLeft"]')
await page.wait_for_timeout(1500)
await snap(page, s, 'capD/001.png')
