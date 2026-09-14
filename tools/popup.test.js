'use strict';

// Runs src/popup/popup.js against a fake document and chrome runtime. The
// test lives in tools/ rather than beside the popup because the build scripts
// ship everything under src/.

var test = require('node:test');
var assert = require('node:assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'src', 'popup', 'popup.js'), 'utf8');

function run(chrome) {
  var elements = {
    version: { textContent: '', hidden: false },
    year: { textContent: '' }
  };
  var context = {
    document: { getElementById: function (id) { return elements[id]; } },
    Date: Date,
    String: String
  };
  if (chrome !== undefined) context.chrome = chrome;
  vm.runInNewContext(SCRIPT, context);
  return elements;
}

test('shows the installed version', function () {
  var els = run({ runtime: { getManifest: function () { return { version: '1.2.3' }; } } });
  assert.strictEqual(els.version.textContent, 'Version 1.2.3');
  assert.strictEqual(els.version.hidden, false);
});

test('hides the version line when the chrome API is missing', function () {
  var els = run(undefined);
  assert.strictEqual(els.version.hidden, true);
  assert.strictEqual(els.version.textContent, '');
});

test('hides the version line when getManifest throws', function () {
  var els = run({ runtime: { getManifest: function () { throw new Error('nope'); } } });
  assert.strictEqual(els.version.hidden, true);
});

test('fills in the current year', function () {
  var els = run({ runtime: { getManifest: function () { return { version: '1.2.3' }; } } });
  assert.strictEqual(els.year.textContent, String(new Date().getFullYear()));
});

test('fills in the year even when the version is unavailable', function () {
  var els = run(undefined);
  assert.strictEqual(els.year.textContent, String(new Date().getFullYear()));
});
