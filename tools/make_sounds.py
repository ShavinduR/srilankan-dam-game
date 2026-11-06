"""Generate the game's placeholder audio (royalty-free, synthesized).

    python3 tools/make_sounds.py      # needs numpy + ffmpeg

Writes client/public/sounds/{move,capture,bgm}.mp3. Replace any of them with your
own MP3 of the same name to change the sound — no code changes needed.
"""
import os, subprocess, tempfile, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'client', 'public', 'sounds')
rng = np.random.default_rng(7)

def t(sec): return np.arange(int(SR * sec)) / SR
def env(n, attack=0.002, decay=0.08):
    x = np.arange(n) / SR
    return np.minimum(1, x / attack) * np.exp(-x / decay)

def lowpass(x, a):  # simple one-pole filter, a in (0,1): smaller = darker
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x): acc += a * (v - acc); y[i] = acc
    return y

def wood(freq=520, dur=0.14, bright=0.35):
    """Wooden piece knock: pitched body + filtered click."""
    tt = t(dur)
    body = np.sin(2 * np.pi * freq * tt) * env(len(tt), 0.001, 0.025)
    body += 0.5 * np.sin(2 * np.pi * freq * 2.7 * tt) * env(len(tt), 0.001, 0.012)
    click = lowpass(rng.standard_normal(len(tt)), bright) * env(len(tt), 0.0005, 0.006)
    thump = np.sin(2 * np.pi * 140 * tt) * env(len(tt), 0.001, 0.04)
    return body * 0.6 + click * 0.9 + thump * 0.5

def mix_at(buf, snd, at):
    i = int(at * SR); j = min(len(buf), i + len(snd)); buf[i:j] += snd[: j - i]

def write_mp3(name, x, kbps):
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.89
    pcm = (x * 32767).astype(np.int16)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f: tmp = f.name
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    out = os.path.join(OUT, name)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame',
                    '-b:a', f'{kbps}k', '-ac', '1', out], check=True)
    os.remove(tmp); print(out, os.path.getsize(out), 'bytes')

# ---- SFX
move = np.zeros(int(SR * 0.16)); mix_at(move, wood(520), 0)
cap = np.zeros(int(SR * 0.32)); mix_at(cap, wood(600, bright=0.5), 0); mix_at(cap, wood(820, bright=0.6) * 1.1, 0.085)
write_mp3('move.mp3', move, 64)
write_mp3('capture.mp3', cap, 64)

# ---- BGM: upbeat 8-bar loop, 128 BPM, pentatonic, seamless (exact bar length)
BPM = 128; beat = 60 / BPM; bars = 8; L = bars * 4 * beat
bgm = np.zeros(int(SR * L) + 1)

def note(f, dur, vol=0.3, shape='square', decay=0.25):
    tt = t(dur)
    if shape == 'square': w = np.sign(np.sin(2 * np.pi * f * tt)) * 0.5 + np.sin(2 * np.pi * f * tt) * 0.5
    elif shape == 'tri': w = 2 * np.abs(2 * ((f * tt) % 1) - 1) - 1
    else: w = np.sin(2 * np.pi * f * tt)
    e = np.minimum(1, tt / 0.005) * np.exp(-tt / decay)
    return lowpass(w * e, 0.25) * vol

def kick():
    tt = t(0.25); f = 120 * np.exp(-tt * 18) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.12)
def hat(): return lowpass(rng.standard_normal(int(SR * 0.05)), 0.9) * np.exp(-t(0.05) / 0.012) * 0.25
def drum(f):  # hand-drum (tabla/dholak-ish)
    tt = t(0.18); fr = f * (1 + 0.6 * np.exp(-tt * 40))
    return np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt / 0.08) * 0.55

midi = lambda m: 440 * 2 ** ((m - 69) / 12)
chords = [57, 53, 48, 55, 57, 53, 55, 52]           # bass roots: Am F C G Am F G E
scale = [69, 72, 74, 76, 79, 81, 84]                 # A minor pentatonic
melody = [  # (beat offset within bar, scale index, length in beats)
    [(0, 4, .5), (.5, 3, .5), (1, 2, 1), (2.5, 3, .5), (3, 4, 1)],
    [(0, 5, .5), (.5, 4, .5), (1, 3, .5), (1.5, 2, .5), (2, 1, 1.5), (3.5, 2, .5)],
    [(0, 2, .5), (.5, 3, .5), (1, 4, .5), (1.5, 5, .5), (2, 6, 1), (3, 5, 1)],
    [(0, 4, 1.5), (1.5, 3, .5), (2, 4, .5), (2.5, 3, .5), (3, 1, 1)],
    [(0, 4, .5), (.5, 3, .5), (1, 2, 1), (2.5, 3, .5), (3, 4, 1)],
    [(0, 5, .5), (.5, 6, .5), (1, 5, .5), (1.5, 4, .5), (2, 3, 1), (3, 4, 1)],
    [(0, 3, .5), (.5, 4, .5), (1, 5, 1), (2, 4, .5), (2.5, 3, .5), (3, 2, 1)],
    [(0, 1, 1), (1, 2, .5), (1.5, 1, .5), (2, 0, 2)],
]
for bar in range(bars):
    b0 = bar * 4 * beat
    for k in range(4): mix_at(bgm, kick() * 0.9, b0 + k * beat)
    for k in range(8): mix_at(bgm, hat(), b0 + (k + 0.5) * beat / 2 * 2 if k % 2 else b0 + k * beat / 2)
    for off, f in [(0.75, 220), (1.5, 330), (2.75, 220), (3.25, 330), (3.5, 260)]:   # syncopated hand drum
        mix_at(bgm, drum(f), b0 + off * beat)
    root = midi(chords[bar] - 12)
    for k in range(8):                                                             # driving 8th-note bass
        mix_at(bgm, note(root * (2 if k % 4 == 3 else 1), beat / 2, 0.45, 'tri', 0.12), b0 + k * beat / 2)
    for off, idx, ln in melody[bar]:
        mix_at(bgm, note(midi(scale[idx]), ln * beat, 0.22, 'square', 0.18 + ln * 0.1), b0 + off * beat)
bgm = bgm[: int(SR * L)]
write_mp3('bgm.mp3', bgm, 96)
