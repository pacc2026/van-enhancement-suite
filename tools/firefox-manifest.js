#!/usr/bin/env node
// Writes the Firefox manifest.json from the Chrome one.
//
// manifest.json in the repo root is Chrome-shaped and stays the only manifest
// anyone edits. Firefox has no use for Chrome's `key` or root-level
// `update_url`, and needs its own add-on ID, update manifest, and data
// collection declaration under browser_specific_settings.gecko. This runs at
// build time from tools/build-xpi.sh; its output is never committed.
//
// Usage: node tools/firefox-manifest.js <chrome-manifest.json> <output.json>

'use strict';

var fs = require('fs');

// Permanent. AMO binds it on the first signing, and every later update must
// carry it — a different ID is a different add-on that volunteers reinstall.
var GECKO_ID = 'van-enhancement-suite@pacc2026.github.io';

var UPDATES_JSON_URL = 'https://pacc2026.github.io/van-enhancement-suite/updates.json';

// MAIN-world content scripts need 128. AMO requires new add-ons to declare
// data_collection_permissions, which Firefox understands from 140.
var MIN_FIREFOX = '140.0';

// Firefox for Android isn't supported, but lint checks the Android floor
// against data_collection_permissions too, and Android only understands that
// key from 142 — a higher floor than desktop's. Declare gecko_android's own
// floor rather than raise the desktop one.
var MIN_FIREFOX_ANDROID = '142.0';

function toFirefoxManifest(chrome) {
  var firefox = JSON.parse(JSON.stringify(chrome));
  delete firefox.key;
  delete firefox.update_url;
  firefox.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: MIN_FIREFOX,
      update_url: UPDATES_JSON_URL,
      // The extension only rearranges VAN's own pages; nothing leaves the browser.
      data_collection_permissions: { required: ['none'] }
    },
    gecko_android: {
      strict_min_version: MIN_FIREFOX_ANDROID
    }
  };
  return firefox;
}

module.exports = {
  GECKO_ID: GECKO_ID,
  UPDATES_JSON_URL: UPDATES_JSON_URL,
  toFirefoxManifest: toFirefoxManifest
};

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node tools/firefox-manifest.js <chrome-manifest.json> <output.json>');
    process.exit(1);
  }
  var chrome = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  fs.writeFileSync(args[1], JSON.stringify(toFirefoxManifest(chrome), null, 2) + '\n');
}
