#!/usr/bin/env node
// Writes the manifest.json uploaded to the Chrome Web Store.
//
// The store manages an item's identity and updates itself, so it rejects a
// manifest carrying `key` or `update_url` — both of which the self-hosted
// build in the repo root needs. Everything else ships unchanged. The extension
// ID is instead kept by uploading the signing key as key.pem on the first
// upload (see tools/build-cws-zip.sh). This runs at build time; its output is
// never committed.
//
// Usage: node tools/cws-manifest.js <manifest.json> <output.json>

'use strict';

var fs = require('fs');

function toChromeWebStoreManifest(manifest) {
  var store = JSON.parse(JSON.stringify(manifest));
  delete store.key;
  delete store.update_url;
  return store;
}

module.exports = { toChromeWebStoreManifest: toChromeWebStoreManifest };

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.length !== 2) {
    console.error('Usage: node tools/cws-manifest.js <manifest.json> <output.json>');
    process.exit(1);
  }
  var manifest = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  fs.writeFileSync(args[1], JSON.stringify(toChromeWebStoreManifest(manifest), null, 2) + '\n');
}
