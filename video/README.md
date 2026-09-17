# Crops launch video

A 40-second, 1920×1080, 60fps launch video built with [Remotion](https://www.remotion.dev) (React). It uses the login-page look: the green field, the checking security pattern, glass cards, and Google Sans Flex. Every cut and pop lands on the soundtrack's beat grid.

## Commands

Run from `video/`:

```sh
npm install
npm run studio   # live preview and scrubbing at http://localhost:3000
npm run render   # full-quality MP4 at out/crops-launch.mp4
npm run still -- --frame=900   # a single PNG frame for checking layout
npm run beats    # re-analyze the soundtrack after swapping it
```

## Files

| Path | What it holds |
| --- | --- |
| `public/soundtrack.mp3` | Music ("Trap Action" by alisiabeats). Swap it, then run `npm run beats`. |
| `public/fonts/GoogleSansFlex-latin.woff2` | Google Sans Flex variable font (SIL Open Font License), from Google Fonts. |
| `public/security-pattern.svg` | The checking pattern, slightly stronger than the website version so it reads on video. |
| `scripts/analyze-beats.py` | Decodes the MP3 with ffmpeg and finds tempo, beat grid, kick drums, and per-beat energy. Needs Python 3 with numpy. |
| `src/beats.json` | Output of the analyzer: 110 BPM, beat times, kick times. |
| `src/timeline.ts` | `beat(n)` converts a beat number to a frame. `SCENES` maps each scene to beat ranges, plus brand colors. |
| `src/motion.tsx` | `Scene` (beat-ranged sequence with an exit), `Rise` (spring entrance on a beat), `useSince`, `kickPulse`. |
| `src/ui.tsx` | The animated background and pattern, glass and paper cards, chips, status pills, and the logo. |
| `src/scenes.tsx` | Every scene's layout and copy. Harvest prices come from `web/src/harvestPricing.ts`. |
| `src/Launch.tsx` | Composition order, soundtrack, and drop flashes. |

## Song map

The track runs at 110 BPM, and a bar is 4 beats (about 2.18s). Scenes start on downbeats.

| Beats | Time | Music | Scene |
| --- | --- | --- | --- |
| 0–6 | 0:00 | Riser, drop on beat 4 | "Private equity thinks time tracking should cost you an arm and both legs."; pattern sweeps in; "arm" lands on the drop |
| 6–10 | 0:03 | | "Nah, I can tend to my own Crops." with the logo |
| 10–16 | 0:05 | | "Free time tracking. Room to grow." |
| 16–20 | 0:09 | | Glass timer, "One timer. Everywhere." |
| 20–36 | 0:11 | | Teams, Billing, Native apps, Reports (one bar each) |
| 36–48 | 0:19 | Bright hats | Harvest vs Crops, prices flip on beats |
| 48–52 | 0:26 | Break | "$0"; pattern clears out |
| 52–64 | 0:28 | Last push | Agents: API, MCP, token billing; pattern sweeps back |
| 64–end | 0:35 | Outro | Logo, tagline, crops.wims.vc; pattern fades |

To retime something, change its beat numbers in `SCENES` or on the `Rise`/`Words` inside the scene. Fractions such as `8.5` land on off-beats.

Remotion is free for individuals and companies with up to three employees. Larger teams need a [company license](https://www.remotion.dev/license).
