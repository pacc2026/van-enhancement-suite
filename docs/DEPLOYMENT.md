# Deploying VAN Enhancement Suite

This extension is **self-hosted** — it is in neither the Chrome Web Store nor
the public Firefox add-ons site. Chrome permits self-hosted extensions only in
managed environments, so Chrome users get it through enterprise policy.
Firefox installs any Mozilla-signed add-on, so Firefox users install it from a
link — see [Firefox](#firefox).

| | |
|---|---|
| Chrome extension ID | `cdpjodhdenpjghbajpdlbbhpmdbcpcjh` |
| Chrome update manifest | `https://pacc2026.github.io/van-enhancement-suite/updates.xml` |
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
`version` is higher than the installed one. A release is: bump, build both,
upload, then publish both manifests.

1. Bump `"version"` in `manifest.json`. Neither browser downgrades, and
   addons.mozilla.org never accepts the same version twice — even one whose
   signing failed.
2. Regenerate the precinct map if `precincts.csv` changed:
   `node tools/build-precincts.js`
3. Pack and sign for Chrome, passing the signing key:
   `tools/build-crx.sh /path/to/van-enhancement-suite.pem`
4. Pack and sign for Firefox, with AMO credentials read into the environment
   without echoing them or saving them to shell history:

   ```bash
   read -rs WEB_EXT_API_KEY && read -rs WEB_EXT_API_SECRET
   export WEB_EXT_API_KEY WEB_EXT_API_SECRET
   tools/build-xpi.sh
   ```

   Paste the key, press Enter, paste the secret, press Enter — nothing is
   shown.
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
