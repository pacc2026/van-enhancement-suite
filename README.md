# VAN Enhancement Suite

A Chrome extension for VAN's **Create A List** page (`CreateAList.aspx`), in two
parts:

- **Checkbox Targets** — the collapsed Targets tree dropdown becomes a flat,
  grouped checkbox list, and the Any/All Match Type select becomes radio
  buttons.
- **GOTV Turf Cutting mode** — a switch that strips the form down to County,
  the Dry Run Universe > Doors target, and the suppressions, with everything
  preset and locked.

## Install

Staff do not install this by hand. It is self-hosted and force-installed on
managed browsers through enterprise policy — see
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the rollout and release steps.

To run it locally while developing:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this directory.
4. Reload `CreateAList.aspx`.

## How it works

The Targets picker is a [jQuery Fancytree](https://github.com/mar10/fancytree)
widget. Selecting a node fires VAN's own `select` handler, which serializes the
selection into the hidden `selectedNodeIds` input that the ASP.NET form posts.

So this extension never writes to that hidden input, never touches
`__VIEWSTATE`, and never fabricates a postback. It reads the tree through the
Fancytree API, renders its own checkboxes, and calls `node.setSelected()` on
the real nodes — VAN does its own serialization exactly as if you had clicked
in the tree. The Fancytree remains the single source of truth; the checkboxes
are only a view of it, re-synced after every change.

Because it needs `window.jQuery`, the content scripts declare `"world": "MAIN"`
in the manifest. An isolated-world content script cannot see the page's
Fancytree instance at all.

## Behavior worth knowing

- **Parent/child selection.** The tree runs in `selectMode: 3`, so checking a
  group checks all of its children, and a partly-selected group renders as an
  indeterminate checkbox. The checkbox list mirrors both.
- **Large target sets fall back.** If the tree has more than `MAX_NODES` (60)
  nodes, the extension leaves the native searchable tree in place — a flat list
  of hundreds of checkboxes would be worse than the dropdown.
- **It fails open.** Every VAN-side element is checked before anything is
  modified. If the tree, the hidden input, or the container can't be found, the
  page is left exactly as it was rather than hiding a control that has no
  replacement. Diagnostics go to the console under `[van-enhancement-suite]`.

## GOTV Turf Cutting mode

A switch at the top of the search form strips the page down to what turf
cutting needs:

- Every section hidden except Home Districts, Targets and Suppressions.
- Home Districts shows County only, plus Precinct once it exists. Choosing a
  county makes VAN add county-specific district types — **Precinct, Ward and
  City Council** — but only after a **full page load**, not via the partial
  postback that fires on the change itself. (Measured: two partial postbacks
  fire on a county change and the row list is unchanged through both.) The
  content script re-runs on that load anyway; the MutationObserver covers
  later client-side changes.
- Targets shows only Dry Run Universe > Doors, checked and locked. The target
  is resolved **by title**, not by node key, since keys like `Target35|1`
  differ between committees.
- All five suppressions checked, `Include Deceased` and `Include Do Not Email`
  set, and the "Remove All Suppressions" link hidden.

The mode is remembered in `localStorage` on the votebuilder.com origin, so it
survives VAN's postbacks (Add Step, Run Search). It lives there rather than in
`chrome.storage` because these scripts run in the MAIN world, where the
`chrome.*` APIs are unavailable; using them would mean a second isolated-world
script and a postMessage bridge for one boolean. The cost is that the setting
is per-browser-profile and does not sync across devices.

### Locked, not disabled

Locked controls are never given the `disabled` attribute. A disabled input is
not submitted, so a disabled-but-checked suppression would post as *absent* and
VAN would read it as unchecked — the form would look correct while the search
silently ran without the suppressions.

Locking is therefore `pointer-events: none` plus a capture-phase listener that
reverts changes, which leaves every value posting normally. The only genuinely
disabled controls are the checkboxes this extension renders itself, which have
no `name` and are not part of the form. Hidden sections are likewise hidden but
not disabled, so their defaults keep posting.

Switching the mode off restores visibility and interactivity but leaves the
values it set. Reverting those too would mean snapshotting the whole form; a
page reload gives a clean one.

## Save My Map Region prefill (TurfCutter.aspx)

Each turf is exactly one precinct, and the precinct decides both the region
name and the folder. The precinct does not appear anywhere on the turf cutter
page, so `gotv-mode.js` stashes the selected county and precinct in
`localStorage` on `CreateAList.aspx`, and `save-region.js` reads them back —
both pages are the same origin. A timestamp is stored alongside, and a
selection older than 12 hours is ignored rather than prefilling something
stale.

County and Precinct are **multi-select Select2** widgets: no `<select>` element
and no `.select2-chosen`. The chosen values render as `.select2-search-choice`
chips over a hidden input holding ids rather than names, so `readRowValue()`
reads the chips. It never falls back to `input[type="text"]` — on these rows
that matches Select2's own search box, which is always empty. Precinct chips
read as `Philadelphia 02-01`, matching `van_precinct_nam` exactly. More than
one chip means the selection is ambiguous, and nothing is stashed.

When the modal opens, the pair is looked up in the bundled table and the fields
are filled:

- **Region Name** = `list_name` + `MMDD`. The exported `list_name` values
  already end with `_`, which is the separator the date slots into:
  `DR01_Philadelphia_02-01_` + `0910` → `DR01_Philadelphia_02-01_0910`.
- **Folder** = the `folder` column, matched against the dropdown by text.

If the precinct isn't in the table, or nothing is stashed, both fields are left
blank and the reason is logged. Anything already typed is never overwritten.

The two fields do not appear together. `#save-region-name` is in the DOM about
240ms before `#save-region-folder` exists, and the folder's 172 options are
fetched after that. Each field therefore carries its own completion flag and
the folder is retried on later mutations instead of being written off on the
first pass — otherwise the name fills correctly and the folder silently never
does. The flags live on the elements, so a reopened modal starts clean.

### The precinct table is built, not queried

`precincts.csv` (exported from BigQuery) is the source of truth;
`tools/build-precincts.js` turns it into `src/precinct-map.js`, which is what
ships. Regenerate whenever the turf plan changes:

```
node tools/build-precincts.js
```

It is a `.js` file assigning a global rather than a bundled `.csv` or `.json`
because the content scripts run in the MAIN world, where `chrome.runtime` —
and therefore `chrome.runtime.getURL` — does not exist. Reading a bundled data
file would need `web_accessible_resources`, a stable extension id, and a second
isolated-world script bridging over `postMessage`. A generated JS global needs
none of that, costs no runtime parsing of our own, and gives O(1) lookup.
Folder names are interned, since they repeat across thousands of precincts.

This means **no credentials live in the extension and nothing is queried at
runtime**. BigQuery is a build-time export.

### Writing into a React form

The Save My Map Region modal is React. React patches the `value` property on
each input and keeps a `_valueTracker` of what it last saw, so a plain
`el.value = x` updates the tracker too — React concludes nothing changed,
ignores the edit, and restores its own state on the next render. `setValue()`
therefore writes through the **prototype** setter, which bypasses the patched
property, leaves the tracker stale, and makes React accept the change. This was
confirmed against the live modal: a plain assignment was reverted on re-render,
the prototype setter survived, and only the latter enables the Save button.

## Scope and limitations

- The Survey Questions/Responses picker uses the identical widget and
  mechanism, but it has over a thousand nodes, so the tree is the right UI
  there and it is left alone.
- Matches `https://*.votebuilder.com/CreateAList.aspx*`. Committees on other
  NGP VAN hostnames need that pattern added to `manifest.json`.
- None of these element IDs are a public contract. NGP VAN ships changes
  without notice, and a release can break the selectors at any time; the
  fail-open guards are what keep that from breaking the page itself.
- Verify your NGP VAN user agreement before distributing this beyond your own
  browser.

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest; declares the `MAIN`-world content scripts |
| `src/targets-checkboxes.js` | Reads the Fancytree, renders checkboxes, drives selection |
| `src/targets-checkboxes.css` | Styling matched to VAN's existing checkbox lists |
| `src/gotv-mode.js` | The GOTV Turf Cutting toggle and its presets |
| `src/gotv-mode.css` | Toggle switch and locked/hidden styling |
| `src/save-region.js` | Prefills the Save My Map Region modal on TurfCutter.aspx |
| `src/precinct-map.js` | GENERATED precinct lookup table — do not edit |
| `tools/build-precincts.js` | Builds precinct-map.js from precincts.csv |
| `precincts.csv` | Source of truth for the precinct table, exported from BigQuery |
| `tools/build-crx.sh` | Packs and signs the .crx, regenerates the update manifest |
| `docs/updates.xml` | GENERATED update manifest Chrome polls for new versions |
| `docs/DEPLOYMENT.md` | Self-hosting, enterprise policy, and release process |
