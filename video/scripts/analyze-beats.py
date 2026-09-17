"""Beat map for the launch video soundtrack.

Decodes the MP3 with ffmpeg, estimates tempo from onset autocorrelation,
fits a beat grid, and writes video/src/beats.json (seconds + frames at 60fps).
Usage: npm run beats (from video/)
"""
import json, subprocess, sys
import numpy as np

audio = sys.argv[1] if len(sys.argv) > 1 else "public/soundtrack.mp3"
fps = int(sys.argv[2]) if len(sys.argv) > 2 else 60
sr = 22050
pcm = subprocess.run(
    ["ffmpeg", "-v", "error", "-i", audio, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
    capture_output=True, check=True,
).stdout
y = np.frombuffer(pcm, dtype=np.float32)
duration = len(y) / sr

hop, win = 256, 1024
frames = 1 + (len(y) - win) // hop
window = np.hanning(win).astype(np.float32)
spec = np.abs(np.stack([np.fft.rfft(y[i*hop:i*hop+win] * window) for i in range(frames)]))
logspec = np.log1p(spec * 10)
flux = np.maximum(0, np.diff(logspec, axis=0)).sum(axis=1)
flux = np.concatenate([[0], flux])
flux = (flux - flux.mean()) / (flux.std() + 1e-9)
# low band flux isolates kicks
freqs = np.fft.rfftfreq(win, 1 / sr)
low = logspec[:, freqs < 150]
kick = np.concatenate([[0], np.maximum(0, np.diff(low, axis=0)).sum(axis=1)])
kick = (kick - kick.mean()) / (kick.std() + 1e-9)
t = np.arange(frames) * hop / sr

# tempo by autocorrelation of onset envelope, 70-180 bpm
env = flux - flux.mean()
ac = np.correlate(env, env, mode="full")[len(env)-1:]
lags = np.arange(len(ac)) * hop / sr
mask = (lags > 60/180) & (lags < 60/70)
best = lags[mask][np.argmax(ac[mask])]
# refine
cands = np.linspace(best*0.97, best*1.03, 400)
def grid_score(period, phase):
    idx = np.round((np.arange(phase, duration, period)) * sr / hop).astype(int)
    idx = idx[idx < frames]
    return flux[idx].sum()
scores = []
for p in cands:
    phases = np.linspace(0, p, 48, endpoint=False)
    s = [grid_score(p, ph) for ph in phases]
    scores.append((max(s), p, phases[int(np.argmax(s))]))
_, period, phase = max(scores)
bpm = 60 / period
beats = np.arange(phase, duration, period)

# energy per beat (RMS) to find sections / drops
rms = np.array([np.sqrt(np.mean(y[int(b*sr):int(min(b+period, duration)*sr)]**2) + 1e-12) for b in beats])
rms_norm = (rms / rms.max()).round(3)

# strongest kick onsets (peaks)
peaks = [i for i in range(1, frames-1) if kick[i] > 2.0 and kick[i] >= kick[i-1] and kick[i] >= kick[i+1]]
kicks = []
for i in peaks:
    if not kicks or t[i] - kicks[-1] > 0.12:
        kicks.append(float(t[i]))

out = {
    "audio": audio, "fps": fps, "duration": round(duration, 3),
    "durationInFrames": int(np.ceil(duration * fps)),
    "bpm": round(float(bpm), 2), "beatSeconds": round(float(period), 4),
    "firstBeat": round(float(phase), 4),
    "beats": [round(float(b), 3) for b in beats],
    "beatFrames": [int(round(b * fps)) for b in beats],
    "beatEnergy": rms_norm.tolist(),
    "kicks": [round(k, 3) for k in kicks],
}
json.dump(out, open("src/beats.json", "w"), indent=1)
print(f"bpm {bpm:.2f} period {period:.4f} phase {phase:.3f} beats {len(beats)} kicks {len(kicks)} duration {duration:.2f}")
print("energy by bar (4 beats):", [round(float(rms_norm[i:i+4].mean()),2) for i in range(0, len(rms_norm), 4)])
