#!/usr/bin/env bash
# Builds dist/button-id-finder.zip (the file people download). Used by the GitHub release workflow.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist build && mkdir -p dist build/button-id-finder
cp -r extension/. build/button-id-finder/
cp -r practice build/button-id-finder/practice
cp README.md build/button-id-finder/README.md
( cd build && python3 -m zipfile -c ../dist/button-id-finder.zip button-id-finder )
rm -rf build
echo "Built dist/button-id-finder.zip"
