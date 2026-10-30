#!/bin/sh
# Publishes the tracker and video to miles.6nyn5.com (Cloudflare Worker "miles", behind Cloudflare Access).
# Only the tracker, video and icon go up (plus worker.js, the settings API): the "mileage oracle" folder holds a saved copy of Jess's Oracle page and must never be published.
set -e
cd "$(dirname "$0")"
rm -rf site && mkdir site
cp ../mileage-tracker.html site/index.html
cp "../Mileage Tracker - How To.mp4" site/
cp ../apple-touch-icon.png site/
npx --yes wrangler@4 deploy
