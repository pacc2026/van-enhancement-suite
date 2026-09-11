// "GOTV Turf Cutting" mode for CreateAList.aspx.
//
// Strips the search form down to the handful of inputs turf cutting actually
// needs: County (plus Precinct once VAN loads it), the Dry Run Universe >
// Doors target, and the suppressions block with everything switched on.
//
// Runs in the MAIN world alongside targets-checkboxes.js.
//
// IMPORTANT: locked controls are never given the `disabled` attribute.
// A disabled input is not submitted, so a disabled-but-checked suppression
// would post as absent and VAN would read it as unchecked — the search would
// silently run without the suppressions. Locking is therefore visual
// (pointer-events) plus a capture-phase listener that reverts changes, which
// leaves the values posting normally. The only controls genuinely disabled are
// the checkboxes this extension renders itself, which have no `name` and are
// not part of the form.

(function () {
  'use strict';

  var STORAGE_KEY = 'ves:gotv-turf-cutting';

  // Read back by save-region.js on TurfCutter.aspx, which is the same origin.
  // Keep these key names in step with that file.
  var COUNTY_KEY = 'ves:selected-county';
  var PRECINCT_KEY = 'ves:selected-precinct';
  var STAMP_KEY = 'ves:selection-stamp';

  var TARGET_GROUP = 'Dry Run Universe';
  var TARGET_LEAF = 'Doors';

  // Rows in the districts section that stay visible and interactive.
  var UNLOCKED_ROW_LABELS = /^(county|precinct)$/i;

  var INCLUDE_DECEASED = '-1';  // "Include Deceased"
  var INCLUDE_NO_EMAIL = '-1';  // "Include Do Not Email"

  var HIDDEN_CLASS = 'ves-gotv-hidden';
  var LOCKED_CLASS = 'ves-locked';

  var READY_TIMEOUT_MS = 10000;
  var POLL_INTERVAL_MS = 150;

  // Elements whose value the mode has set and must hold. Populated on apply,
  // consulted by the capture-phase guard below.
  var pinned = [];
  var districtObserver = null;

  function log() {
    var args = ['[van-enhancement-suite:gotv]'].concat([].slice.call(arguments));
    console.debug.apply(console, args);
  }

  function isEnabled() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch (e) {
      return false; // private window, or storage blocked
    }
  }

  function setEnabled(on) {
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch (e) {
      log('Could not persist the toggle; it will reset on reload.');
    }
  }

  function getTree() {
    var ft = window.jQuery && window.jQuery.ui && window.jQuery.ui.fancytree;
    if (!ft || typeof ft.getTree !== 'function') return null;
    try {
      var tree = ft.getTree('#TargetsSubGroups_tree');
      if (!tree || !tree.getRootNode) return null;
      return tree.getRootNode().children ? tree : null;
    } catch (e) {
      return null;
    }
  }

  function whenReady(callback) {
    var waited = 0;
    (function poll() {
      var tree = getTree();
      if (tree) return callback(tree);
      waited += POLL_INTERVAL_MS;
      if (waited >= READY_TIMEOUT_MS) {
        log('Targets tree never appeared; GOTV mode not applied.');
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    })();
  }

  // --- locating page furniture -------------------------------------------

  function districtsPanel() {
    // Resolve via the County row rather than a hard-coded id, since the
    // districts section is named differently across VAN instances.
    var row = rowByLabel('County');
    if (row) return row.closest('div[id^="PanelSection"]');
    return document.getElementById('PanelSectionDistrictsNarrow');
  }

  function rowLabel(tr) {
    return tr.children[0] ? tr.children[0].innerText.replace(/\s+/g, ' ').trim() : '';
  }

  function rowByLabel(label) {
    var rows = document.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i += 1) {
      if (rowLabel(rows[i]).toLowerCase() === label.toLowerCase()) return rows[i];
    }
    return null;
  }

  function findTargetNode(tree) {
    var found = null;
    tree.visit(function (node) {
      if (found) return false;
      if (node.title === TARGET_LEAF) {
        var parent = node.getParent();
        if (parent && parent.title === TARGET_GROUP) {
          found = node;
          return false;
        }
      }
      return true;
    });
    return found;
  }

  // --- locking ------------------------------------------------------------

  function pin(el) {
    if (!el) return;
    pinned.push({
      el: el,
      checked: el.checked,
      value: el.value
    });
  }

  function lock(el) {
    if (el) el.classList.add(LOCKED_CLASS);
  }

  // Capture phase so we see the event before VAN's own handlers, and revert
  // anything that changes a pinned control while the mode is on.
  function guard(event) {
    if (!isEnabled()) return;
    for (var i = 0; i < pinned.length; i += 1) {
      if (pinned[i].el === event.target) {
        var p = pinned[i];
        if (p.el.type === 'checkbox' || p.el.type === 'radio') {
          if (p.el.checked !== p.checked) p.el.checked = p.checked;
        } else if (p.el.value !== p.value) {
          p.el.value = p.value;
        }
        event.stopPropagation();
        event.preventDefault();
        return;
      }
    }
  }

  document.addEventListener('change', guard, true);
  document.addEventListener('click', guard, true);

  // --- the mode itself ----------------------------------------------------

  function isVisible(el) {
    return !!el && !!el.offsetParent && el.getBoundingClientRect().height > 0;
  }

  // Each section sits in a `.page-section.panel` wrapper around a
  // `div.WizardTableSection`. Hiding only the inner section leaves the
  // wrapper's own border and padding behind as a 2px rule, and thirty-odd of
  // those stack into a ladder of dividers under the cards we keep — so hide
  // the wrapper too.
  //
  // `.WizardTableSection` is also on tables nested inside a section, so a
  // shell is only hidden when it contains none of the panels we are keeping.
  // Matching on the class alone would hide the inner tables of the sections we
  // mean to keep.
  function hideOtherSections(keepPanels) {
    var keeps = keepPanels.filter(Boolean);
    var holdsKept = function (el) {
      return keeps.some(function (panel) { return el.contains(panel); });
    };

    [].forEach.call(document.querySelectorAll('.page-section.panel'), function (wrapper) {
      if (!holdsKept(wrapper)) wrapper.classList.add(HIDDEN_CLASS);
    });
    [].forEach.call(document.querySelectorAll('div.WizardTableSection'), function (shell) {
      if (!holdsKept(shell)) shell.classList.add(HIDDEN_CLASS);
    });
  }

  // Group headings ("FAVORITES", "NON-FAVORITES") label the run of cards that
  // follows them. Drop any heading whose cards are now all hidden.
  function hideEmptyGroupHeadings() {
    [].forEach.call(document.querySelectorAll('.favorites-heading'), function (heading) {
      var sibling = heading.nextElementSibling;
      var hasCard = false;
      while (sibling && !sibling.classList.contains('favorites-heading')) {
        if (sibling.querySelector && sibling.querySelector('.page-section.panel:not(.' + HIDDEN_CLASS + ')')) {
          hasCard = true;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
      if (!hasCard) heading.classList.add(HIDDEN_CLASS);
    });
  }

  // A divider with nothing visible left above it — the rule under the hidden
  // "Remove All Suppressions" link, for instance — is just a stray line.
  // Dividers that still separate two visible things are left alone.
  function hideOrphanDividers(root) {
    if (!root) return;
    [].forEach.call(root.querySelectorAll('hr'), function (hr) {
      var previous = hr.previousElementSibling;
      while (previous) {
        if (isVisible(previous)) return;
        previous = previous.previousElementSibling;
      }
      hr.classList.add(HIDDEN_CLASS);
    });
  }

  // Hide every districts row except County (and Precinct, which VAN adds to
  // the section only after a county is chosen). Rows nest, so an ancestor row
  // is kept whenever it contains a row we are keeping.
  function filterDistrictRows(panel) {
    if (!panel) return;
    var rows = [].slice.call(panel.querySelectorAll('tr'));
    var kept = rows.filter(function (tr) { return UNLOCKED_ROW_LABELS.test(rowLabel(tr)); });
    rows.forEach(function (tr) {
      var keep = kept.some(function (k) { return k === tr || tr.contains(k); });
      if (keep) {
        tr.classList.remove(HIDDEN_CLASS);
      } else {
        tr.classList.add(HIDDEN_CLASS);
      }
    });
  }

  // A chip is the label plus a remove link; take only the label.
  function chipText(chip) {
    var clone = chip.cloneNode(true);
    var close = clone.querySelector('.select2-search-choice-close');
    if (close && close.parentNode) close.parentNode.removeChild(close);
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  // Reads what a districts row is currently set to.
  //
  // County and Precinct are *multi*-select Select2 widgets: no <select>
  // element and no .select2-chosen: the chosen values render as
  // .select2-search-choice chips over a hidden input that holds ids, not
  // names. An earlier version fell through to `input[type=text]`, which on
  // these rows matches Select2's own search box — always empty — so nothing
  // was ever stashed. Never fall back to a bare text input here.
  function readRowValue(label) {
    var row = rowByLabel(label);
    if (!row) return '';

    var chips = row.querySelectorAll('.select2-search-choice');
    if (chips.length === 1) return chipText(chips[0]);
    if (chips.length > 1) {
      // A turf is exactly one precinct, so several values is ambiguous.
      // Prefilling from a guess is worse than not prefilling.
      log(label + ' has ' + chips.length + ' values selected; expected one.');
      return '';
    }

    var chosen = row.querySelector('.select2-chosen');
    if (chosen && chosen.innerText.trim()) return chosen.innerText.trim();

    var select = row.querySelector('select');
    if (select && select.selectedIndex >= 0) {
      var option = select.options[select.selectedIndex];
      if (option && option.text.trim()) return option.text.trim();
    }
    return '';
  }

  function isPlaceholder(value) {
    return !value || /^(select|--|choose)/i.test(value);
  }

  // Hand the chosen county and precinct to the TurfCutter page. Written only
  // once both are real values, so a half-rendered panel cannot wipe a good
  // pair; the timestamp lets the reader ignore a stale one.
  function stashSelection() {
    var county = readRowValue('County');
    var precinct = readRowValue('Precinct');
    if (isPlaceholder(county) || isPlaceholder(precinct)) return;

    try {
      window.localStorage.setItem(COUNTY_KEY, county);
      window.localStorage.setItem(PRECINCT_KEY, precinct);
      window.localStorage.setItem(STAMP_KEY, String(Date.now()));
      log('Stashed "' + county + ' / ' + precinct + '" for the turf cutter.');
    } catch (e) {
      log('Could not stash the selection:', e);
    }
  }

  // Catches Precinct being added to the section client-side. A partial
  // postback replaces the panel node outright, so the observer is rebound on
  // every apply rather than kept from the first one — a stale observer is
  // watching a detached node and never fires.
  function watchForPrecinct(panel) {
    if (districtObserver) {
      districtObserver.disconnect();
      districtObserver = null;
    }
    if (!panel) return;
    districtObserver = new MutationObserver(function () {
      if (!isEnabled()) return;
      filterDistrictRows(panel);
      stashSelection();
    });
    districtObserver.observe(panel, { childList: true, subtree: true });
  }

  function applyTargets(tree) {
    var node = findTargetNode(tree);
    if (!node) {
      log('Could not find the "' + TARGET_GROUP + ' > ' + TARGET_LEAF + '" target.');
    } else if (!node.isSelected()) {
      node.setSelected(true);
    }

    // Hide the Match Type row; it is not part of turf cutting.
    var matchSelect = document.getElementById('ddl_TargetsMatchType');
    var matchRow = matchSelect && matchSelect.closest('tr');
    if (matchRow) matchRow.classList.add(HIDDEN_CLASS);

    // The selection above was made through the tree, so the checkbox list has
    // to be told to catch up before we freeze it.
    if (window.vanEnhancementSuite && window.vanEnhancementSuite.syncTargets) {
      window.vanEnhancementSuite.syncTargets();
    }

    var list = document.querySelector('.ves-targets');
    if (!list) {
      // The checkbox list did not render (fail-open); the selection above is
      // still correct, so just hide the native picker's row.
      var native = document.getElementById('TargetsSubGroups_treeview-container');
      var nativeRow = native && native.closest('tr');
      if (nativeRow) nativeRow.classList.add(HIDDEN_CLASS);
      return;
    }

    // Show only the group block containing our target; lock what remains.
    var blocks = list.querySelectorAll('.ves-group');
    [].forEach.call(blocks, function (block) {
      var mine = node && block.querySelector('[data-ves-key="' + node.key + '"]');
      if (mine) {
        block.classList.remove(HIDDEN_CLASS);
      } else {
        block.classList.add(HIDDEN_CLASS);
      }
    });
    [].forEach.call(list.querySelectorAll('.ves-leaf-orphan'), function (leaf) {
      leaf.classList.add(HIDDEN_CLASS);
    });

    // These are our own checkboxes, not form fields, so disabling is safe.
    [].forEach.call(list.querySelectorAll('input[type="checkbox"]'), function (box) {
      box.disabled = true;
    });
  }

  function applySuppressions(panel) {
    if (!panel) return;

    [].forEach.call(panel.querySelectorAll('input[type="checkbox"]'), function (box) {
      if (!box.checked) box.click(); // let VAN's own handlers run
      pin(box);
      lock(box);
    });

    [['IncludeDeceased', INCLUDE_DECEASED], ['IncludeNoEmail', INCLUDE_NO_EMAIL]]
      .forEach(function (pair) {
        var select = panel.querySelector('select[name="' + pair[0] + '"]')
          || document.querySelector('select[name="' + pair[0] + '"]');
        if (!select) {
          log('Could not find the ' + pair[0] + ' control.');
          return;
        }
        select.value = pair[1];
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) window.jQuery(select).trigger('change');
        pin(select);
        lock(select);
      });

    // Hide rather than delete "Remove All Suppressions", so switching the
    // mode off puts it back.
    [].forEach.call(panel.querySelectorAll('a'), function (a) {
      if (/remove all suppressions/i.test(a.innerText || '')) {
        a.classList.add(HIDDEN_CLASS);
      }
    });
  }

  // The tree is resolved here rather than passed in: a postback rebuilds the
  // Fancytree, so any instance captured earlier is detached and driving it
  // would silently do nothing.
  function apply() {
    var tree = getTree();
    if (!tree) {
      log('Targets tree not available; GOTV mode not applied.');
      return;
    }

    clear(); // start from a known state

    var targetsPanel = document.getElementById('PanelSectionTargets');
    var suppressionsPanel = document.getElementById('PanelSectionSuppressions');
    var districts = districtsPanel();

    hideOtherSections([targetsPanel, suppressionsPanel, districts]);
    filterDistrictRows(districts);
    watchForPrecinct(districts);
    applyTargets(tree);
    applySuppressions(suppressionsPanel);

    // After the above, so that dividers orphaned by hiding the "Remove All
    // Suppressions" link and headings orphaned by hiding their cards are both
    // caught.
    hideOrphanDividers(suppressionsPanel);
    hideEmptyGroupHeadings();
    stashSelection();

    document.body.classList.add('ves-gotv-on');
    log('GOTV Turf Cutting mode on.');
  }

  // Undo the presentation changes. Values the mode set are deliberately left
  // in place; a page reload gives a clean form.
  function clear() {
    pinned = [];
    if (districtObserver) {
      districtObserver.disconnect();
      districtObserver = null;
    }
    [].forEach.call(document.querySelectorAll('.' + HIDDEN_CLASS), function (el) {
      el.classList.remove(HIDDEN_CLASS);
    });
    [].forEach.call(document.querySelectorAll('.' + LOCKED_CLASS), function (el) {
      el.classList.remove(LOCKED_CLASS);
    });
    var list = document.querySelector('.ves-targets');
    if (list) {
      [].forEach.call(list.querySelectorAll('input[type="checkbox"]'), function (box) {
        box.disabled = false;
      });
    }
    document.body.classList.remove('ves-gotv-on');
  }

  // --- toggle -------------------------------------------------------------

  function buildToggle(onChange) {
    var bar = document.createElement('div');
    bar.className = 'ves-gotv-bar';

    var label = document.createElement('label');
    label.className = 'ves-gotv-toggle';

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'ves-gotv-switch';
    input.checked = isEnabled();

    var track = document.createElement('span');
    track.className = 'ves-gotv-track';
    track.appendChild(document.createElement('span')).className = 'ves-gotv-thumb';

    var text = document.createElement('span');
    text.className = 'ves-gotv-text';
    text.textContent = 'GOTV Turf Cutting';

    input.addEventListener('change', function () {
      setEnabled(input.checked);
      onChange(input.checked);
    });

    label.appendChild(input);
    label.appendChild(track);
    label.appendChild(text);
    bar.appendChild(label);
    return bar;
  }

  // The heading row holding "Create A New Search" — an h5.page-title wrapping
  // the header text span. Located via the span's id suffix rather than the
  // heading's text, so it still resolves when an existing list is reopened
  // under a different title, and never matches the identically-worded
  // breadcrumb further up the page.
  function headingRow() {
    var headerText = document.querySelector('span[id$="HeaderText"]');
    if (headerText && headerText.parentElement) return headerText.parentElement;
    return document.querySelector('h5.page-title');
  }

  function mountToggle() {
    if (document.querySelector('.ves-gotv-bar')) return;

    var bar = buildToggle(function (on) {
      if (on) apply(); else clear();
    });

    // Sit inline with the page heading. The heading row is a flex container,
    // so appending to it makes the toggle a flex item beside the title.
    var heading = headingRow();
    if (heading) {
      bar.classList.add('ves-gotv-bar-inline');
      heading.appendChild(bar);
      return;
    }

    // Fall back to a banner above the first section.
    var first = document.querySelector('.WizardTableSection');
    if (!first || !first.parentElement) {
      log('Could not find a place to mount the toggle.');
      return;
    }
    first.parentElement.insertBefore(bar, first);
  }

  function start() {
    // Let targets-checkboxes.js render first so we can filter its list.
    setTimeout(function () {
      try {
        mountToggle();
        if (isEnabled()) apply();
      } catch (e) {
        log('GOTV mode failed:', e);
        clear();
      }
    }, 0);
  }

  // Choosing a county fires an ASP.NET partial postback, which re-renders the
  // districts panel and restores every row we hid. The content script does not
  // re-run for a partial postback, so re-apply on the PageRequestManager's
  // endRequest — the event that fires after each one.
  function hookPartialPostbacks() {
    var sys = window.Sys;
    if (!sys || !sys.WebForms || !sys.WebForms.PageRequestManager) {
      log('No PageRequestManager; GOTV mode will not survive partial postbacks.');
      return;
    }
    try {
      sys.WebForms.PageRequestManager.getInstance().add_endRequest(function () {
        whenReady(start);
      });
    } catch (e) {
      log('Could not hook partial postbacks:', e);
    }
  }

  whenReady(function () {
    start();
    hookPartialPostbacks();
  });
})();
