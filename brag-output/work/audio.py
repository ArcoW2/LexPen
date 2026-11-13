import numpy as np, wave
SR, DUR, BEAT = 48000, 101.0, 0.5
# the cues below were written before ten scenes came in at 19.5: from there on they sit 38 s later
L = lambda x: x + 38.0 if x >= 19.5 else x   # 13.5 for the four editing scenes, 8 for SQL reformat and fenced code, 16.5 for occurrences to print
N = int(SR * DUR); t = np.arange(N) / SR
mix = {k: np.zeros(N) for k in ('pad', 'arp', 'bass', 'drums', 'fx')}
rng = np.random.default_rng(7)
f = lambda m: 440.0 * 2 ** ((m - 69) / 12)
def add(bus, start, sig):
    i = int(round(start * SR)); j = min(N, i + len(sig))
    if i < N: mix[bus][i:j] += sig[:j - i]
def env(n, a, r):
    e = np.ones(n); ai = max(1, int(a * SR)); e[:ai] = np.linspace(0, 1, ai)
    return e * np.exp(-np.arange(n) / SR / r)
def lp(x, k):   # one-pole lowpass, k in (0,1]
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)): acc += k * (x[i] - acc); y[i] = acc
    return y
# chords per bar (2 s): Am F C G
CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
ROOT = [45, 41, 48, 43]
bars = int(np.ceil(DUR / 2))
for b in range(bars):
    c = CH[b % 4]; st = b * 2.0
    n = int(2.2 * SR); tt = np.arange(n) / SR
    sig = sum(np.sin(2*np.pi*f(m)*tt) + .5*np.sin(2*np.pi*f(m)*1.003*tt) + .25*np.sin(2*np.pi*f(m+12)*tt) for m in c)
    e = np.minimum(1, tt / .35) * np.minimum(1, (2.2 - tt) / .4)
    add('pad', st, sig * e * .05)
    # arp in 16ths: chord tones up an octave
    pat = [c[0]+12, c[1]+12, c[2]+12, c[1]+12, c[0]+24, c[2]+12, c[1]+12, c[2]+12]
    for k in range(16):
        s0 = st + k * .125
        if s0 >= 97.5 and s0 < 99.5 and k % 2: continue
        m = pat[k % 8]; n2 = int(.3 * SR); tt2 = np.arange(n2) / SR
        tone = (np.sin(2*np.pi*f(m)*tt2) + .3*np.sin(2*np.pi*2*f(m)*tt2)) * env(n2, .003, .09)
        vel = .05 if s0 < 4 else .07
        if s0 >= 99.5: vel *= max(0, 1 - (s0 - 99.5) / 1.5)
        add('arp', s0, tone * vel)
    # bass 8ths from 4.0 to 97.5
    for k in range(4 * 2):
        s0 = st + k * .25
        if 4.0 <= s0 < 97.5:
            n3 = int(.24 * SR); tt3 = np.arange(n3) / SR; fr = f(ROOT[b % 4] - 12 * (k % 2 == 0) + 12 * 0)
            sq = np.tanh(3 * np.sin(2*np.pi*fr*tt3)) * env(n3, .005, .12)
            add('bass', s0, sq * .10)
# drums: kick on beats 4.0-17.5, hats offbeat 8ths 8.0-17.5, clap-ish on 2 and 4 from 8.0
def kick():
    n = int(.35 * SR); tt = np.arange(n) / SR
    ph = 2*np.pi*np.cumsum(45 + 90*np.exp(-tt/.035)) / SR
    return np.sin(ph) * np.exp(-tt/.12)
def hat(d=.04):
    n = int(.08 * SR); x = rng.standard_normal(n); x = x - lp(x, .5)
    return x * np.exp(-np.arange(n)/SR/d)
def snare():
    n = int(.25 * SR); tt = np.arange(n)/SR; x = rng.standard_normal(n); x = lp(x, .35) - lp(x, .05)
    return (x * .8 + .3*np.sin(2*np.pi*190*tt)) * np.exp(-tt/.07)
K, H, S = kick(), hat(), snare()
for i in range(int(DUR / BEAT)):
    s0 = i * BEAT
    if 4.0 <= s0 < 97.5: add('drums', s0, K * .32)
    if 8.0 <= s0 < 97.5: add('drums', s0 + .25, H * .05)
    if 12.0 <= s0 < 97.5 and i % 2 == 1: add('drums', s0, S * .10)
# fx: key ticks, soft and bright, on the frames that show typing
def tick(at, g=.035, raw=False):
    at = at if raw else L(at)
    n = int(.03 * SR); x = rng.standard_normal(n); x = x - lp(x, .6)
    add('fx', at, x * np.exp(-np.arange(n)/SR/.006) * g)
for i in range(20): tick(.5 + i * .125)                                   # hook
for at in [12.375, 12.5, 12.625, 13.375, 13.5, 13.75] + [14.0 + i * .125 for i in range(1, 15)]: tick(at, .03)   # typing
for at in [24.5, 24.625, 24.75]: tick(at, .03)                           # column mode
for at in [28.0, 28.125, 28.25, 28.375]: tick(at, .03)                   # CSV edit
tick(27.0, .03); tick(27.0625, .03)                                      # the double click
tick(17.0, .03)                                                          # F12
for at in [35.0, 36.0, 37.0]: tick(at, .03)                              # menu / ribbon / change mode
for at in [48.25, 48.75, 49.25, 49.75, 51.75, 52.25]: tick(at, .03)       # settings tabs, the ruler, the guide
for i in range(5): tick(50.25 + i * .125, .03)                           # settings search typed
def riser(d=1.0):
    n = int(d * SR); x = rng.standard_normal(n); tt = np.arange(n)/SR
    y = lp(x, .02) * 3 + (x - lp(x, .3)) * .2
    return y * (tt / d) ** 2
