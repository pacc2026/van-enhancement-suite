# Chrome Web Store (Private) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce Chrome Web Store upload zips (one with the signing key for the first upload, one without for later uploads), a privacy policy page, and the docs for publishing privately while keeping extension ID `cdpjodhdenpjghbajpdlbbhpmdbcpcjh`.

**Architecture:** `tools/cws-manifest.js` strips `key` and `update_url` from `manifest.json`. `tools/build-cws-zip.sh` stages `src/` plus that manifest and zips it, with `--with-key` adding `key.pem` for the first upload. `docs/privacy.md` is served by GitHub Pages. `docs/DEPLOYMENT.md` and `README.md` document the dashboard steps. No `src/` changes.

**Tech Stack:** Node 20+ built-ins (`node:test`), Bash, macOS `/usr/bin/zip` and `unzip`, `openssl` (only to make a throwaway test key), GitHub Pages (Jekyll, `main:/docs`).

**Spec:** `docs/superpowers/specs/2026-09-14-chrome-web-store-design.md`

## Global Constraints

- Extension ID to keep: `cdpjodhdenpjghbajpdlbbhpmdbcpcjh`
- Store install URL: `https://chromewebstore.google.com/detail/cdpjodhdenpjghbajpdlbbhpmdbcpcjh`
- Privacy policy URL: `https://pacc2026.github.io/van-enhancement-suite/privacy.html`
- Zip names: `build/van-enhancement-suite-<version>-cws.zip` and `build/van-enhancement-suite-<version>-cws-with-key.zip`. Staging dir: `build/cws/`.
- **Never use the real `van-enhancement-suite.pem` in automated checks.** Use a throwaway key generated with `openssl` in a temp directory. Never commit, attach, or print any `.pem` or with-key zip.
- Each build script cleans only its own outputs. Never delete `.crx`, `.xpi`, or the other zip variant.
- No `src/` changes; `manifest.json` stays at version `0.3.4`.
- Tools are Node CommonJS in the style of `tools/firefox-manifest.js` (`'use strict'`, `var`, header comment, no npm dependencies, no `package.json`). Tests live in `tools/*.test.js`.
- American English. Don't stage `docs/updates.xml` or `docs/updates.json`.

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `tools/cws-manifest.js` | Create | Chrome Web Store manifest transform + CLI |
| `tools/cws-manifest.test.js` | Create | Tests for the transform and CLI |
| `tools/build-cws-zip.sh` | Create | Stage and zip for upload; `--with-key` for the first upload |
| `docs/privacy.md` | Create | Privacy policy page for the store listing |
| `docs/DEPLOYMENT.md` | Modify | Intro/table, release steps, new "Chrome Web Store" section |
| `README.md` | Modify | Chrome volunteer install line, Files rows |

---

### Task 1: Chrome Web Store manifest transform

**Files:**
- Create: `tools/cws-manifest.js`
- Test: `tools/cws-manifest.test.js`

**Interfaces:**
- Produces: `require('./cws-manifest').toChromeWebStoreManifest(manifest: object) → object` (new object, input not mutated); CLI `node tools/cws-manifest.js <manifest.json> <output.json>` writes pretty JSON plus a trailing newline, and exits 1 with `Usage:` on the wrong argument count. Task 2 calls the CLI.

- [ ] **Step 1: Write the failing tests**

Create `tools/cws-manifest.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/cws-manifest.test.js`
Expected: FAIL with `Cannot find module './cws-manifest'`.

- [ ] **Step 3: Write the implementation**

Create `tools/cws-manifest.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/cws-manifest.test.js`
Expected: PASS, 6 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add tools/cws-manifest.js tools/cws-manifest.test.js
git commit -m "Generate the Chrome Web Store manifest"
```

---

### Task 2: tools/build-cws-zip.sh

**Files:**
- Create: `tools/build-cws-zip.sh` (executable)

**Interfaces:**
- Consumes: `node tools/cws-manifest.js <in> <out>` (Task 1).
- Produces: `build/van-enhancement-suite-<version>-cws.zip` (no flag) or `build/van-enhancement-suite-<version>-cws-with-key.zip` (`--with-key <pem>`), each with `manifest.json` at the zip root. The staging dir `build/cws/` never retains `key.pem`. Task 3 documents these names.

- [ ] **Step 1: Write the script**

Create `tools/build-cws-zip.sh`:

```bash
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

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$VERSION" ] || { echo "Could not read version from manifest.json" >&2; exit 1; }

