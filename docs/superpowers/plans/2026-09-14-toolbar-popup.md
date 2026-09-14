# Toolbar Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the toolbar icon in Chrome or Firefox opens a popup with the extension's icon and name, installed version, a help link, and "PA Dems © <year>".

**Architecture:** A static extension page at `src/popup/popup.html`, registered as the manifest's `action.default_popup`, with its CSS and JS in separate files because extension-page CSP blocks inline scripts. `popup.js` reads the version from `chrome.runtime.getManifest()` and the year from `Date`. It's tested in Node by running the script in a `vm` context with a fake `document` and `chrome`.

**Tech Stack:** HTML/CSS/ES5 JavaScript (no build step, no dependencies), Node 20+ `node:test` and `vm` for tests, `web-ext@10.6.0` lint.

**Spec:** `docs/superpowers/specs/2026-09-14-toolbar-popup-design.md`

## Global Constraints

- Help link: `https://github.com/pacc2026/van-enhancement-suite#readme`, opened in a new tab with `rel="noopener noreferrer"`.
- Footer text: `PA Dems © <year>`, with `<year>` from `new Date().getFullYear()` at popup open.
- Version line: `Version <version>` from `chrome.runtime.getManifest().version`. Hidden if that call is unavailable or throws.
- Manifest `action`: `{ "default_title": "VAN Enhancement Suite", "default_popup": "src/popup/popup.html" }`. No `default_icon`, no new permissions.
- Palette from `src/gotv-mode.css`: text `#2b3239`, border `#d6dbe0`, muted `#6b7784`.
- No inline `<script>` or `style=""` attributes.
- Version stays `0.3.4` (already in `manifest.json`, not yet signed). Don't bump it.
- Tests must live in `tools/` (matched by `node --test 'tools/*.test.js'`), never under `src/`, because both build scripts ship all of `src/`.
- Don't stage or commit `docs/updates.xml` or `docs/updates.json`. They're intentionally uncommitted generated files.
- American English. Match the repo's JS style: `'use strict'`, `var`, ES5 functions, short explanatory comments.

## File Structure

| Path | Status | Responsibility |
| --- | --- | --- |
| `src/popup/popup.html` | Create | Popup markup |
| `src/popup/popup.css` | Create | Popup styling |
| `src/popup/popup.js` | Create | Fills in version and year |
| `tools/popup.test.js` | Create | Runs `popup.js` against a fake DOM and `chrome` |
| `manifest.json` | Modify | Add `action` |
| `README.md` | Modify | Files table rows |

---

### Task 1: Toolbar popup

**Files:**
- Create: `src/popup/popup.html`, `src/popup/popup.css`, `src/popup/popup.js`
- Test: `tools/popup.test.js`
- Modify: `manifest.json` (add `action` after `icons`), `README.md` (`## Files` table)

**Interfaces:**
- Consumes: `src/icons/icon48.png` (exists).
- Produces: elements `#version` (a `<p>`) and `#year` (a `<span>`) in `popup.html`, which `popup.js` fills. Nothing else depends on them.

- [ ] **Step 1: Write the failing tests**

Create `tools/popup.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tools/popup.test.js`
Expected: FAIL with `ENOENT` for `src/popup/popup.js`.

- [ ] **Step 3: Write `popup.js`**

Create `src/popup/popup.js`:

```js
// Fills in the toolbar popup's version and copyright year.
//
// Loaded as a separate file because extension pages' content security policy
// blocks inline scripts in both Chrome and Firefox.

'use strict';

(function () {
  var version = document.getElementById('version');
  try {
    version.textContent = 'Version ' + chrome.runtime.getManifest().version;
  } catch (e) {
    // Better no line than a bare "Version" with nothing after it.
    version.hidden = true;
  }

  document.getElementById('year').textContent = String(new Date().getFullYear());
})();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tools/popup.test.js`
Expected: PASS, 5 tests, 0 failures.

