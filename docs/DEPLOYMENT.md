# Deploying VAN Enhancement Suite

This extension is **self-hosted** — it is not in the Chrome Web Store. Chrome
only permits self-hosted extensions in managed environments, so it reaches
users through enterprise policy, not by clicking an install link.

| | |
|---|---|
| Extension ID | `cdpjodhdenpjghbajpdlbbhpmdbcpcjh` |
| Update manifest | `https://pacc2026.github.io/van-enhancement-suite/updates.xml` |
| CRX downloads | [GitHub releases](https://github.com/pacc2026/van-enhancement-suite/releases) |

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

Chrome polls the update manifest every few hours and installs whatever
`codebase` points at when its `version` is higher than the installed one. So a
release is: bump, pack, upload, then publish the manifest.

1. Bump `"version"` in `manifest.json` (Chrome will not downgrade, and will
   ignore a release whose version it already has).
2. Regenerate the precinct map if `precincts.csv` changed:
   `node tools/build-precincts.js`
3. Pack and sign, passing the signing key:
   `tools/build-crx.sh /path/to/van-enhancement-suite.pem`
4. Attach the CRX to a matching tag:
   `gh release create v<version> build/van-enhancement-suite-<version>.crx --title v<version> --notes "..."`
5. Commit the regenerated `docs/updates.xml`. **This is the step that actually
   ships** — until the manifest advertises the new version, nothing updates.

Do steps 4 and 5 in that order. If the manifest advertises a version whose
release is not uploaded yet, every managed browser gets a download error until
it is.

## The signing key

`van-enhancement-suite.pem` is deliberately **not** in this repo (`.gitignore`
blocks `*.pem`). Whoever holds it can push code to every installed copy of the
extension, and losing it means the extension can never be updated again — a
replacement key produces a different extension ID and a fresh force-install.

Keep it in the team password manager, and make sure more than one person can
reach it.
