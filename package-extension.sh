#!/usr/bin/env bash
# Package Client List Chrome Extension into a clean zip archive for Chrome Web Store distribution.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR/extension"
OUTPUT_ZIP="$SCRIPT_DIR/client-list-extension.zip"

echo "==> Packaging Chrome Extension from $EXT_DIR..."

if [ ! -d "$EXT_DIR" ]; then
  echo "Error: Extension directory $EXT_DIR does not exist!"
  exit 1
fi

# Remove older zip if present
rm -f "$OUTPUT_ZIP"

# Zip contents of extension directory excluding system files (.DS_Store, git, etc.)
cd "$EXT_DIR"
zip -r "$OUTPUT_ZIP" . \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "*node_modules*" \
  -x "*.swp"

echo "==> Chrome Extension packaged successfully: $OUTPUT_ZIP"
ls -lh "$OUTPUT_ZIP"