- [ ] **Step 5: Write `popup.html` and `popup.css`**

Create `src/popup/popup.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>VAN Enhancement Suite</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <header class="popup-header">
    <img class="popup-icon" src="../icons/icon48.png" width="48" height="48" alt="">
    <div>
      <h1 class="popup-name">VAN Enhancement Suite</h1>
      <p id="version" class="popup-version"></p>
    </div>
  </header>

  <a class="popup-help" href="https://github.com/pacc2026/van-enhancement-suite#readme"
     target="_blank" rel="noopener noreferrer">Help &amp; install instructions</a>

  <footer class="popup-footer">PA Dems &copy; <span id="year"></span></footer>

  <script src="popup.js"></script>
</body>
</html>
```

Create `src/popup/popup.css`:

```css
/* Toolbar popup. Colors follow the neutral palette in gotv-mode.css. */

body {
  width: 260px;
  margin: 0;
  padding: 14px 16px 12px;
  color: #2b3239;
  background: #fff;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.popup-icon {
  flex: 0 0 auto;
}

.popup-name {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
}

.popup-version {
  margin: 2px 0 0;
  color: #6b7784;
}

.popup-help {
  display: block;
  margin: 14px 0 0;
  padding: 10px 0 0;
  border-top: 1px solid #d6dbe0;
  color: #1a5fb4;
  text-decoration: none;
}

.popup-help:hover,
.popup-help:focus-visible {
  text-decoration: underline;
}

.popup-footer {
  margin: 10px 0 0;
  color: #6b7784;
  font-size: 11px;
}
```

- [ ] **Step 6: Register the popup in `manifest.json`**

Add after the `"icons": { ... },` block:

```json
  "action": {
    "default_title": "VAN Enhancement Suite",
    "default_popup": "src/popup/popup.html"
  },
```

Run: `node -e "var m=require('./manifest.json'); console.log(m.version, JSON.stringify(m.action))"`
Expected: `0.3.4 {"default_title":"VAN Enhancement Suite","default_popup":"src/popup/popup.html"}`

- [ ] **Step 7: Update the README Files table**

In `README.md` `## Files`, after the `| \`src/gotv-mode.css\` | ... |` row, add:

```markdown
| `src/popup/popup.html` | Toolbar popup: icon, name, version, help link, ownership line |
| `src/popup/popup.css` | Popup styling |
| `src/popup/popup.js` | Fills in the popup's version and year |
```

Change the existing `tools/*.test.js` row's description to: `Tests for the Firefox build tools and the popup script — \`node --test 'tools/*.test.js'\``

- [ ] **Step 8: Run all checks once**

```bash
node --test 'tools/*.test.js'
tools/build-xpi.sh --unsigned
node -e "console.log(JSON.stringify(require('./build/firefox/manifest.json').action))"
ls build/firefox/src/popup/
```

Expected: 15 tests pass, 0 fail. Lint `errors 0`, `warnings 0`. The Firefox manifest `action` is identical to Step 6. `popup.css popup.html popup.js` are listed.

- [ ] **Step 9: Commit**

```bash
git add src/popup/popup.html src/popup/popup.css src/popup/popup.js tools/popup.test.js manifest.json README.md
git commit -m "Add a toolbar popup with version, help link, and ownership line"
```

- [ ] **Step 10: Manual check (user)**

In Chrome, go to `chrome://extensions` → reload the unpacked extension. In Firefox, go to `about:debugging` → reload the temporary add-on from `build/firefox/manifest.json`. Click the toolbar icon (in Chrome, via the puzzle-piece menu if it isn't pinned) and confirm:
- The icon and name render side by side.
- `Version 0.3.4` shows.
- **Help & install instructions** opens the README in a new tab.
- The footer reads `PA Dems © 2026`.
- There's no horizontal scrollbar. Right-click the popup → Inspect shows no console errors.