STAGE=build/cws
if [ -n "$KEY" ]; then
  ZIP="build/van-enhancement-suite-${VERSION}-cws-with-key.zip"
else
  ZIP="build/van-enhancement-suite-${VERSION}-cws.zip"
fi

# Never leave a copy of the private key in the staging directory, even if
# zipping fails partway.
trap 'rm -f "$STAGE/key.pem"' EXIT

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
```

Then: `chmod +x tools/build-cws-zip.sh`

- [ ] **Step 2: Verify the no-key zip**

```bash
tools/build-cws-zip.sh
unzip -l build/van-enhancement-suite-0.3.4-cws.zip | grep -E ' manifest.json$| key.pem$| src/popup/popup.html$'
unzip -p build/van-enhancement-suite-0.3.4-cws.zip manifest.json | node -e "var s='';process.stdin.on('data',function(d){s+=d}).on('end',function(){var m=JSON.parse(s);console.log(m.version,'key' in m,'update_url' in m)})"
```

Expected: the listing shows `manifest.json` (no directory prefix) and `src/popup/popup.html`, and no `key.pem`. The node line prints `0.3.4 false false`.

- [ ] **Step 3: Verify the with-key zip using a throwaway key**

```bash
TMP=$(mktemp -d) && openssl genrsa -out "$TMP/throwaway.pem" 2048 2>/dev/null
tools/build-cws-zip.sh --with-key "$TMP/throwaway.pem"
unzip -l build/van-enhancement-suite-0.3.4-cws-with-key.zip | grep -E ' key.pem$| manifest.json$'
ls build/cws/key.pem; echo "stage-key-exit=$?"
ls build/van-enhancement-suite-0.3.4-cws.zip
rm -rf "$TMP" build/van-enhancement-suite-0.3.4-cws-with-key.zip
```

Expected: the listing shows both `key.pem` and `manifest.json` at the root. `ls build/cws/key.pem` fails and prints `stage-key-exit=1`, because the trap removed it. The no-key zip from Step 2 still exists. The throwaway with-key zip is deleted at the end.

- [ ] **Step 4: Verify argument guards and neighbors survive**

```bash
tools/build-cws-zip.sh --with-key; echo "exit=$?"
tools/build-cws-zip.sh --with-key /nonexistent.pem; echo "exit=$?"
tools/build-cws-zip.sh --bogus; echo "exit=$?"
ls build/*.crx build/*.xpi
```

Expected: three `exit=1` lines with their messages. The existing `.crx` and `.xpi` files are still listed.

- [ ] **Step 5: Commit**

```bash
git add tools/build-cws-zip.sh
git commit -m "Add the Chrome Web Store zip build"
```

---

### Task 3: Privacy policy and docs

**Files:**
- Create: `docs/privacy.md`
- Modify: `docs/DEPLOYMENT.md`, `README.md`

**Interfaces:**
- Consumes: zip names and flags from Task 2; URLs from Global Constraints.

- [ ] **Step 1: Write `docs/privacy.md`**

```markdown
---
title: Privacy policy — VAN Enhancement Suite
---

# Privacy policy — VAN Enhancement Suite

Effective September 14, 2026.

VAN Enhancement Suite is a browser extension used by PA Dems staff and
volunteers. It rearranges and prefills VAN's list-building and turf-cutting
pages to make them faster to use.

## What it collects

Nothing. The extension does not collect, transmit, sell, or share any data.
It makes no network requests of its own and contains no analytics or tracking.

## What it does in your browser

- It runs only on `votebuilder.com` list-building and turf-cutting pages that
  you are already signed in to and allowed to see, and changes how those pages
  look and behave in your browser.
- Actions you take on those pages, such as running a search or saving a map
  region, are sent to VAN by VAN's own page, exactly as they would be without
  the extension.

## What it stores

In your browser's local storage for `votebuilder.com`, it keeps:

- whether GOTV Turf Cutting Mode is switched on, and
- the county and precinct you last selected, with the time you selected them,
  so the turf-cutting page can prefill the region name and folder.

This stays in your browser and is never sent anywhere by the extension. Clearing
your browser's site data for votebuilder.com removes it.

## Links

The toolbar popup links to the project's README on GitHub. Following that link
is subject to GitHub's own privacy policy.

## Contact

Questions about this policy: open an issue at
https://github.com/pacc2026/van-enhancement-suite/issues or contact PA Dems.
```

- [ ] **Step 2: Update the DEPLOYMENT.md intro and table**

Replace the opening paragraph (`This extension is **self-hosted** — it is in neither the Chrome Web Store nor ... see [Firefox](#firefox).`) with:

```markdown
This extension reaches users three ways. Managed Chrome profiles get it
through enterprise policy, from a self-hosted update URL. Anyone in the
extension's Google Group can install it from a **private** Chrome Web Store
listing — see [Chrome Web Store](#chrome-web-store). Firefox users install a
Mozilla-signed add-on from a link — see [Firefox](#firefox).
```

In the table, after the `| Chrome update manifest | ... |` row, add:

```markdown
| Chrome Web Store (private) | `https://chromewebstore.google.com/detail/cdpjodhdenpjghbajpdlbbhpmdbcpcjh` |
| Privacy policy | `https://pacc2026.github.io/van-enhancement-suite/privacy.html` |
```

- [ ] **Step 3: Update the release steps**

In `## Ship a new version`:
- Change the intro sentence `A release is: bump, build both, upload, then publish both manifests.` to `A release is: bump, build everything, upload, then publish both update manifests and submit the store upload.`
- After step 3 (`Pack and sign for Chrome ...`), insert a new step 4 and renumber the following steps (Firefox becomes 5, release becomes 6, commit becomes 7):

```markdown
4. Build the Chrome Web Store zip (no key):
   `tools/build-cws-zip.sh`
```

- Change step 6's `gh release create` line so it still attaches only the `.crx` and `.xpi` (never a zip).
- After the commit step, add:

```markdown
8. In the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole),
   open the item → **Package** → **Upload new package**, upload
   `build/van-enhancement-suite-<version>-cws.zip`, and **Submit for review**.
   Store users get the version once review passes, usually within a few days;
   it does not depend on steps 6–7.
```

- Change `Do steps 5 and 6 in that order.` to `Do steps 6 and 7 in that order.`

- [ ] **Step 4: Add the Chrome Web Store section**

Insert before `## Firefox`:

````markdown
## Chrome Web Store

The store listing is **private**: only members of the extension's Google Group
can see or install it. It is reviewed like any public item, so each upload
takes a few days to go live. It keeps the self-hosted extension ID, so it is
the same extension whether it arrived by policy or from the store.

### Before the first upload (Workspace admin)

- In the Google Admin console, allow private Chrome Web Store publishing for
  the domain.
- Create the Google Group that should have access (nest an all-staff group
  inside it if you like), and allow members from outside the organization if
  volunteers use personal Google accounts. The group must be owned or managed
  by the developer account.

### First upload — keeps the extension ID

1. Build a zip that includes the signing key (see [The signing key](#the-signing-key)):
   `tools/build-cws-zip.sh --with-key /path/to/van-enhancement-suite.pem`
2. In the [developer dashboard](https://chrome.google.com/webstore/devconsole),
   click **New item** and upload
   `build/van-enhancement-suite-<version>-cws-with-key.zip`.
3. **Check the item ID** the dashboard shows. It must be
   `cdpjodhdenpjghbajpdlbbhpmdbcpcjh`. If it is anything else, delete the
   draft before submitting — publishing it would create a second, separate
   extension.
4. Delete the with-key zip: `rm build/van-enhancement-suite-*-cws-with-key.zip`.
   Every later upload uses the plain zip.

Keeping the ID by uploading `key.pem` is reported by Chromium extension
developers but not described in Google's current documentation — step 3 is
what confirms it worked.

### Distribution

**Distribution** tab → Visibility **Private** → share with the Google Group
(add it under the account's trusted testers / groups settings).

### Privacy practices (paste these)

- **Single purpose:** Speeds up VAN's list-building and turf-cutting pages for
  campaign staff by simplifying target selection and prefilling turf-cutting
  forms.
- **Host permission justification (`https://*.votebuilder.com/*`):** The
  extension's only function is to modify VAN's CreateAList and TurfCutter
  pages, which are served from votebuilder.com subdomains that differ by
  committee. It runs on no other sites.
- **Remote code:** No, I am not using remote code.
- **Data usage:** check none of the data types. The extension collects and
  transmits no user data.
- **Certifications:** check all three.
- **Privacy policy URL:** `https://pacc2026.github.io/van-enhancement-suite/privacy.html`

### Store listing

Fill in a description, category (**Productivity**), language, and the 128px
icon (`src/icons/icon128.png`), plus the screenshots and promo images the
dashboard marks as required (screenshots are 1280×800).

**Screenshots must not show real voter data.** Use a test committee, or blur
names, addresses, and any voter details before uploading.

### Moving force-installed staff to the store copy

Once the store version is live and its ID is confirmed: in the Google Admin
console (**Devices → Chrome → Apps & extensions → Users & browsers**), select
`cdpjodhdenpjghbajpdlbbhpmdbcpcjh` and change its source from **From a custom
URL** to **Chrome Web Store**, keeping **Force install**. Because the ID is
unchanged, installed copies switch update source without reinstalling. The
self-hosted `updates.xml` and `.crx` releases stay until every org unit is
switched; retire them in a separate change.

### Installing as a volunteer

Join the Google Group with the Google account you use in Chrome, then open
https://chromewebstore.google.com/detail/cdpjodhdenpjghbajpdlbbhpmdbcpcjh and
click **Add to Chrome**.
````

- [ ] **Step 5: Update README.md**

In `## Install`, replace the `**Chrome:** staff do not install this by hand. ...` paragraph with:

```markdown
**Chrome:** staff on managed browsers get it automatically through enterprise
policy. Anyone else with access — members of the extension's Google Group —
installs it from the private
[Chrome Web Store listing](https://chromewebstore.google.com/detail/cdpjodhdenpjghbajpdlbbhpmdbcpcjh)
while signed in to Chrome with that Google account. See
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for rollout and release steps.
```

In the `## Files` table, after the `tools/firefox-updates.js` row, add:

```markdown
| `tools/build-cws-zip.sh` | Builds the Chrome Web Store upload zip; `--with-key` for the first upload only |
| `tools/cws-manifest.js` | Generates the Chrome Web Store manifest (no `key` or `update_url`) |
```

Change the `tools/*.test.js` row's description to `Tests for the build tools and the popup script — \`node --test 'tools/*.test.js'\``.

After the `docs/updates.json` row, add:

```markdown
| `docs/privacy.md` | Privacy policy linked from the Chrome Web Store listing |
```

- [ ] **Step 6: Check**

```bash
grep -n 'neither the Chrome Web Store' docs/DEPLOYMENT.md README.md
grep -c 'cdpjodhdenpjghbajpdlbbhpmdbcpcjh' docs/DEPLOYMENT.md
grep -n '^[0-9]\.' docs/DEPLOYMENT.md | sed -n '1,20p'
```

Expected: the first grep prints nothing. The ID appears several times. The `Ship a new version` steps are numbered 1–8 without gaps, and the first-upload steps 1–4.

- [ ] **Step 7: Commit**

```bash
git add docs/privacy.md docs/DEPLOYMENT.md README.md
git commit -m "Document private Chrome Web Store publishing and add a privacy policy"
```

---

### Task 4: User — first upload (manual, after merge)

Pages must serve `privacy.html` before the privacy tab can reference it, so this runs after the branch is merged.

- [ ] Confirm `curl -sI https://pacc2026.github.io/van-enhancement-suite/privacy.html` returns `HTTP/2 200`.
- [ ] Follow DEPLOYMENT.md → Chrome Web Store: admin prerequisites, then the with-key build and draft creation. **Confirm the item ID** before anything else.
- [ ] Fill in the privacy practices and listing, set Private + the group, and submit.
- [ ] After approval, install from the store link as a group member who is not in the domain.
