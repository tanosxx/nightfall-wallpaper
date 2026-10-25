#!/usr/bin/env bash
# Shared, headless source checks for CI and release. No desktop/session mutation.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
bash -n install.sh uninstall.sh preview.sh scripts/check-source.sh
python3 -m unittest discover -s tests -p 'test_bundle_verification.py' -v
python3 scripts/build-pages.py
python3 tests/pages-site.test.py
node --experimental-default-type=module --test \
    tests/scene-catalog.test.mjs tests/polar-motion.test.mjs \
    tests/abyss-*.test.mjs tests/cloudcity-*.test.mjs tests/junction-*.test.mjs \
    tests/station-frame-clock.test.mjs tests/station-industrial.test.mjs \
    tests/station-lighting.test.mjs tests/station-motion.test.mjs \
    tests/station-native-effects.test.mjs tests/station-realism-*.test.mjs \
    tests/station-space.test.mjs tests/titans-timeline.test.mjs \
    tests/titans-ground.test.mjs tests/titans-sky.test.mjs \
    tests/titans-suit.test.mjs tests/titans-additions-assets.test.mjs
gjs -m tests/titans-canvas.test.js
