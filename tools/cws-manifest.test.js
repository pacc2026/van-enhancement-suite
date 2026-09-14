'use strict';

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var childProcess = require('child_process');

var cws = require('./cws-manifest');

var ROOT = path.join(__dirname, '..');
var MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

test('removes key and update_url', function () {
  var out = cws.toChromeWebStoreManifest(MANIFEST);
  assert.strictEqual('key' in out, false);
  assert.strictEqual('update_url' in out, false);
});

test('keeps every other field unchanged', function () {
  var expected = JSON.parse(JSON.stringify(MANIFEST));
  delete expected.key;
  delete expected.update_url;
  assert.deepStrictEqual(cws.toChromeWebStoreManifest(MANIFEST), expected);
});

test('does not mutate its input', function () {
  var input = JSON.parse(JSON.stringify(MANIFEST));
  cws.toChromeWebStoreManifest(input);
  assert.deepStrictEqual(input, MANIFEST);
});

test('description fits the store limit of 132 characters', function () {
  assert.ok(MANIFEST.description.length <= 132, 'description is ' + MANIFEST.description.length + ' characters');
});

test('CLI writes the transformed manifest', function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cws-manifest-'));
  var outPath = path.join(dir, 'manifest.json');
  var result = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, 'cws-manifest.js'), path.join(ROOT, 'manifest.json'), outPath],
    { encoding: 'utf8' });
  assert.strictEqual(result.status, 0, result.stderr);
  var text = fs.readFileSync(outPath, 'utf8');
  assert.ok(text.endsWith('\n'));
  assert.deepStrictEqual(JSON.parse(text), cws.toChromeWebStoreManifest(MANIFEST));
});

test('CLI exits 1 with usage on missing arguments', function () {
  var result = childProcess.spawnSync(process.execPath,
    [path.join(__dirname, 'cws-manifest.js')], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