for cut in [L(c) for c in (23.0, 26.0, 30.0, 34.0, 37.0, 40.0, 43.5, 45.5, 47.5, 51.0, 53.5, 59.5)] + [4.0, 8.0, 12.0, 16.0, 19.5, 22.5, 25.5, 29.5, 33.0, 37.0, 41.0, 44.5, 48.0, 52.5, 57.5]:
    add('fx', cut - 1.0, riser() * (.03 if cut in (L(37.0), L(45.5), L(51.0)) else .05))
def blip(at, m, g=.05, r=.06, raw=False):
    at = at if raw else L(at)
    n = int(.25 * SR); tt = np.arange(n)/SR
    add('fx', at, np.sin(2*np.pi*f(m)*tt) * env(n, .002, r) * g)
pent = [69, 72, 74, 76, 79, 81, 84, 86, 88, 91]
# language chips: a quiet pentatonic run, one note per chip (32nds from 8.5)
for i in range(25): blip(8.5 + i * .0625, pent[i % 10] + 12 * (i // 10 >= 1) - 12, .022, .05)
# cursors added (16.75-18.0), the two typed keys (18.5, 18.75)
for i, at in enumerate([20.25, 20.5, 20.75, 21.0, 21.25, 21.5]): blip(at, pent[i] + 12)
for at, m in ((22.0, 81), (22.25, 84)): blip(at, m, .05, .08); blip(at, m - 12, .025, .08)
# column block grows (20.25-20.625)
for i, at in enumerate([23.5, 23.75, 23.875, 24.0, 24.125]): blip(at, pent[i] + 12, .035)
# chord stabs: macro result (24.5), copy across (28.0)
def stab(at, chord, g=.035, raw=False):
    at = at if raw else L(at)
    n = int(.6 * SR); tt = np.arange(n)/SR
    add('fx', at, sum(np.sin(2*np.pi*f(m+12)*tt) for m in chord) * env(n, .004, .15) * g)
stab(17.5, CH[3]); stab(32.0, CH[0]); stab(38.5, CH[1]); stab(41.5, CH[2]); stab(52.0, CH[3])
for i in range(1, 6): blip(53.5 + i, pent[i] + 12, .03, .1)              # each new theme
# outro (97.5): low A + chord swell, ringing out
n = int(3.5 * SR); tt = np.arange(n)/SR
add('fx', 97.5, (np.sin(2*np.pi*f(33)*tt) * .5 + sum(np.sin(2*np.pi*f(m)*tt) for m in [57, 60, 64, 69])*.12) * np.exp(-tt/1.6) * np.minimum(1, tt/.01) * .35)
add('drums', 97.5, K * .4)
# the four editing scenes (19.5-33): go to line, next block, move a block, reformat
for at in [20.0, 20.375, 20.5, 21.25, 26.0, 28.25]: tick(at, .03, raw=True)
for i, at in enumerate([23.25, 24.0, 24.75]): blip(at, pent[i * 2] + 12, .04, .08, raw=True)
for i, at in enumerate([26.75, 27.0, 27.25, 27.5, 27.75]): blip(at, pent[5 - i] + 12, .03, .06, raw=True)
stab(21.25, CH[1], .025, raw=True); stab(30.75, CH[0], raw=True)
# occurrences, find, highlight with a note, print (41-57.5)
stab(42, CH[2], .03, raw=True)
for at in [45.0, 45.25, 45.375, 45.5, 45.625]: tick(at, .03, raw=True)
for i, at in enumerate([46.25, 46.75]): blip(at, pent[2 + i * 2] + 12, .04, .08, raw=True)
for at in [48.5, 48.75, 49, 49.25, 49.5]: tick(at, .028, raw=True)
stab(50, CH[1], .03, raw=True); blip(51.25, pent[4] + 12, .035, .1, raw=True)
for at in [53.25, 54, 55.25]: tick(at, .03, raw=True)
stab(54.75, CH[0], .03, raw=True)
# SQL reformat (33-37): the click and the result
tick(34.75, .03, raw=True); stab(34.75, CH[3], .03, raw=True)
# mix
gains = {'pad': 1.0, 'arp': 1.0, 'bass': 1.0, 'drums': 1.0, 'fx': 1.0}
m = sum(mix[k] * g for k, g in gains.items())
# simple room: a couple of short delays, quiet
for d, g in ((.031, .18), (.047, .14), (.25, .08)):
    k = int(d * SR); m[k:] += m[:-k] * g
fade = np.ones(N); fi = int(.03 * SR); fade[:fi] = np.linspace(0, 1, fi)
fo = int(1.2 * SR); fade[-fo:] = np.linspace(1, 0, fo) ** 1.5
m = np.tanh(m * 1.6) * fade
m = m / np.max(np.abs(m)) * 0.89
st = np.stack([m, np.roll(m, int(.007 * SR)) * .97 + m * .03], 1)
with wave.open('music.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
print('peak', np.max(np.abs(st)), 'rms', np.sqrt(np.mean(st**2)))
