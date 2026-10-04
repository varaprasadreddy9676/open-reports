# Motion studio rules — Open Reports launch video

These rules are the render contract. Every scene, cue and revision must satisfy them; the critique loop (CRITIQUE.md) scores against them.

## Render contract
- 1920 × 1080, 30 fps, H.264 yuv420p, AAC 48 kHz stereo. Duration is set by `timeline.mjs` and must equal the audio length.
- Every pixel is a pure function of time: `renderFrame(t)` sets all styles. No CSS transitions or animations, no `requestAnimationFrame`, no timers, no unseeded randomness. Rendering frame 600 alone must produce the same image as frame 600 in a full render.
- One source of truth: `timeline.mjs` holds the tempo, scenes, copy and every cue. The composition and the audio both read it; nothing is timed by hand in two places.
- All assets are local: fonts in `assets/fonts`, product screenshots in `assets/shots`, rendered outputs in `assets/outputs`. No network at render time.
- Fonts are embedded with `@font-face` and the renderer waits for `document.fonts.ready` and every image `decode()` before the first frame.

## Tempo
- 120 BPM: one beat = 0.5 s = 15 frames, one bar = 2 s. Scenes start on bar lines. Every entrance, cut, stamp and click lands on a beat or half-beat. Nothing important happens between grid points.
- Entrances finish within one beat. Text holds at least 1.5 s per line once fully in.

## Brand
- Colours come from the product's tokens: accent `#2563eb`, ink `#1a2b49`, muted `#5d6c82`, paper `#ffffff`, page canvas `#e9edf4`, ok `#047857`, warn `#b45309`, danger `#b91c1c`. Each chapter gets one pastel tint derived from the accent family; never more than one tint per scene.
- Type: Noto Sans Display Bold for headlines, Noto Serif Display Italic for exactly one accent word per headline, Noto Sans Mono for HUD and labels. These are the fonts the product prints PDFs with.
- The mark is the product favicon: a blue rounded square with three document lines.
- Real product UI only: screenshots captured from the running designer. Never draw fake UI that the product does not have.

## Layout
- Safe margin 96 px on every side for text; UI cards may bleed off the right edge.
- Headline 104–132 px, line height 1.0, tight tracking (−0.02em). Mono labels 22–26 px, uppercase-free, prefixed with `//`. No body text below 28 px.
- HUD strip at the top of every scene: left `// 0N — chapter`, right `OPEN REPORTS  00:00:SS:FF`.
- One idea per scene: one headline, one product visual, at most one supporting chip row.

## Motion grammar
- Easing: `easeOutExpo` for entrances, `easeInOutCubic` for camera moves, never linear for positional motion.
- Headlines enter line by line with a 1-beat stagger: 40 px rise plus a clip reveal. The accent word lands half a beat later than its line.
- Product cards slide in from the right with a slight scale (0.96 → 1) and hold; a slow push-in (1.0 → 1.04 over the scene) keeps them alive.
- The cursor moves on `easeInOutCubic` and clicks exactly on a beat, with a ring pulse and a click sound.
- Scene changes are hard cuts on the bar line, accompanied by a whoosh that starts half a beat early. No cross-fades, wipes or spins.

## Audio
- Music is synthesised in `audio.mjs` from the same timeline: kick on beats, hats on off-beats, a four-chord pad, bass on the root. The drop (kick enters) is the brand reveal.
- Every visual action with a cue has a sound: `whoosh` (scene cut), `click` (cursor click), `pop` (chip or check appears), `type` (headline line lands), `riser` (into the end card), `impact` (wordmark lands).
- Master peaks at −1 dBFS; SFX sit about 6 dB under the kick.

## Banned
- Stock gradients, glassmorphism, lens flares, particle bursts, 3D spins, bouncy elastic easing, emoji, exclamation marks, more than two type families on screen, centred body text, claims the product cannot back up.

## v2 amendments
- Live footage beats stills: product scenes play stop-motion clips captured from the running designer (`apps/designer/tests/e2e/launch-video-clips.spec.ts`). The browser frame must stay fully on screen, so camera moves (keyframes in `timeline.mjs`) show the detail instead of cropping by layout.
- Slams may use a gentle overshoot (`back` easing, ≤ 10 %). Elastic bounces remain banned.
- Kinetic hook and montage cut once per beat; product scenes hold at least 4 s.
- Every captured click and keystroke has a sound, spaced like human typing (≥ 70 ms apart).
- Master with headroom: −2.5 dBFS sample peak so the AAC encode stays below −1 dBFS.
