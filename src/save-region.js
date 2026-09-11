// Pre-fills the "Save My Map Region" modal on TurfCutter.aspx.
//
// Each turf is exactly one precinct, and the precinct decides both the region
// name and the folder. The precinct is not on this page at all — it is chosen
// back on CreateAList.aspx, where gotv-mode.js stashes it in localStorage.
// Both pages are the same origin, so it reads back here.
//
// The lookup itself is the bundled table in precinct-map.js, generated from
// BigQuery at build time. Nothing is queried at runtime and no credentials
// exist anywhere in this extension.

(function () {
  'use strict';

  // Written by gotv-mode.js on CreateAList.aspx. Keep in step with it.
  var COUNTY_KEY = 'ves:selected-county';
  var PRECINCT_KEY = 'ves:selected-precinct';
  var STAMP_KEY = 'ves:selection-stamp';

  // A precinct stashed days ago is more likely stale than useful, and a wrong
  // prefill is worse than none.
  var MAX_AGE_MS = 12 * 60 * 60 * 1000;

  var NAME_INPUT_ID = 'save-region-name';
  var FOLDER_SELECT_ID = 'save-region-folder';
  var FOLDER_EXISTING_RADIO_ID = 'folder-mode-existing';

  function log() {
    var args = ['[van-enhancement-suite:save-region]'].concat([].slice.call(arguments));
    console.debug.apply(console, args);
  }

  function normalize(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function read(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (e) {
      return '';
    }
  }

  function storedSelection() {
    var county = read(COUNTY_KEY);
    var precinct = read(PRECINCT_KEY);
    var stamp = parseInt(read(STAMP_KEY), 10);

    if (!county || !precinct) return null;
    if (stamp && Date.now() - stamp > MAX_AGE_MS) {
      log('Stored precinct is stale; not prefilling.');
      return null;
    }
    return { county: county, precinct: precinct };
  }

  function lookup(selection) {
    var table = window.__vesPrecincts;
    if (!table || !table.rows) {
      log('Precinct table not loaded.');
      return null;
    }
    var row = table.rows[normalize(selection.county) + '|' + normalize(selection.precinct)];
    if (!row) return null;
    return { folder: table.folders[row[0]], listName: row[1] };
  }

  // MMDD for today, local time.
  function today() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    return pad(d.getMonth() + 1) + pad(d.getDate());
  }

  // list_name values already end with "_", which is the separator the date
  // slots into: "DR01_Philadelphia_02-01_" + "0910".
  function regionName(listName) {
    return listName.replace(/_+$/, '') + '_' + today();
  }

  // The modal is React. React patches the `value` property on each input and
  // keeps a _valueTracker of what it last saw, so a plain `el.value = x`
  // updates the tracker too — React concludes nothing changed, ignores the
  // edit, and restores its own state on the next render. Writing through the
  // *prototype* setter bypasses the patched property, leaves the tracker
  // stale, and makes React accept the change. Verified against this modal:
  // a plain assignment was reverted on re-render, this survives.
  function nativeSetter(el) {
    var proto = window.HTMLInputElement.prototype;
    if (el instanceof window.HTMLSelectElement) proto = window.HTMLSelectElement.prototype;
    else if (el instanceof window.HTMLTextAreaElement) proto = window.HTMLTextAreaElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    return descriptor && descriptor.set;
  }

  function setValue(el, value) {
    var setter = nativeSetter(el);
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function selectFolder(select, folder) {
    var wanted = normalize(folder);
    for (var i = 0; i < select.options.length; i += 1) {
      if (normalize(select.options[i].text) === wanted) {
        setValue(select, select.options[i].value);
        return true;
      }
    }
    return false;
  }

  // What this modal should be filled with, or null. Resolved per call; both
  // fields come from the same row, so they can never disagree.
  function resolveMatch() {
    var selection = storedSelection();
    if (!selection) {
      log('No stored county/precinct; leaving the modal blank.');
      return null;
    }
    var match = lookup(selection);
    if (!match) {
      log('No table entry for "' + selection.county + ' / ' + selection.precinct + '"; leaving the modal blank.');
      return null;
    }
    return match;
  }

  // The name input and the folder select do not appear together: the name is
  // in the DOM roughly 240ms before the folder select exists, and its 172
  // options are fetched. So each field carries its own completion flag and the
  // folder is retried on later mutations rather than being written off on the
  // first pass. The flags live on the elements, so a reopened modal — which
  // builds fresh elements — starts clean.
  function prefill() {
    var nameInput = document.getElementById(NAME_INPUT_ID);
    if (!nameInput) return;

    var select = document.getElementById(FOLDER_SELECT_ID);
    var namePending = !nameInput.dataset.vesFilled;
    var folderPending = select && select.options.length && !select.dataset.vesFilled;
    if (!namePending && !folderPending) return;

    var match = resolveMatch();

    if (namePending) {
      nameInput.dataset.vesFilled = '1';
      // Never clobber something already typed.
      if (match && !nameInput.value.trim()) {
        setValue(nameInput, regionName(match.listName));
        log('Prefilled region name "' + nameInput.value + '".');
      }
    }

    if (folderPending) {
      select.dataset.vesFilled = '1';
      if (match) {
        var existing = document.getElementById(FOLDER_EXISTING_RADIO_ID);
        if (existing && !existing.checked) {
          existing.checked = true;
          existing.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (selectFolder(select, match.folder)) {
          log('Selected folder "' + match.folder + '".');
        } else {
          log('Folder "' + match.folder + '" is not in the dropdown; left as is.');
        }
      }
    }
  }

  // The modal is created on demand, so watch for it rather than running once.
  function watch() {
    prefill(); // in case it is already open
    new MutationObserver(function () {
      if (document.getElementById(NAME_INPUT_ID)) prefill();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) watch();
  else document.addEventListener('DOMContentLoaded', watch);
})();
