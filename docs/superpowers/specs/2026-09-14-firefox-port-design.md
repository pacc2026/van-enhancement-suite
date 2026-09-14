# Firefox Port — Design

**Date:** 2026-09-14
**Status:** Approved in brainstorming; awaiting spec review

## Goal

Make VAN Enhancement Suite installable and auto-updating in desktop Firefox for
**unmanaged** volunteers (personal Firefox, no enterprise policy), without
changing how the Chrome build is packed, deployed, or behaves.

## Non-goals

- Firefox for Android.
- A public (listed) addons.mozilla.org (AMO) listing.
- Enterprise/policy force-install for Firefox.
- Any change to extension behavior or to the Chrome deployment flow.

## Background

- The content scripts use no `chrome.*` / `browser.*` APIs. All four scripts run
  with `"world": "MAIN"` and rely only on the page's `jQuery` and
  `localStorage`. No code in `src/` needs to change.
- Firefox supports MAIN-world content scripts declared in `manifest.json` from
  Firefox 128.
- Release Firefox installs only Mozilla-signed add-ons, including
  self-distributed ones. Self-distributed add-ons are signed by submitting them
  to AMO on the **unlisted** channel. Automated validation runs first; signing
  can take up to 24 hours, and Mozilla may pick a version for manual review at
  any time.
- Firefox reads a JSON update manifest from
  `browser_specific_settings.gecko.update_url`; it cannot read Chrome's
  `docs/updates.xml`.

## Approach

`manifest.json` stays as is: Chrome-shaped and still the only manifest anyone
edits. The Firefox build generates a Firefox manifest from it at build time.
Rejected alternatives:

- **One cross-browser manifest.** Leaves a permanent warning in Chrome, and
  it's unverified whether AMO validation accepts a root-level `update_url`.
- **A separate Firefox copy of the source.** Duplicates the scripts, and the
  copies drift apart.

## 1. Firefox manifest

`tools/firefox-manifest.js` (Node, same as `tools/build-precincts.js`) reads
`manifest.json` and writes the staged Firefox manifest.

- **Removed:** `key` and the root-level `update_url` (both Chrome-only).
- **Kept unchanged:** `manifest_version` (3), `name`, `version`, `description`,
  `icons`, and every `content_scripts` entry, including `"world": "MAIN"`.
- **Added:**

  ```json
  "browser_specific_settings": {
    "gecko": {
      "id": "van-enhancement-suite@pacc2026.github.io",
      "strict_min_version": "128.0",
      "update_url": "https://pacc2026.github.io/van-enhancement-suite/updates.json"
    }
  }
  ```

The add-on ID is **permanent**: it is bound on the first signing, and every
later update must carry it. Both browsers always ship the same version, read
from `manifest.json`.

**Open risk — host access under MV3.** It is unverified whether Firefox grants
`*.votebuilder.com` access at install time for this MV3 manifest, or treats it
as access the user must turn on later. Testing step 2 settles this before any
signing. If access is not granted, either generate an MV2 manifest for Firefox
(Firefox 128 supports MAIN-world scripts under MV2 as well) or add the
permission step to the volunteer install instructions. The choice is made
during implementation, based on what testing shows.

## 2. Build and signing — `tools/build-xpi.sh`

Set up the same way as `tools/build-crx.sh`:

1. Read `version` from `manifest.json`; fail if it's missing.
2. Stage `src/` and the generated manifest into `build/firefox/`, deleting
   `.DS_Store` files.
3. Run `npx web-ext@<pinned version> lint` on the staged directory; fail on
   errors.
4. Run `npx web-ext@<pinned version> sign --channel unlisted` on the staged
   directory. Credentials come only from `WEB_EXT_API_KEY` and
   `WEB_EXT_API_SECRET`; fail early with a clear message if either is unset. If
   signing times out waiting for Mozilla, exit non-zero and explain that the
   version is still queued on AMO and the signed file can be downloaded from
   the Developer Hub once it's approved.
5. Move the signed output to `build/van-enhancement-suite-<version>.xpi` and
   delete `build/firefox/`.
