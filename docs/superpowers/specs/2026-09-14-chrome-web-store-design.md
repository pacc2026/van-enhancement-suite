# Chrome Web Store (Private) — Design

**Date:** 2026-09-14
**Status:** Approved in brainstorming

## Goal

Publish VAN Enhancement Suite to the Chrome Web Store as a **private** item
that domain staff and outside volunteers can install. Keep the existing
extension ID `cdpjodhdenpjghbajpdlbbhpmdbcpcjh`, so force-installed staff can
move to the store copy by changing the policy source, with no reinstall.

## Decisions

- **Publisher:** the user's Google Workspace developer account (fee paid).
- **Audience:** staff and volunteers. Visibility is Private, shared with a
  Google Group that contains both, with an all-staff group nested inside it
  if needed and outside members allowed. The dashboard may make "everyone in
  the domain" and "trusted testers / groups" mutually exclusive (unverified),
  and one group works either way.
- **Extension ID:** kept by putting the existing signing key in the first
  uploaded zip as `key.pem`. This is reported in Chromium extension developer
  threads but not in Google's current docs, so it is **unverified**. The store
  shows the item ID when the draft is created, before review. If the ID
  differs, delete the draft and decide again.
- **Uploads are manual** through the developer dashboard. Chrome Web Store API
  automation is out of scope.
- **The self-hosted `.crx` channel stays** (`tools/build-crx.sh`,
  `docs/updates.xml`) until staff policy is switched. Removing it is a
  separate change.

## Non-goals

- Code changes in `src/`, or a version bump. The first upload is 0.3.4.
- A public or unlisted listing.
- Store listing graphics (the user supplies screenshots with no voter data).

## Components

### `tools/cws-manifest.js` (+ `tools/cws-manifest.test.js`)

A pure transform `toChromeWebStoreManifest(manifest) → object` that returns a
copy of `manifest.json` without `key` and `update_url`. Both are rejected on
upload, because the store manages identity and updates. Every other field is
unchanged. CLI: `node tools/cws-manifest.js <manifest.json> <output.json>`,
in the same style and error behavior as `tools/firefox-manifest.js`. It's a
separate file so Chrome Web Store rules and Firefox rules evolve
independently.

### `tools/build-cws-zip.sh [--with-key <path/to/key.pem>]`

1. Read `version` from `manifest.json`.
2. Stage `src/` and the generated manifest into `build/cws/`, deleting
   `.DS_Store`.
3. Without `--with-key`: zip the staged directory, with `manifest.json` at the
   zip root, to `build/van-enhancement-suite-<version>-cws.zip`.
4. With `--with-key <pem>`: fail if the file is missing. Otherwise copy it into
   the staging directory as `key.pem`, zip to
   `build/van-enhancement-suite-<version>-cws-with-key.zip`, then delete
   `key.pem` from the staging directory. Print a warning: first upload only,
   contains the private signing key, never attach it to a release, share it,
   or commit it.
5. Clean only its own outputs: `build/cws/` and the zip it's about to write.
   Never touch the `.crx`, `.xpi`, or the other zip.
6. Print the version, the zip path and size, and the next step (upload in the
   dashboard).

### `docs/privacy.md`

A privacy policy served by GitHub Pages at
`https://pacc2026.github.io/van-enhancement-suite/privacy.html`. Its content is
confirmed against `src/` (2026-09-14):

- No data is collected, transmitted, sold, or shared. The extension makes no
  network requests of its own.
- It runs only on `*.votebuilder.com` list-building and turf-cutting pages the
  signed-in user can already see, and changes those pages in the browser.
- It stores in the browser's `localStorage` for votebuilder.com: whether GOTV
  Turf Cutting Mode is on, and the last county and precinct selected (with a
  timestamp), to prefill the turf-cutting form. This never leaves the browser.
- The toolbar popup's only link goes to the project README on GitHub.
- Contact: the project's GitHub repository.

### Docs

- `docs/DEPLOYMENT.md` gets a **Chrome Web Store** section:
  - **First upload:** build the with-key zip, create the item, confirm the ID,
    and delete the draft if it doesn't match.
  - **Visibility:** Private, shared with the Google Group; the admin
    prerequisites are private publishing enabled for the domain and outside
    members allowed in the group.
  - **Privacy-practices text, ready to paste:** single purpose,
    `*.votebuilder.com` host access justification, no remote code, no data
    collected, and the privacy policy URL.
  - **Listing requirements,** with a warning that screenshots must not show
    real voter data.
  - **Moving force-installed staff:** switch the Admin console source from
    "custom URL" to "Chrome Web Store" for the same ID, after the store
    version is live.
  - **Release steps:** add building the no-key zip and uploading it. The
    store needs each upload's version to be higher than the last.
- `README.md`:
  - A Chrome line for volunteers: join the group, then install from
    `https://chromewebstore.google.com/detail/cdpjodhdenpjghbajpdlbbhpmdbcpcjh`
    (valid once the listing is approved and the ID was kept).
  - Files-table rows for the new tools and `docs/privacy.md`.

## Testing

- `node --test 'tools/*.test.js'` passes, including the new transform tests.
- Build the no-key zip, then run `unzip -l`: `manifest.json` is at the root,
  there's no `key.pem`, and the zipped manifest has no `key` or `update_url`.
- Build the with-key zip using a **throwaway** RSA key (never the real `.pem`
  in automated checks): `key.pem` is at the zip root, and `build/cws/` no
  longer contains it.
- Both zips and existing `.crx`/`.xpi` files in `build/` survive each other's
  builds.
- The staged `build/cws/` loads unpacked in Chrome (manual).
- Manual, user: create the draft with the real with-key zip and confirm the
  item ID; complete privacy and listing; submit; after approval, install as a
  group member outside the domain.
