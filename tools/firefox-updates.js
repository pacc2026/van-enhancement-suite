#!/usr/bin/env node
// Writes docs/updates.json, the update manifest Firefox polls.
//
// Firefox reads browser_specific_settings.gecko.update_url (see
// tools/firefox-manifest.js), compares the version here to the installed one,
// and downloads update_link when it is newer. update_hash makes Firefox reject
// a download that isn't the file we signed. This is the Firefox counterpart of
// docs/updates.xml, and like it, committing it is what ships a release.
//
// Usage: node tools/firefox-updates.js <version> <xpi-path> <output.json>

'use strict';

var crypto = require('crypto');
var fs = require('fs');

var GECKO_ID = require('./firefox-manifest').GECKO_ID;

var RELEASE_BASE = 'https://github.com/pacc2026/van-enhancement-suite/releases/download';

function buildUpdates(version, sha256Hex) {
  var addons = {};
  addons[GECKO_ID] = {
    updates: [
      {
        version: version,
        update_link: RELEASE_BASE + '/v' + version + '/van-enhancement-suite-' + version + '.xpi',
        update_hash: 'sha256:' + sha256Hex
      }
    ]
  };
  return { addons: addons };
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

module.exports = { buildUpdates: buildUpdates, sha256File: sha256File };

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error('Usage: node tools/firefox-updates.js <version> <xpi-path> <output.json>');
    process.exit(1);
  }
  var updates = buildUpdates(args[0], sha256File(args[1]));
  fs.writeFileSync(args[2], JSON.stringify(updates, null, 2) + '\n');
}
