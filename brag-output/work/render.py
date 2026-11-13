import sys, asyncio, subprocess, pathlib
from playwright.async_api import async_playwright
import imageio_ffmpeg
FPS, DUR = 30, 101.0
here = pathlib.Path(__file__).parent
async def main(mode, times):
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        page = await b.new_page(viewport={'width':1920,'height':1080})
        await page.goto((here / 'comp' / 'index.html').as_uri())
        await page.evaluate('window.ready')
        if mode == 'stills':
            (here / 'stills').mkdir(exist_ok=True)
            for t in times:
                await page.evaluate(f'render({t})')
                await page.screenshot(path=str(here / 'stills' / f't{t:05.2f}.jpg'), type='jpeg', quality=85)
        else:
            ff = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'image2pipe', '-framerate', str(FPS), '-c:v', 'mjpeg', '-i', '-',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', str(here / 'video.mp4')], stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
            for f in range(int(FPS * DUR)):
                await page.evaluate(f'render({f / FPS})')
                ff.stdin.write(await page.screenshot(type='jpeg', quality=95))
            ff.stdin.close(); ff.wait(); print('ffmpeg rc', ff.returncode)
        await b.close()
mode = sys.argv[1]
asyncio.run(main(mode, [float(x) for x in sys.argv[2:]]))
