#!/usr/bin/env bash
# Packs the Firefox add-on, gets it signed by Mozilla, and regenerates the
# Firefox update manifest.
#
# Usage: tools/build-xpi.sh              stage, lint, sign, write docs/updates.json
#        tools/build-xpi.sh --unsigned   stage and lint only; load build/firefox/
#                                        via about:debugging → Load Temporary Add-on
#
# Release Firefox installs only add-ons Mozilla has signed, so this submits the
# build to addons.mozilla.org on the *unlisted* channel: signed, never listed
# publicly. Signing needs AMO API credentials in WEB_EXT_API_KEY and
# WEB_EXT_API_SECRET. Like the Chrome .pem, whoever holds them controls updates
# to every installed copy — keep them in the team password manager, never in
# this repo.

set -euo pipefail

cd "$(dirname "$0")/.."

WEB_EXT="web-ext@10.6.0"

UNSIGNED=false
case "${1:-}" in
  "") ;;
  --unsigned) UNSIGNED=true ;;
  *) echo "Unknown argument: $1 (expected nothing or --unsigned)" >&2; exit 1 ;;
esac

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$VERSION" ] || { echo "Could not read version from manifest.json" >&2; exit 1; }

if ! $UNSIGNED; then
  if [ -z "${WEB_EXT_API_KEY:-}" ] || [ -z "${WEB_EXT_API_SECRET:-}" ]; then
    echo "Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET (AMO API credentials, from the team password manager)." >&2
    exit 1
  fi
fi

STAGE=build/firefox
SIGNED_DIR=build/firefox-signed
XPI="build/van-enhancement-suite-${VERSION}.xpi"

# --- stage only what ships -------------------------------------------------
# Clean only this script's own outputs; build/ also holds the Chrome .crx and
# any already-signed .xpi files, which are left alone here. The signing path
# below refuses to run at all if this version's .xpi already exists, rather
# than overwriting it.
rm -rf "$STAGE" "$SIGNED_DIR"
mkdir -p "$STAGE"
cp -R src "$STAGE/"
node tools/firefox-manifest.js manifest.json "$STAGE/manifest.json"
find "$STAGE" -name '.DS_Store' -delete

# --- lint ------------------------------------------------------------------
# Seconds, versus a signing round-trip that can take hours to reject the same
# problem. --self-hosted drops advice that only applies to listed add-ons.
npx --yes "$WEB_EXT" lint --source-dir "$STAGE" --self-hosted --no-config-discovery

if $UNSIGNED; then
  echo
  echo "Unsigned build staged at $STAGE"
  echo "Load it in Firefox: about:debugging → This Firefox → Load Temporary Add-on → $STAGE/manifest.json"
  exit 0
fi

# --- sign ------------------------------------------------------------------
# web-ext reads WEB_EXT_API_KEY / WEB_EXT_API_SECRET from the environment, so
# the credentials never appear in the process list.
#
# Refuse before submitting anything: AMO never accepts the same version
# twice, so a local .xpi for this version means it is already signed and
# there is nothing useful this run could do.
if [ -e "$XPI" ]; then
  echo "$XPI already exists: version $VERSION is already signed, and AMO never accepts the same version twice. Bump \"version\" in manifest.json to build a new one." >&2
  exit 1
fi
if ! npx --yes "$WEB_EXT" sign --source-dir "$STAGE" --artifacts-dir "$SIGNED_DIR" \
    --channel unlisted --timeout 900000 --no-input --no-config-discovery; then
  cat >&2 <<MSG

Signing did not finish. Read the web-ext output above: if it reports
validation errors or bad credentials, fix those — the version was not
accepted, so fixing the problem and rerunning is safe. If it timed out
waiting for approval, version $VERSION is still queued there — AMO never
accepts the same version twice, so do not bump just to retry. Once it is
approved, download the signed file from
https://addons.mozilla.org/developers/addons, save it as $XPI, then run:

  node tools/firefox-updates.js $VERSION $XPI docs/updates.json
MSG
  exit 1
fi

SIGNED=$(find "$SIGNED_DIR" -name '*.xpi')
[ "$(printf '%s\n' "$SIGNED" | grep -c .)" = "1" ] || { echo "Expected exactly one signed .xpi in $SIGNED_DIR, found: $SIGNED" >&2; exit 1; }
mv "$SIGNED" "$XPI"
rm -rf "$STAGE" "$SIGNED_DIR"

# --- update manifest -------------------------------------------------------
node tools/firefox-updates.js "$VERSION" "$XPI" docs/updates.json

echo "version:      $VERSION"
echo "add-on ID:    van-enhancement-suite@pacc2026.github.io"
echo "xpi:          $XPI ($(wc -c <"$XPI" | tr -d ' ') bytes)"
echo "update json:  docs/updates.json  ->  https://pacc2026.github.io/van-enhancement-suite/updates.json"
echo
echo "Next: attach $XPI to the v$VERSION release,"
echo "      then commit docs/updates.json so Firefox sees the new version."
