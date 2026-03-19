#!/usr/bin/env bash
# scripts/convert-previews.sh
# Convert webm videos to animated GIFs using ffmpeg
#
# Usage: bash scripts/convert-previews.sh
# Requires: ffmpeg (brew install ffmpeg)

set -e

WEBM_DIR="media-previews/webm"
GIF_DIR="media-previews"

if ! command -v ffmpeg &>/dev/null; then
	echo "❌ ffmpeg not found. Install with: brew install ffmpeg"
	exit 1
fi

if [ ! -d "$WEBM_DIR" ] || [ -z "$(ls -A "$WEBM_DIR"/*.webm 2>/dev/null)" ]; then
	echo "❌ No webm files found in $WEBM_DIR/"
	echo "   Run 'bun run preview:capture' first."
	exit 1
fi

echo "🎬 Converting webm → gif..."
echo ""

for webm in "$WEBM_DIR"/*.webm; do
	name=$(basename "$webm" .webm)
	gif="$GIF_DIR/${name}.gif"

	echo "  $name.webm → $name.gif"

	# Two-pass conversion for good quality + small size:
	# 1. Generate optimized palette from the video
	# 2. Use palette for high-quality GIF encoding
	ffmpeg -y -i "$webm" \
		-vf "fps=12,scale=640:-1:flags=lanczos,palettegen=stats_mode=diff" \
		-loglevel error \
		"/tmp/palette-${name}.png"

	ffmpeg -y -i "$webm" \
		-i "/tmp/palette-${name}.png" \
		-lavfi "fps=12,scale=640:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5" \
		-loglevel error \
		"$gif"

	rm -f "/tmp/palette-${name}.png"

	# Report file sizes
	webm_size=$(du -h "$webm" | cut -f1)
	gif_size=$(du -h "$gif" | cut -f1)
	echo "    ${webm_size} webm → ${gif_size} gif"
done

echo ""
echo "✅ Done! GIFs saved to $GIF_DIR/"
