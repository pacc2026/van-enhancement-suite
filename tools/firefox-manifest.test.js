'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

var fm = require('./firefox-manifest');

var ROOT = path.join(__dirname, '..');
var CHROME = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

test('removes the Chrome-only key and update_url', function () {
  var out = fm.toFirefoxManifest(CHROME);
  assert.strictEqual('key' in out, false);
  assert.strictEqual('update_url' in out, false);
});

test('adds the gecko settings', function () {
  var out = fm.toFirefoxManifest(CHROME);
  assert.deepStrictEqual(out.browser_specific_settings, {
    gecko: {
      id: 'van-enhancement-suite@pacc2026.github.io',
      strict_min_version: '140.0',
      update_url: 'https://pacc2026.github.io/van-enhancement-suite/updates.json',
      data_collection_permissions: { required: ['none'] }
    }
  });
});

test('keeps every other field, including MAIN-world content scripts', function () {
  var out = fm.toFirefoxManifest(CHROME);
  var expected = JSON.parse(JSON.stringify(CHROME));
  delete expected.key;
  delete expected.update_url;
  var actual = JSON.parse(JSON.stringify(out));
  delete actual.browser_specific_settings;
  assert.deepStrictEqual(actual, expected);
  assert.ok(out.content_scripts.some(function (cs) { return cs.world === 'MAIN'; }));
});

test('does not mutate its input', function () {
  var input = JSON.parse(JSON.stringify(CHROME));
  fm.toFirefoxManifest(input);
  assert.deepStrictEqual(input, CHROME);
});

test('CLI writes the transformed manifest', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-manifest-'));
  var outPath = path.join(dir, 'manifest.json');
  var result = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, 'firefox-manifest.js'), path.join(ROOT, 'manifest.json'), outPath],
    { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  var text = fs.readFileSync(outPath, 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.deepStrictEqual(JSON.parse(text), fm.toFirefoxManifest(CHROME));
});

test('CLI exits 1 with usage on missing arguments', function () {
  var result = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, 'firefox-manifest.js')], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
