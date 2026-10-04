# Critique loop

Each pass renders `node render.mjs --sheet` (every scene at its resolved moment plus mid-action frames) and, from pass 2, the full film. Every scene is scored 0–10 on five equally weighted checks; the film ships when every scene is ≥ 8 and the average ≥ 8.5.

1. **Legibility:** every word readable at 1080p, nothing clipped, no text under 22 px.
2. **Hierarchy:** one idea, the eye lands on the headline, then the product proof.
3. **Brand and rules:** tokens, type families, safe margins, no banned devices (RULES.md).
4. **Truth:** real UI and real output, claims the product backs up.
5. **Motion and sync:** entrances on the beat grid, sound on every cue (checked on the film).

## Pass 1

| Scene | Score | Notes | Fix |
|---|---|---|---|
| hook | 8 | Clear question, words on beats, faint real pages behind. | — |
| reveal | 8 | Strong drop, underline draws on the accent. Wordmark slightly small. | Wordmark 64 → 76 px. |
| design | 8 | Click lands on the real table, inspector switches. | — |
| rules | 8.5 | Red rows outlined on the beat; chips read. | — |
| pagination | 6 | The explanation (the point of the scene) is a tiny strip at the bottom of the screenshot. | Lift the real decision text into a large callout that lands on the highlight beats. |
| outputs | 9 | Real documents, ₹ correct, chips stamp one per beat. | — |
| ai | 5 | Headline "AI edits the template," is clipped by the card (fit hit its minimum size). | Rewrite as three short lines: "AI drafts / the edit. / You *approve.*"; move "never your numbers" to the kicker. |
| api | 8.5 | Typing and the 200 response read well; JasperReports line stays secondary. | — |
| recap | 6 | Third tile column runs off the right edge. | Tiles 400 → 360 px wide, gap 24. |
| end | 8.5 | Clean hierarchy, correct repo URL. | — |

Average 7.6: below threshold. Fixes applied for pass 2.

## Pass 2 (contact sheet)

AI headline now fits in three lines, recap tiles fit the frame, pagination callouts quote the product's real decisions ("row 51 needs 13.2pt, only 9pt left"). Two kickers (AI, API) ran under their cards: shortened. Scores: pagination 8.5, ai 8, recap 8.5; others unchanged.

## Pass 3 (full film)

Objective checks on the encoded MP4:
- Cut detection (`scdet`) finds exactly 9 cuts at 4, 8, 12, 16, 20, 24, 28, 32 and 36 s: every scene boundary, all on bar lines, no stray cuts.
- Loudness per bar: intro −28 dB, drop at 4 s to −11 dB, steady body, impact at bar 18, outro −25 dB. Intro raised (pad 0.7 → 1.3, hats 0.35 → 0.55) so autoplay does not open on near-silence.
- Mid-motion frames: wordmark lands on the drop; design click swaps the inspector on the ring frame; AI click swaps to the applied state.

| Scene | Score | Notes | Fix |
|---|---|---|---|
| ai | 7.5 | The proposal text is too small in the screenshot to carry "you approve". | Callouts with the AI's actual explanation (beat 50) and "Applied as one undoable step" after the click (beat 53.5). |

All other scenes ≥ 8.5 on motion and sync.

## Pass 4 (final)

AI callouts carry the approve story: the AI's actual proposal ("Company name: larger, bold, blue") lands on beat 50, the cursor clicks Accept on beat 53, and "Applied as one undoable step" lands on 53.5, matching the product's own toast. The first callout was shortened so it stays inside the frame.

Final file: 1920 × 1080, 30 fps, H.264 + AAC, 42.000 s, 12.4 MB. `scdet` cuts at exactly the 9 scheduled bar lines. Loudness −12.4 LUFS integrated, −0.9 dBFS peak.

| Scene | hook | reveal | design | rules | pagination | outputs | ai | api | recap | end |
|---|---|---|---|---|---|---|---|---|---|---|
| Score | 8.5 | 8.5 | 8.5 | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 8.5 | 9 |

Average 8.6, every scene ≥ 8: ships.
