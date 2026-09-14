# Firefox Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship VAN Enhancement Suite as a Mozilla-signed, self-hosted, auto-updating Firefox add-on for unmanaged volunteers, without changing the Chrome build's behavior or deployment.

**Architecture:** `manifest.json` stays Chrome-shaped and remains the only manifest anyone edits. A Node transform generates the Firefox manifest at build time. `tools/build-xpi.sh` stages, lints, and signs through AMO's unlisted channel, then regenerates `docs/updates.json`, which GitHub Pages serves next to Chrome's `docs/updates.xml`. No code in `src/` changes.

**Tech Stack:** Bash, Node 20+ (built-ins only: `fs`, `crypto`, `node:test`, `node:assert`), `web-ext` 10.6.0 via `npx`, GitHub releases and Pages (`main` branch, `/docs`), `gh` CLI.

**Spec:** `docs/superpowers/specs/2026-09-14-firefox-port-design.md`

## Global Constraints

- Firefox add-on ID, permanent: `van-enhancement-suite@pacc2026.github.io`
- Firefox update manifest URL: `https://pacc2026.github.io/van-enhancement-suite/updates.json`
- `strict_min_version`: `"140.0"` (the spec said 128; raised because AMO requires new add-ons to declare `data_collection_permissions`, which Firefox supports from 140. See the spec's amendment note.)
- `data_collection_permissions`: `{ "required": ["none"] }`
- Pin `web-ext@10.6.0` exactly; always call it through `npx --yes web-ext@10.6.0`.
- Release asset name: `van-enhancement-suite-<version>.xpi`, attached to tag `v<version>`.
- AMO credentials are read only from `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`. Never write them into a file, a command line, or a commit.
- Tools are Node CommonJS scripts in the style of `tools/build-precincts.js`: `'use strict'`, `var`, `require`, a header comment, and no npm dependencies. There is no `package.json`; don't add one.
- Don't change files in `src/` or `manifest.json`'s content (the only exception is the temporary test-version bump in Task 9, Step 4, reverted in the same step).
- American English in comments, docs, and commit messages.
- Outward-facing steps (`gh release create`, pushing to `main`, submitting to AMO) need the user's explicit go-ahead at the time. They're marked **[user approval]**.

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `tools/firefox-manifest.js` | Create | Pure transform from Chrome manifest to Firefox manifest; owns the gecko ID and update URL constants; CLI wrapper |
| `tools/firefox-manifest.test.js` | Create | `node:test` tests for the transform and CLI |
| `tools/firefox-updates.js` | Create | Builds the `updates.json` object and hashes the `.xpi`; CLI wrapper |
| `tools/firefox-updates.test.js` | Create | `node:test` tests for the updates builder and hashing |
| `tools/build-xpi.sh` | Create | Stage → lint → sign → rename → regenerate `docs/updates.json`; `--unsigned` stops after lint |
| `tools/build-crx.sh` | Modify | Clean only its own outputs instead of `rm -rf build` |
| `docs/updates.json` | Generated | Firefox update manifest served by Pages |
| `docs/DEPLOYMENT.md` | Modify | Firefox distribution, credentials, combined release steps |
| `README.md` | Modify | "Install in Firefox" section and new rows in the Files table |
| `docs/superpowers/specs/2026-09-14-firefox-port-design.md` | Modified with this plan | Amendment for data collection and the Firefox 140 floor (already committed) |

---

### Task 1: Firefox manifest transform

**Files:**
- Create: `tools/firefox-manifest.js`
- Test: `tools/firefox-manifest.test.js`

**Interfaces:**
- Consumes: the repo-root `manifest.json`.
- Produces (used by Tasks 2 and 4):
  - `require('./firefox-manifest').GECKO_ID`: string `'van-enhancement-suite@pacc2026.github.io'`
  - `require('./firefox-manifest').UPDATES_JSON_URL`: string
  - `require('./firefox-manifest').toFirefoxManifest(chromeManifest: object) → object`: a new object; the input isn't mutated
  - CLI: `node tools/firefox-manifest.js <chrome-manifest.json> <output.json>`. Writes pretty JSON with a trailing newline and exits 1 with a usage line on the wrong argument count.

- [ ] **Step 1: Write the failing tests**

Create `tools/firefox-manifest.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/firefox-manifest.test.js`
Expected: FAIL with `Cannot find module './firefox-manifest'`.

- [ ] **Step 3: Write the implementation**

Create `tools/firefox-manifest.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/firefox-manifest.test.js`
Expected: PASS, 6 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add tools/firefox-manifest.js tools/firefox-manifest.test.js
git commit -m "Generate the Firefox manifest from the Chrome one"
```

---

### Task 2: Firefox update manifest builder

**Files:**
- Create: `tools/firefox-updates.js`
- Test: `tools/firefox-updates.test.js`

**Interfaces:**
- Consumes: `GECKO_ID` from `tools/firefox-manifest.js` (Task 1).
- Produces (used by Task 4):
  - `require('./firefox-updates').buildUpdates(version: string, sha256Hex: string) → object`
  - `require('./firefox-updates').sha256File(filePath: string) → string` (lowercase hex)
  - CLI: `node tools/firefox-updates.js <version> <xpi-path> <output.json>`. Writes pretty JSON with a trailing newline and exits 1 with a usage line on the wrong argument count.

- [ ] **Step 1: Write the failing tests**

Create `tools/firefox-updates.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/firefox-updates.test.js`
Expected: FAIL with `Cannot find module './firefox-updates'`.

- [ ] **Step 3: Write the implementation**

Create `tools/firefox-updates.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/firefox-updates.test.js`
Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add tools/firefox-updates.js tools/firefox-updates.test.js
git commit -m "Generate the Firefox update manifest"
```

---

### Task 3: Stop build-crx.sh from wiping all of build/

**Files:**
- Modify: `tools/build-crx.sh` (the `# --- stage only what ships ---` block and the `CRX=` assignment after packing)

**Interfaces:**
- Consumes: nothing new.
- Produces: `build-crx.sh` deletes only `build/van-enhancement-suite/`, `build/van-enhancement-suite.crx`, and `build/van-enhancement-suite-<version>.crx`. Task 4 relies on this so the `.xpi` survives a later Chrome build.

This is a shell change with no test harness, so the check is a sentinel file. It needs the signing key at `./van-enhancement-suite.pem` (gitignored; confirm it exists with `ls van-enhancement-suite.pem`) and Chrome at `/Applications/Google Chrome.app`.

- [ ] **Step 1: Show the current bug**

```bash
mkdir -p build && echo sentinel > build/van-enhancement-suite-0.0.0.xpi
tools/build-crx.sh van-enhancement-suite.pem
ls build/van-enhancement-suite-0.0.0.xpi
```

Expected: the build succeeds, then `ls` fails with `No such file or directory`, because `rm -rf build` deleted the sentinel.

- [ ] **Step 2: Scope the cleanup**

In `tools/build-crx.sh`, replace:

```bash
# --- stage only what ships -------------------------------------------------
STAGE=build/van-enhancement-suite
rm -rf build
mkdir -p "$STAGE"
```

with:

```bash
# --- stage only what ships -------------------------------------------------
# Clean only this script's own outputs: build/ also holds the Firefox .xpi
# from tools/build-xpi.sh, and the two builds can run in either order.
STAGE=build/van-enhancement-suite
CRX="build/van-enhancement-suite-${VERSION}.crx"
rm -rf "$STAGE" build/van-enhancement-suite.crx "$CRX"
mkdir -p "$STAGE"
```

Then, in the `# --- pack ---` section, replace:

```bash
CRX="build/van-enhancement-suite-${VERSION}.crx"
mv build/van-enhancement-suite.crx "$CRX"
```

with:

```bash
mv build/van-enhancement-suite.crx "$CRX"
```

- [ ] **Step 3: Verify the sentinel survives and the build still works**

```bash
mkdir -p build && echo sentinel > build/van-enhancement-suite-0.0.0.xpi
tools/build-crx.sh van-enhancement-suite.pem
ls build/van-enhancement-suite-0.0.0.xpi build/van-enhancement-suite-0.3.2.crx
git diff --stat docs/updates.xml
```

Expected: the script prints `version: 0.3.2` and `extension ID: cdpjodhdenpjghbajpdlbbhpmdbcpcjh`, and both files are listed.

- [ ] **Step 4: Undo the side effects of the test build**

The build regenerated `docs/updates.xml` to advertise 0.3.2. Committing that would ship Chrome 0.3.2 before its release exists. Discard it:

```bash
git checkout -- docs/updates.xml
rm build/van-enhancement-suite-0.0.0.xpi
git status --short
```

Expected: only `tools/build-crx.sh` is modified.

- [ ] **Step 5: Commit**

```bash
git add tools/build-crx.sh
git commit -m "Clean only the Chrome build's own outputs in build-crx.sh"
```

---

### Task 4: tools/build-xpi.sh

**Files:**
- Create: `tools/build-xpi.sh` (executable)

**Interfaces:**
- Consumes: `node tools/firefox-manifest.js <in> <out>` (Task 1), `node tools/firefox-updates.js <version> <xpi> <out>` (Task 2), and the scoped cleanup in `build-crx.sh` (Task 3).
- Produces:
  - `tools/build-xpi.sh --unsigned`: leaves the linted staged add-on in `build/firefox/` for `about:debugging`. It needs no credentials and doesn't touch `docs/`.
  - `tools/build-xpi.sh`: creates `build/van-enhancement-suite-<version>.xpi` (Mozilla-signed) and regenerates `docs/updates.json`.
  - It exits 1 before any network call if either `WEB_EXT_API_KEY` or `WEB_EXT_API_SECRET` is unset.

- [ ] **Step 1: Write the script**

Create `tools/build-xpi.sh`:

```bash
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
# Clean only this script's own outputs; build/ also holds the Chrome .crx.
rm -rf "$STAGE" "$SIGNED_DIR" "$XPI"
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
if ! npx --yes "$WEB_EXT" sign --source-dir "$STAGE" --artifacts-dir "$SIGNED_DIR" \
    --channel unlisted --timeout 900000 --no-input --no-config-discovery; then
  cat >&2 <<MSG

Signing did not finish. If AMO accepted the upload, version $VERSION is still
queued there — AMO never accepts the same version twice, so do not bump just to
retry. Once it is approved, download the signed file from
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
```

Then: `chmod +x tools/build-xpi.sh`

- [ ] **Step 2: Verify the missing-credentials guard**

Run: `env -u WEB_EXT_API_KEY -u WEB_EXT_API_SECRET tools/build-xpi.sh; echo "exit=$?"`
Expected: `Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET ...` then `exit=1`. `build/firefox/` isn't created.

- [ ] **Step 3: Verify the unsigned build lints clean**

Run: `tools/build-xpi.sh --unsigned`
Expected: `web-ext lint` reports `errors 0`, and the script prints `Unsigned build staged at build/firefox`. Warnings are allowed, but copy any that appear into the task report. A warning about the 490 KB `precinct-map.js` or about the MAIN world is expected to be harmless; anything about `browser_specific_settings` is not and must be fixed in Task 1's transform (update its test first).

Also run: `node -e "console.log(require('./build/firefox/manifest.json').browser_specific_settings)"`
Expected: the gecko block from the Global Constraints.

- [ ] **Step 4: Verify the unknown-argument guard**

Run: `tools/build-xpi.sh --bogus; echo "exit=$?"`
Expected: `Unknown argument: --bogus ...` then `exit=1`.

- [ ] **Step 5: Commit**

```bash
git add tools/build-xpi.sh
git commit -m "Add the Firefox build and signing script"
```

---

### Task 5: Unsigned smoke test in Firefox (user-run gate)

**Files:** none unless the gate fails (see Step 3).

**Interfaces:**
- Consumes: `tools/build-xpi.sh --unsigned` (Task 4).
- Produces: a recorded decision on MV3 host access, which Task 6 and the README section in Task 8 depend on.

This needs a VAN login, so **the user runs it**. The executor prepares the build and records the results.

- [ ] **Step 1: Stage the build**

Run: `tools/build-xpi.sh --unsigned`

- [ ] **Step 2: User runs the checks in Firefox 140+**

1. `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `build/firefox/manifest.json`.
2. In `about:addons` → VAN Enhancement Suite → **Permissions**, note whether access to `votebuilder.com` is already on.
3. On a `https://<subdomain>.votebuilder.com/CreateAList.aspx` page, check that the Targets checkbox picker renders and selecting works, and that on MyVoters the GOTV Turf Cutting toggle appears and applies its presets.
4. On `TurfCutter.aspx`, check that the Save My Map Region modal prefills the county and precinct.
5. Open the browser console (Ctrl+Shift+J / Cmd+Shift+J) and note any errors from the extension's scripts.

Record for each check: pass or fail, plus the Permissions state from item 2.

- [ ] **Step 3: Apply the gate**

- **All pass with host access already granted:** no change. Continue to Task 6.
- **Scripts don't run until access is turned on under Permissions:** ask the user to choose:
  - **(a) Document the step.** Task 8's README section includes "Open `about:addons` → VAN Enhancement Suite → Permissions and turn on access to votebuilder.com." No code change.
  - **(b) Generate an MV2 manifest for Firefox.** In `tools/firefox-manifest.test.js`, add:

    ```js
    test('targets Manifest V2 in Firefox so site access is granted at install', function () {
      assert.strictEqual(fm.toFirefoxManifest(CHROME).manifest_version, 2);
    });
    ```

    and change the `keeps every other field` test's `expected` to also set `expected.manifest_version = 2;`. Run `node --test tools/firefox-manifest.test.js` and confirm the new test fails. Then in `toFirefoxManifest`, after `delete firefox.update_url;`, add:

    ```js
      // MV2 grants content-script host access at install; MV3 in Firefox may
      // leave it for the user to turn on. MAIN-world scripts work under MV2
      // in Firefox 128+.
      firefox.manifest_version = 2;
    ```

    Rerun the tests (all pass), rerun `tools/build-xpi.sh --unsigned` (lint `errors 0`), and have the user repeat Step 2. Commit with `git commit -am "Use Manifest V2 for the Firefox build"`.
- **A feature check fails for another reason:** stop and debug with superpowers:systematic-debugging before continuing. The spec assumed no `src/` changes, so this is a scope change to raise with the user.

---

### Task 6: First signed build, release assets, and install-link check

**Files:**
- Possibly modify: `tools/build-xpi.sh` (Step 5, only if the gate needs it)
- Generated: `build/van-enhancement-suite-0.3.2.xpi`, `build/van-enhancement-suite-0.3.2.crx`, `docs/updates.json`, `docs/updates.xml`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: GitHub release `v0.3.2` with both assets; a decided volunteer install URL (release URL or Pages URL) for Task 8.

Prerequisite (user): a team-owned AMO account with API credentials exported in the shell as `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET`.

- [ ] **Step 1: Build both artifacts**

```bash
tools/build-crx.sh /path/to/van-enhancement-suite.pem
tools/build-xpi.sh
ls -l build/van-enhancement-suite-0.3.2.crx build/van-enhancement-suite-0.3.2.xpi
```

Expected: both files exist. `git status --short` shows `docs/updates.xml` modified and `docs/updates.json` new. **Don't commit either yet**: committing to `main` is what ships them. If signing times out, follow the script's printed recovery steps and resume at `ls -l`.

- [ ] **Step 2: Create the release [user approval]**

This publishes version 0.3.2's files, but no browser updates until the manifests are committed to `main` in Task 9.

```bash
gh release create v0.3.2 build/van-enhancement-suite-0.3.2.crx build/van-enhancement-suite-0.3.2.xpi \
  --title v0.3.2 --notes "Complete statewide precinct list; GOTV mode offered only on MyVoters. First Firefox build."
```

- [ ] **Step 3: Check how GitHub serves the .xpi**

```bash
curl -sIL https://github.com/pacc2026/van-enhancement-suite/releases/download/v0.3.2/van-enhancement-suite-0.3.2.xpi | grep -i '^content-type'
```

Record the final `content-type`.

- [ ] **Step 4: User installs from the release link in a clean profile**

1. Create a clean profile: `/Applications/Firefox.app/Contents/MacOS/firefox -P` → **Create Profile** → start it.
2. Paste the release URL from Step 3 into the address bar.
3. Record whether Firefox shows the **Add VAN Enhancement Suite?** prompt or just downloads the file. If it shows the prompt, record the permission text it displays.
4. If it installed, open a `CreateAList.aspx` page and confirm the Targets picker renders (plus any Permissions step decided in Task 5).

- [ ] **Step 5: Apply the install-link gate**

- **The prompt appeared:** the volunteer link is the `.xpi` asset on the latest release (`https://github.com/pacc2026/van-enhancement-suite/releases/latest`). Its filename includes the version, so docs link to the release page and name the asset. No code change.
- **It only downloaded:** publish a fixed-name copy on Pages. In `tools/build-xpi.sh`, after the `node tools/firefox-updates.js ...` line, add:

  ```bash
  # GitHub release downloads are served as generic binaries, which Firefox
  # saves instead of installing. Pages serves .xpi as application/x-xpinstall,
  # so volunteers install from this fixed-name copy. Updates still come from
  # the release asset named in docs/updates.json.
  cp "$XPI" docs/van-enhancement-suite.xpi
  ```

  Then run `cp build/van-enhancement-suite-0.3.2.xpi docs/van-enhancement-suite.xpi` so this release has the copy too (don't re-sign; AMO rejects a repeated version). Commit only the script: `git add tools/build-xpi.sh && git commit -m "Publish a fixed-name .xpi on Pages for installs"`. The copy in `docs/` gets committed in Task 9, and its content type is checked there.

---

### Task 7: Docs — DEPLOYMENT.md and README.md

**Files:**
- Modify: `docs/DEPLOYMENT.md` (header table, new Firefox section before `## The signing key`, `## Ship a new version` steps)
- Modify: `README.md` (`## Install` section, `## Files` table)

**Interfaces:**
- Consumes: the Task 5 permissions decision and the Task 6 install-link decision.
- Produces: nothing code-facing.

- [ ] **Step 1: Update the DEPLOYMENT.md intro and table**

Replace the first paragraph (`This extension is **self-hosted** — ... not by clicking an install link.`) with:

```markdown
This extension is **self-hosted** — it is in neither the Chrome Web Store nor
the public Firefox add-ons site. Chrome permits self-hosted extensions only in
managed environments, so Chrome users get it through enterprise policy.
Firefox installs any Mozilla-signed add-on, so Firefox users install it from a
link — see [Firefox](#firefox).
```

Replace the table with:

```markdown
| | |
|---|---|
| Chrome extension ID | `cdpjodhdenpjghbajpdlbbhpmdbcpcjh` |
| Chrome update manifest | `https://pacc2026.github.io/van-enhancement-suite/updates.xml` |
| Firefox add-on ID | `van-enhancement-suite@pacc2026.github.io` |
| Firefox update manifest | `https://pacc2026.github.io/van-enhancement-suite/updates.json` |
| Downloads (.crx and .xpi) | [GitHub releases](https://github.com/pacc2026/van-enhancement-suite/releases) |
```

- [ ] **Step 2: Replace the `## Ship a new version` section**

Replace everything from `## Ship a new version` up to (not including) `## The signing key` with:

````markdown
## Ship a new version

Both browsers poll their update manifest and install the linked file when its
`version` is higher than the installed one. A release is: bump, build both,
upload, then publish both manifests.

1. Bump `"version"` in `manifest.json`. Neither browser downgrades, and
   addons.mozilla.org never accepts the same version twice — even one whose
   signing failed.
2. Regenerate the precinct map if `precincts.csv` changed:
   `node tools/build-precincts.js`
3. Pack and sign for Chrome, passing the signing key:
   `tools/build-crx.sh /path/to/van-enhancement-suite.pem`
4. Pack and sign for Firefox, with AMO credentials in the environment:
   `WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... tools/build-xpi.sh`
5. Attach both to a matching tag:
   `gh release create v<version> build/van-enhancement-suite-<version>.crx build/van-enhancement-suite-<version>.xpi --title v<version> --notes "..."`
6. Commit the regenerated `docs/updates.xml` and `docs/updates.json`. **This is
   the step that actually ships** — until a manifest advertises the new
   version, nothing updates.

Do steps 5 and 6 in that order. If a manifest advertises a version whose file
is not uploaded yet, every copy in that browser gets a download error until it
is.

### When Mozilla is slow

Signing usually takes minutes but can take up to 24 hours, or longer if
Mozilla picks the version for manual review. Chrome does not have to wait:

1. Create the release with the `.crx` only, and commit only `docs/updates.xml`.
2. When signing finishes (`tools/build-xpi.sh` prints the recovery steps if it
   timed out), `gh release upload v<version> build/van-enhancement-suite-<version>.xpi`.
3. Commit `docs/updates.json`.
````

If Task 6 chose the Pages copy, change step 6's first sentence to `Commit the regenerated docs/updates.xml, docs/updates.json and docs/van-enhancement-suite.xpi.` and slow-path step 3 to `Commit docs/updates.json and docs/van-enhancement-suite.xpi.`

- [ ] **Step 3: Add the Firefox section before `## The signing key`**

````markdown
## Firefox

Firefox users are not managed, so there is no policy to push. Release Firefox
installs only add-ons Mozilla has signed, including self-distributed ones, so
each version is submitted to addons.mozilla.org (AMO) on the **unlisted**
channel: Mozilla validates and signs it, and it never appears in public
search. Volunteers install once from a link, and Firefox keeps them updated
from `updates.json`.

- **Minimum version:** Firefox 140. Firefox for Android is not supported.
- **Add-on ID:** `van-enhancement-suite@pacc2026.github.io`. Permanent: AMO
  binds it on the first signing. A different ID is a different add-on that
  every volunteer would have to reinstall.
- **Install link for volunteers:** INSTALL_LINK
- **Data collection:** the manifest declares none, which AMO requires of every
  new add-on. Keep it that way unless the extension starts sending data
  somewhere.

The Firefox manifest is generated at build time by `tools/firefox-manifest.js`
from `manifest.json`. Never hand-edit a Firefox manifest; change the transform.

### The AMO account and API credentials

The AMO account and its API key and secret are to Firefox what the `.pem` is
to Chrome: whoever holds them can push code to every installed Firefox copy.

- The account belongs to the team, not to one person's Firefox account.
- The key and secret live in the team password manager, reachable by more than
  one person. Generate them at
  https://addons.mozilla.org/developers/addon/api/key/.
- Pass them to `tools/build-xpi.sh` as `WEB_EXT_API_KEY` and
  `WEB_EXT_API_SECRET` environment variables. Never commit them.

If Mozilla requests source code during a manual review, `src/precinct-map.js`
is generated from `precincts.csv` by `tools/build-precincts.js`; both are in
this repo.
````

Replace `INSTALL_LINK` according to the Task 6 decision:
- Pages copy: `` `https://pacc2026.github.io/van-enhancement-suite/van-enhancement-suite.xpi` ``
- Release asset: `the \`van-enhancement-suite-<version>.xpi\` asset on the [latest release](https://github.com/pacc2026/van-enhancement-suite/releases/latest)`

- [ ] **Step 4: Update README.md `## Install`**

Replace the section's first paragraph (`Staff do not install this by hand. ... release steps.`) with:

```markdown
**Chrome:** staff do not install this by hand. It is self-hosted and
force-installed on managed browsers through enterprise policy — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the rollout and release steps.

**Firefox (140 or newer):**

1. Open INSTALL_LINK in Firefox.
2. Click **Add** when Firefox asks to add VAN Enhancement Suite. It asks for
   access to your data on votebuilder.com — that is how it changes VAN's pages.
PERMISSION_STEP
3. Reload any open VAN page.

Firefox checks for updates on its own; there is nothing to reinstall.
```

Replace `INSTALL_LINK` with the same link used in Step 3. Replace `PERMISSION_STEP` with nothing (delete the line) if Task 5 passed or chose MV2. If Task 5 chose (a), replace it with:
`   Then open \`about:addons\` → **VAN Enhancement Suite** → **Permissions** and turn on access to votebuilder.com.`

Under the Chrome local-development list, add:

```markdown
To run it locally in Firefox, run `tools/build-xpi.sh --unsigned`, then in
`about:debugging` → **This Firefox** → **Load Temporary Add-on**, select
`build/firefox/manifest.json`. Temporary add-ons are removed when Firefox
quits.
```

- [ ] **Step 5: Update the README `## Files` table**

After the `| \`tools/build-crx.sh\` | ... |` row, add:

```markdown
| `tools/build-xpi.sh` | Builds and Mozilla-signs the Firefox .xpi, regenerates updates.json |
| `tools/firefox-manifest.js` | Generates the Firefox manifest from manifest.json at build time |
| `tools/firefox-updates.js` | Writes the Firefox update manifest for a signed .xpi |
| `tools/*.test.js` | Tests for the Firefox build tools — `node --test tools/` |
```

After the `| \`docs/updates.xml\` | ... |` row, add:

```markdown
| `docs/updates.json` | GENERATED update manifest Firefox polls for new versions |
```

If Task 6 chose the Pages copy, also add:
`| \`docs/van-enhancement-suite.xpi\` | GENERATED fixed-name copy of the latest signed .xpi, for installs |`

- [ ] **Step 6: Check for leftover placeholders**

Run: `grep -n 'INSTALL_LINK\|PERMISSION_STEP' README.md docs/DEPLOYMENT.md`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add README.md docs/DEPLOYMENT.md
git commit -m "Document Firefox install and release steps"
```

---

### Task 8: Final checks before merge

**Files:** none.

- [ ] **Step 1: Run the tool tests once**

Run: `node --test tools/`
Expected: 10 tests pass (11 if Task 5 chose MV2), 0 failures.

- [ ] **Step 2: Check both builds in either order**

The `.xpi` from Task 6 is already in `build/`. Rerun only the Chrome build, which is free and doesn't touch AMO:

```bash
tools/build-crx.sh /path/to/van-enhancement-suite.pem
ls build/van-enhancement-suite-0.3.2.crx build/van-enhancement-suite-0.3.2.xpi
```

Expected: both are listed. `src/` is unchanged on the branch: `git diff main --stat -- src manifest.json` prints nothing.

---

### Task 9: Merge, ship, and test auto-update

**Files:**
- Commit: `docs/updates.xml`, `docs/updates.json` (and `docs/van-enhancement-suite.xpi` if Task 6 chose it)

**Interfaces:**
- Consumes: everything above.
- Produces: 0.3.2 live for both browsers, and a verified Firefox auto-update.

Hold the volunteer announcement until Step 5 passes. Until then, the only Firefox installs are the tester's.

- [ ] **Step 1: Commit the manifests on the branch**

```bash
git add docs/updates.xml docs/updates.json
# plus, if Task 6 chose the Pages copy:  git add docs/van-enhancement-suite.xpi
git commit -m "Ship v0.3.2 for Chrome and Firefox"
```

- [ ] **Step 2: Merge to main [user approval]**

Use superpowers:finishing-a-development-branch. Pushing `main` ships 0.3.2 to Chrome users and publishes the Firefox manifest.

- [ ] **Step 3: Verify Pages serves the new files**

```bash
curl -s https://pacc2026.github.io/van-enhancement-suite/updates.json
curl -sI https://pacc2026.github.io/van-enhancement-suite/updates.xml | head -1
# if Task 6 chose the Pages copy:
curl -sI https://pacc2026.github.io/van-enhancement-suite/van-enhancement-suite.xpi | grep -i '^content-type'
```

Expected: the JSON advertises `0.3.2`, and `updates.xml` returns `HTTP/2 200`. For the Pages copy, `content-type: application/x-xpinstall`. If it's anything else, stop and tell the user: the planned install link won't prompt, so volunteers need the fallback of downloading the file and dragging it onto `about:addons`.

- [ ] **Step 4: Build a throwaway test version [user approval]**

This spends version `0.3.4.1` on AMO forever, and nothing ever reuses it. Chrome isn't involved.

```bash
sed -i '' 's/"version": "0.3.4"/"version": "0.3.4.1"/' manifest.json
tools/build-xpi.sh
git checkout -- manifest.json
gh release create v0.3.4.1 build/van-enhancement-suite-0.3.4.1.xpi --prerelease --title "v0.3.4.1 (Firefox update test)" --notes "Throwaway build to verify Firefox auto-update. Do not install."
git add docs/updates.json
git commit -m "Advertise Firefox test version 0.3.4.1"
```

Before pushing, check branch protection: `gh api repos/pacc2026/van-enhancement-suite/rulesets` and
`gh api repos/pacc2026/van-enhancement-suite/branches/main/protection`. If pushes to `main` are
blocked, open a PR for the `updates.json` commit instead of pushing directly.

```bash
git push origin main
```

If Task 6 chose the Pages copy, `build-xpi.sh` also updated `docs/van-enhancement-suite.xpi`. It's the same code, so commit it with `updates.json`.

- [ ] **Step 5: User verifies auto-update**

1. Wait until `curl -s https://pacc2026.github.io/van-enhancement-suite/updates.json` shows `0.3.4.1`.
2. In the test profile from Task 6 (with 0.3.4 installed), go to `about:addons` → gear menu → **Check for Updates**.
3. Confirm VAN Enhancement Suite now shows version 0.3.4.1 and the Targets picker still works on `CreateAList.aspx`.

Expected: it updates without a prompt. If not, check `about:config` → `extensions.logging.enabled` = true, rerun the check, and read the Browser Console (Cmd+Shift+J) for the update error before changing anything.

- [ ] **Step 6: Announce**

Give volunteers the install link and the README's Firefox section. The next real release (0.3.3 or later) supersedes the test version through the normal flow.
