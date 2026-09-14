# Deploying VAN Enhancement Suite

This extension reaches users three ways. Managed Chrome profiles get it
through enterprise policy, from a self-hosted update URL. Anyone in the
extension's Google Group can install it from a **private** Chrome Web Store
listing — see [Chrome Web Store](#chrome-web-store). Firefox users install a
Mozilla-signed add-on from a link — see [Firefox](#firefox).

| | |
|---|---|
| Chrome extension ID | `cdpjodhdenpjghbajpdlbbhpmdbcpcjh` |
| Chrome update manifest | `https://pacc2026.github.io/van-enhancement-suite/updates.xml` |
| Chrome Web Store (private) | `https://chromewebstore.google.com/detail/cdpjodhdenpjghbajpdlbbhpmdbcpcjh` (available once the listing is approved) |
| Privacy policy | `https://pacc2026.github.io/van-enhancement-suite/privacy.html` |
| Firefox add-on ID | `van-enhancement-suite@pacc2026.github.io` |
| Firefox update manifest | `https://pacc2026.github.io/van-enhancement-suite/updates.json` |
| Downloads (.crx and .xpi) | [GitHub releases](https://github.com/pacc2026/van-enhancement-suite/releases) |

The extension ID is derived from the signing key and is permanent. It changes
only if the key is lost or replaced — at which point every installed copy
becomes a different extension and has to be re-pushed.

## Prerequisite: Chrome policy has to reach the user

Chrome allows self-hosted extensions only where enterprise policy applies.
Two mechanisms deliver it, and either is enough:

- **Managed Chrome profile** — the user signs in to *Chrome itself* with their
  Workspace account, and `Users & browsers` policy follows them to any device.
  This needs no enrollment token and is what we use.
- **Chrome Enterprise Core** — the browser installation is enrolled, so policy
  applies regardless of who signs in. Useful for shared machines.

The trap: signing in to Gmail or Drive **in a tab is not signing in to
Chrome**. Only a managed Chrome profile receives this policy. Verify on a test
machine at `chrome://policy` before rolling out.

### Network egress

The CRX download redirects from `github.com` to
`objects.githubusercontent.com`, so allowlisting only `github.com` yields a
policy that applies and an extension that never installs. All three of
`pacc2026.github.io`, `github.com` and `objects.githubusercontent.com` must be
reachable from the user's network.

### Allowed extension types

If **Additional settings → Allowed types of apps and extensions** has been
restricted, `Extension` must be among the permitted types or force-install
fails without a useful error. An `ExtensionInstallBlocklist` of `*` is fine —
a `force_installed` entry outranks it.

## Push it to users

In the Google Admin console: **Devices → Chrome → Apps & extensions → Users &
browsers**, select the target org unit, then **+ → Add Chrome app or extension
by ID**. Start with an org unit containing only yourself — users cannot remove
a force-installed extension, so a mistake is awkward to walk back.

Set the source dropdown to **From a custom URL**, not the Chrome Web Store.
Left on the default it fails, because this ID is not in the store.

- **Extension ID:** `cdpjodhdenpjghbajpdlbbhpmdbcpcjh`
- **From a custom URL:** `https://pacc2026.github.io/van-enhancement-suite/updates.xml`
- **Installation policy:** Force install

Equivalent raw policy, if you set policy by MDM instead:

```json
{
  "ExtensionSettings": {
    "cdpjodhdenpjghbajpdlbbhpmdbcpcjh": {
      "installation_mode": "force_installed",
      "update_url": "https://pacc2026.github.io/van-enhancement-suite/updates.xml"
    }
  }
}
```

If your org sets `ExtensionInstallBlocklist` to `*`, a `force_installed` entry
still takes precedence — no separate allowlist entry is needed.

## Ship a new version

Both browsers poll their update manifest and install the linked file when its
`version` is higher than the installed one. A release is: bump, build
everything, upload, then publish both update manifests and submit the store
upload.

1. Bump `"version"` in `manifest.json`. Neither browser downgrades, and
   addons.mozilla.org never accepts the same version twice — even one whose
   signing failed. The Chrome Web Store has the same rule: each upload must
   carry a higher version than the last one uploaded, including one that was
   rejected or is still pending review.
2. Regenerate the precinct map if `precincts.csv` changed:
   `node tools/build-precincts.js`
3. Pack and sign for Chrome, passing the signing key:
   `tools/build-crx.sh /path/to/van-enhancement-suite.pem`
4. Build the Chrome Web Store zip (no key):
   `tools/build-cws-zip.sh`
5. Pack and sign for Firefox, with AMO credentials read into the environment
   without echoing them or saving them to shell history:

   ```bash
   read -rs WEB_EXT_API_KEY && read -rs WEB_EXT_API_SECRET
   export WEB_EXT_API_KEY WEB_EXT_API_SECRET
   tools/build-xpi.sh
   ```

   Paste the key, press Enter, paste the secret, press Enter — nothing is
   shown.
6. Attach both to a matching tag (the `.crx` and `.xpi` only — never a zip):
   `gh release create v<version> build/van-enhancement-suite-<version>.crx build/van-enhancement-suite-<version>.xpi --title v<version> --notes "..."`
7. Commit the regenerated `docs/updates.xml` and `docs/updates.json`. **This is
   the step that actually ships** — until a manifest advertises the new
   version, nothing updates.
8. In the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole),
   open the item → **Package** → **Upload new package**, upload
   `build/van-enhancement-suite-<version>-cws.zip`, and **Submit for review**.
   Store users get the version once review passes — review can take several
   days; it does not depend on steps 6–7.

Do steps 6 and 7 in that order. If a manifest advertises a version whose file
is not uploaded yet, every copy in that browser gets a download error until it
is.

The three channels share one version number but can briefly sit on different
versions of it, since store review is not instant. That's harmless: neither
Chrome nor Firefox ever downgrades a user.

### When Mozilla is slow

Signing usually takes minutes but can take up to 24 hours, or longer if
Mozilla picks the version for manual review. Chrome does not have to wait:

1. Create the release with the `.crx` only, and commit only `docs/updates.xml`.
2. When signing finishes (`tools/build-xpi.sh` prints the recovery steps if it
   timed out), `gh release upload v<version> build/van-enhancement-suite-<version>.xpi`.
3. Commit `docs/updates.json`.

## Chrome Web Store

The dashboard's exact labels, its visibility options (including whether
"everyone in the domain" and trusted testers/groups can be combined), how a
group gets added, and the number of certification checkboxes are unverified
as of 2026-09-14 — confirm them during the first upload and correct this
section as needed.

The store listing is **private**: only members of the extension's Google Group
can see or install it. Private items go through the same review as public
ones, and review can take several days. It keeps the self-hosted extension
ID, so it is the same extension whether it arrived by policy or from the
store.

### Before the first upload (Workspace admin)

- In the Google Admin console, allow private Chrome Web Store publishing for
  the domain.
- Create the Google Group that should have access (nest an all-staff group
  inside it if you like), and allow members from outside the organization if
  volunteers use personal Google accounts. The group is added as a trusted
  tester group in the developer account's settings; confirm in the dashboard
  who is allowed to add it.

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
- **Host permission justification (`https://*.votebuilder.com/CreateAList.aspx*`,
  `https://*.votebuilder.com/TurfCutter.aspx*`):** The extension's only
  function is to modify VAN's CreateAList and TurfCutter pages, which are
  served from votebuilder.com subdomains that differ by committee. It runs on
  no other sites.
- **Remote code:** No, I am not using remote code.
- **Data usage:** check none of the data types. The extension collects and
  transmits no user data.
- **Certifications:** check each certification the dashboard lists.
- **Privacy policy URL:** `https://pacc2026.github.io/van-enhancement-suite/privacy.html`

### Store listing

Fill in a description, category (**Productivity**), language, and the 128px
icon (`src/icons/icon128.png`), plus the screenshots and promo images the
dashboard marks as required (screenshots are 1280×800).

**Screenshots must not show real voter data.** Use a test committee, or blur
names, addresses, and any voter details before uploading.

### Moving force-installed staff to the store copy

This migration is **unverified** (as of 2026-09-14) and must be tested on an
org unit containing one test user before it is rolled out to everyone.

Google's own ExtensionSettings policy documentation says the policy's update
URL is used only for the extension's *initial* install; later updates come
from the `update_url` in the installed extension's own manifest, and
`override_update_url` does not apply once the source is the Chrome Web Store
— see [chromeenterprise.google/policies/extension-settings](https://chromeenterprise.google/policies/extension-settings/).
Switching the Admin console source alone therefore probably does **not** move
already-installed copies to the store; it only changes where a *new* install
comes from.

What is likely required, once the store version is live:

1. Ship one last self-hosted release whose manifest has **no `update_url`**
   (keep `key`), published via `updates.xml` as usual. An installed extension
   without `update_url` falls back to updating from the Chrome Web Store, and
   because the signing key is unchanged the extension ID stays the same.
2. Switch the Admin console source for `cdpjodhdenpjghbajpdlbbhpmdbcpcjh` from
   **From a custom URL** to **Chrome Web Store**, keeping **Force install**,
   so new installs come from the store.
3. On the test user's `chrome://extensions`, verify the next store-only
   version arrives before rolling this out to everyone else.

Do not retire `updates.xml` or the `.crx` releases until managed copies are
confirmed updating from the store — retiring them early would strand staff on
that last self-hosted version.

Producing a no-`update_url` `.crx` isn't automated yet: `tools/build-crx.sh`
ships `manifest.json` as-is, `key` and `update_url` included. That will be a
small change to the script, made when this migration actually happens.

### Installing as a volunteer

Join the Google Group with the Google account you use in Chrome, then open
https://chromewebstore.google.com/detail/cdpjodhdenpjghbajpdlbbhpmdbcpcjh
(available once the listing is approved) and click **Add to Chrome**.

## Firefox

Firefox users are not managed, so there is no policy to push. Release Firefox
installs only add-ons Mozilla has signed, including self-distributed ones, so
each version is submitted to addons.mozilla.org (AMO) on the **unlisted**
channel: Mozilla validates and signs it, and it never appears in public
search. Volunteers install once from a link, and Firefox keeps them updated
from `updates.json`.

- **Minimum version:** Firefox 140. Firefox for Android is not supported; the
  manifest's `gecko_android` floor (142) exists only to keep `web-ext lint`
  clean.
- **Add-on ID:** `van-enhancement-suite@pacc2026.github.io`. Permanent: AMO
  binds it on the first signing. A different ID is a different add-on that
  every volunteer would have to reinstall.
- **Install link for volunteers:** the `van-enhancement-suite-<version>.xpi`
  asset on the [latest release](https://github.com/pacc2026/van-enhancement-suite/releases/latest)
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
  `WEB_EXT_API_SECRET` environment variables, read in with `read -rs` (see
  "Ship a new version" above) rather than typed inline on the command line.
  Never commit them.

If Mozilla requests source code during a manual review, `src/precinct-map.js`
is generated from `precincts.csv` by `tools/build-precincts.js`; both are in
this repo.

## The signing key

`van-enhancement-suite.pem` is deliberately **not** in this repo (`.gitignore`
blocks `*.pem`). Whoever holds it can push code to every installed copy of the
extension, and losing it means the extension can never be updated again — a
replacement key produces a different extension ID and a fresh force-install.

Keep it in the team password manager, and make sure more than one person can
reach it.

The first Chrome Web Store upload gives Google a copy of this key (that's how
the store keeps the extension ID). It still controls the self-hosted channel,
so its custody rules above don't change.
