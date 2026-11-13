# The deliverables in brag-output/: brag.jpg (the poster, a settled frame of the hook) and brag.mp4 (video.mp4 from
# render.py with music.wav from audio.py, the poster as its frame 0 so every platform's thumbnail shows it).
import pathlib, shutil, subprocess, sys
import imageio_ffmpeg

here = pathlib.Path(__file__).resolve().parent
out = here.parent
POSTER_AT = 3.5
DUR = 101.0

subprocess.run([sys.executable, str(here / 'render.py'), 'stills', str(POSTER_AT)], check=True)
shutil.copyfile(here / 'stills' / f't{POSTER_AT:05.2f}.jpg', out / 'brag.jpg')
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error',
    '-i', str(here / 'video.mp4'), '-loop', '1', '-i', str(out / 'brag.jpg'), '-i', str(here / 'music.wav'),
    '-filter_complex', "[1:v]scale=in_range=pc:out_range=tv,format=yuv420p[p];"
                       "[0:v][p]overlay=0:0:enable='eq(n,0)':shortest=1,scale=out_range=tv,format=yuv420p[v]",
    '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-color_range', 'tv',
    '-c:a', 'aac', '-b:a', '192k', '-t', str(DUR), '-movflags', '+faststart', str(out / 'brag.mp4')], check=True)
print('wrote', out / 'brag.mp4')
