'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

var fu = require('./firefox-updates');

var ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

test('builds the update manifest for one version', function () {
  assert.deepStrictEqual(fu.buildUpdates('0.3.2', 'deadbeef'), {
    addons: {
      'van-enhancement-suite@pacc2026.github.io': {
        updates: [
          {
            version: '0.3.2',
            update_link: 'https://github.com/pacc2026/van-enhancement-suite/releases/download/v0.3.2/van-enhancement-suite-0.3.2.xpi',
            update_hash: 'sha256:deadbeef'
          }
        ]
      }
    }
  });
});

test('hashes a file as lowercase sha256 hex', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-updates-'));
  var file = path.join(dir, 'a.xpi');
  fs.writeFileSync(file, 'abc');
  assert.strictEqual(fu.sha256File(file), ABC_SHA256);
});

test('CLI writes updates.json for the given xpi', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-updates-'));
  var xpi = path.join(dir, 'a.xpi');
  var out = path.join(dir, 'updates.json');
  fs.writeFileSync(xpi, 'abc');
  var result = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, 'firefox-updates.js'), '1.2.3', xpi, out], { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  var text = fs.readFileSync(out, 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.deepStrictEqual(JSON.parse(text), fu.buildUpdates('1.2.3', ABC_SHA256));
});

test('CLI exits 1 with usage on missing arguments', function () {
  var result = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, 'firefox-updates.js'), '1.2.3'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