6. Regenerate `docs/updates.json`:

   ```json
   {
     "addons": {
       "van-enhancement-suite@pacc2026.github.io": {
         "updates": [
           {
             "version": "<version>",
             "update_link": "https://github.com/pacc2026/van-enhancement-suite/releases/download/v<version>/van-enhancement-suite-<version>.xpi",
             "update_hash": "sha256:<hex digest of the .xpi>"
           }
         ]
       }
     }
   }
   ```

Pin the exact `web-ext` version in the script during implementation (8.x or
later, which supports signing both new add-ons and updates to them).

**Change to `tools/build-crx.sh`:** replace `rm -rf build` with removal of only
its own files (its staging directory and any existing `.crx` for the version
being built). Running either build must never delete the other's output.

**Credentials:** the AMO account and API key/secret control updates for every
installed Firefox copy, the same role `van-enhancement-suite.pem` plays for
Chrome. The account belongs to the team, not a personal account, and the
credentials live in the team password manager, reachable by more than one
person. They are never committed.

**Review note:** `src/precinct-map.js` (~490 KB) is generated, readable data, not
minified code. If Mozilla asks for source during manual review, point them to
`tools/build-precincts.js` and `precincts.csv` in the repo.

## 3. Release flow and docs

**Normal release:**

1. Bump `version` in `manifest.json`.
2. `node tools/build-precincts.js` if `precincts.csv` changed.
3. `tools/build-crx.sh /path/to/van-enhancement-suite.pem`
4. `tools/build-xpi.sh` (AMO credentials in the environment).
5. `gh release create v<version> build/van-enhancement-suite-<version>.crx build/van-enhancement-suite-<version>.xpi --title v<version> --notes "..."`
6. Commit `docs/updates.xml` and `docs/updates.json`. This is the step that
   ships, for both browsers.

**If Firefox signing is slow:** create the release with the `.crx` only and
commit only `docs/updates.xml`. Once signing finishes, run `gh release upload`
for the `.xpi`, then commit `docs/updates.json`. The existing rule holds for
both browsers: never advertise a version before its file is uploaded.

**Volunteer install link:** Firefox shows its install prompt only when the file
is served as `application/x-xpinstall`. GitHub release downloads may be served
as a generic binary, which makes Firefox save the file instead of installing
it. Testing step 3 checks this. If the release URL doesn't prompt,
`build-xpi.sh` also copies the signed file to
`docs/van-enhancement-suite.xpi` (a fixed name, served by GitHub Pages), and
the volunteer link points there. Auto-updates via `update_link` don't depend on
the file type.

**Docs:**

- `docs/DEPLOYMENT.md` — add a Firefox section covering the add-on ID, AMO
  account ownership and credentials, the release steps above, and the
  slow-signing path. The Chrome content is unchanged except for the new
  combined release steps.
- `README.md` — add an "Install in Firefox" section for volunteers: the install
  link, what the permission prompt asks for, and Firefox 128+ as the minimum.

## 4. Testing

There are no automated tests; verification is manual, in this order:

1. **Lint:** `web-ext lint` passes on the generated manifest.
2. **Unsigned smoke test:** load the staged directory through `about:debugging`
   → Load Temporary Add-on. On `CreateAList.aspx`, check the Targets checkbox
   picker and the GOTV mode toggle (MyVoters only). On `TurfCutter.aspx`, check
   the precinct prefill and save-region. This also resolves the MV3 host-access
   risk. It requires a VAN login, so the user runs it or provides a logged-in
   session.
3. **Signed install:** sign the current version, install it from the volunteer
   link in a clean Firefox profile, and confirm the scripts run with no extra
   permission steps (or only the documented ones).
4. **Auto-update:** publish a higher test version to `updates.json` from a test
   tag. In `about:addons`, use Check for Updates and confirm the add-on updates.
   Don't point real volunteers at the test release.
5. **Chrome regression:** `build-crx.sh` still produces a `.crx` and a correct
   `updates.xml`, and running both builds in either order leaves both artifacts
   in place.

## Prerequisites (owner: user)

- A team-owned AMO developer account, with an API key and secret generated and
  stored in the password manager.
- A Firefox 128+ install for testing and a VAN login for step 2.
