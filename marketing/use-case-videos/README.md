# Training video production sources

The recording script is the editable source of each practical video: its title, narration, and real-browser workflow are stored together in [`record.mjs`](record.mjs). Synthetic import files and sample host pages are under [`fixtures/`](fixtures/). Final videos, captions, and posters are written to `apps/designer/public/demo-videos/`.

For recording, playback verification, asset conventions, and maintenance steps, use the training-video [production guide](../training-videos/README.md) and [coverage matrix](../training-videos/coverage-matrix.md). Do not commit temporary browser captures or intermediate voice files from `/tmp/open-reports-use-case-recordings/`.
