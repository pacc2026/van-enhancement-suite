#!/usr/bin/env bash
# Builds the zip uploaded to the Chrome Web Store.
#
# Usage: tools/build-cws-zip.sh                        zip for a normal upload
#        tools/build-cws-zip.sh --with-key <key.pem>   FIRST upload only
#
# The store rejects a manifest carrying `key` or `update_url`, so the manifest
# comes from tools/cws-manifest.js. To keep extension ID
# cdpjodhdenpjghbajpdlbbhpmdbcpcjh, the first upload includes the self-hosted
# signing key as key.pem at the zip root; every later upload must leave it out.
# A with-key zip contains the private key: never attach it to a release, share
# it, or commit it.

set -euo pipefail

cd "$(dirname "$0")/.."

KEY=""
case "${1:-}" in
  "") ;;
  --with-key)
    KEY="${2:-}"
    [ -n "$KEY" ] || { echo "--with-key needs the path to the signing key" >&2; exit 1; }
    [ -f "$KEY" ] || { echo "No signing key at: $KEY" >&2; exit 1; }
    ;;
  *) echo "Unknown argument: $1 (expected nothing or --with-key <key.pem>)" >&2; exit 1 ;;
esac

# The with-key zip and the staged key.pem contain the private signing key and
# must not be readable by other users.
[ -z "$KEY" ] || umask 077

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$VERSION" ] || { echo "Could not read version from manifest.json" >&2; exit 1; }

STAGE=build/cws
if [ -n "$KEY" ]; then
  ZIP="build/van-enhancement-suite-${VERSION}-cws-with-key.zip"
else
  ZIP="build/van-enhancement-suite-${VERSION}-cws.zip"
fi

# Never leave a copy of the private key in the staging directory, even if
# zipping fails partway. If a with-key zip was being built and the script is
# exiting non-zero, also remove the (possibly partial) zip rather than leave
# an incomplete copy of the key on disk.
cleanup() {
  status=$?
  rm -f "$STAGE/key.pem"
  if [ -n "$KEY" ] && [ "$status" -ne 0 ]; then
    rm -f "$ZIP"
  fi
}
trap cleanup EXIT

# --- stage only what ships -------------------------------------------------
# Clean only this script's own outputs; build/ also holds the .crx, the .xpi,
# and the other zip variant.
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
cp -R src "$STAGE/"
node tools/cws-manifest.js manifest.json "$STAGE/manifest.json"
find "$STAGE" -name '.DS_Store' -delete
[ -z "$KEY" ] || cp "$KEY" "$STAGE/key.pem"

# --- zip -------------------------------------------------------------------
# Zipped from inside the staging directory so manifest.json sits at the root,
# which the store requires. -X leaves out macOS extended attributes.
(cd "$STAGE" && zip -qrX "../$(basename "$ZIP")" .)

echo "version:  $VERSION"
echo "zip:      $ZIP ($(wc -c <"$ZIP" | tr -d ' ') bytes)"
if [ -n "$KEY" ]; then
  echo
  echo "WARNING: this zip contains the private signing key as key.pem."
  echo "Use it for the FIRST Chrome Web Store upload only. Never attach it to a"
  echo "release, share it, or commit it. Delete it once the item ID is confirmed."
fi
echo
echo "Next: upload $ZIP in the Chrome Web Store developer dashboard."
