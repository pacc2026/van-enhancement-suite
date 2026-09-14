# Toolbar Popup — Design

**Date:** 2026-09-14
**Status:** Approved in brainstorming; awaiting spec review

## Goal

Clicking the extension's toolbar icon, in Chrome or Firefox, opens a small
popup that identifies the extension: its icon and name, the installed version,
a link to help, and an ownership line.

## Non-goals

- Settings, toggles, or anything else interactive beyond the help link.
- New permissions. The popup must not change what the install or update prompt
  asks for.
- Changes to the content scripts or how they behave.

## Contents

Top to bottom, about 260px wide:

1. The 48px extension icon (`src/icons/icon48.png`) beside **VAN Enhancement
   Suite** in bold.
2. `Version <version>` under the name, where `<version>` is the installed
   version read at runtime from `chrome.runtime.getManifest().version`.
3. A link, **Help & install instructions**, to
   `https://github.com/pacc2026/van-enhancement-suite#readme`, opening in a new
   tab.
4. A small gray footer: `PA Dems © <year>`, where `<year>` is the current year
   from `new Date().getFullYear()` when the popup opens.

## Architecture

- **`manifest.json`** gains:

  ```json
  "action": {
    "default_title": "VAN Enhancement Suite",
    "default_popup": "src/popup/popup.html"
  }
  ```

  The toolbar button uses the existing `icons`, so no `default_icon` is needed.
- **`src/popup/popup.html`** is static markup. It loads `popup.css` and
  `popup.js` as separate files, because both browsers' extension-page content
  security policy blocks inline scripts.
- **`src/popup/popup.js`** fills in the version and the year. If
  `chrome.runtime.getManifest` is unavailable or throws, it hides the version
  line instead of showing an empty "Version". The year always renders.
- **`src/popup/popup.css`** uses the neutral palette already in
  `src/gotv-mode.css`: text `#2b3239`, border `#d6dbe0`, muted `#6b7784`.

Nothing else changes:

- **Builds:** `tools/build-crx.sh` and `tools/build-xpi.sh` copy all of `src/`,
  so the popup ships automatically.
- **Firefox manifest:** `tools/firefox-manifest.js` passes unknown keys through
  unchanged, and its "keeps every other field" test compares against the real
  `manifest.json`, so the new `action` key is covered with no test changes.
  Firefox MV3 supports `action` with `default_popup`.

## Version

The popup ships in **0.3.4**, the version already in `manifest.json` and not
yet signed on addons.mozilla.org.

## Docs

`README.md` Files table: rows for `src/popup/popup.html`, `popup.css`, and
`popup.js`.

## Testing

1. `node --test 'tools/*.test.js'` passes.
2. `tools/build-xpi.sh --unsigned` lints with 0 errors and 0 warnings.
3. Manual check in Chrome (load unpacked from the repo root) and Firefox
   (`about:debugging` → Load Temporary Add-on → `build/firefox/manifest.json`).
   Click the toolbar icon and confirm:
   - the icon and name render;
   - the version reads `Version 0.3.4`;
   - the help link opens the README in a new tab;
   - the footer reads `PA Dems © 2026`;
   - the popup has no horizontal scrollbar and no console errors (inspect the
     popup).
