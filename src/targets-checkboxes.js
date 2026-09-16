// Replaces the Targets tree-dropdown on CreateAList.aspx with a flat checkbox
// list, and the Match Type select with a pair of radios.
//
// This script drives VAN's own Fancytree widget rather than writing to the
// form directly: calling node.setSelected() fires VAN's `select` handler,
// which serializes the selection into the hidden selectedNodeIds input on a
// deferred tick. We never touch __VIEWSTATE or the hidden input ourselves.
//
// Runs in the MAIN world (see manifest) so that window.jQuery is visible.
// Every step is guarded: if anything VAN-side has moved, we leave the page
// exactly as we found it rather than hiding a control we can't replace.

(function () {
  'use strict';

  var TREE_SELECTOR = '#TargetsSubGroups_tree';
  var NATIVE_CONTAINER_ID = 'TargetsSubGroups_treeview-container';
  var HIDDEN_INPUT_SELECTOR = 'input[id$="TargetsSubGroups_selectedNodeIds"]';
  var MATCH_SELECT_ID = 'ddl_TargetsMatchType';

  // A flat list stops being an improvement somewhere past a screenful. Orgs
  // with more targets than this keep the searchable tree.
  var MAX_NODES = 60;

  var READY_TIMEOUT_MS = 10000;
  var POLL_INTERVAL_MS = 150;

  function log() {
    var args = ['[van-enhancement-suite]'].concat([].slice.call(arguments));
    console.debug.apply(console, args);
  }

  function getTree() {
    var ft = window.jQuery && window.jQuery.ui && window.jQuery.ui.fancytree;
    if (!ft || typeof ft.getTree !== 'function') return null;
    try {
      var tree = ft.getTree(TREE_SELECTOR);
      if (!tree || !tree.getRootNode) return null;
      return tree.getRootNode().children ? tree : null;
    } catch (e) {
      return null;
    }
  }

  // VAN builds the tree after document_idle, so poll for it.
  function whenReady(callback) {
    var waited = 0;
    (function poll() {
      var tree = getTree();
      if (tree) return callback(tree);
      waited += POLL_INTERVAL_MS;
      if (waited >= READY_TIMEOUT_MS) {
        log('Targets tree never appeared; leaving the page untouched.');
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    })();
  }

  function countNodes(tree) {
    var n = 0;
    tree.visit(function () { n += 1; });
    return n;
  }

  function makeCheckbox(node, className) {
    var label = document.createElement('label');
    label.className = className;

    var box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.vesKey = node.key;

    var text = document.createElement('span');
    text.textContent = node.title;

    label.appendChild(box);
    label.appendChild(text);
    return label;
  }

  function buildTargetsList(tree) {
    var list = document.createElement('div');
    list.className = 'ves-targets';

    tree.getRootNode().children.forEach(function (group) {
      var hasChildren = group.children && group.children.length;
      if (!hasChildren) {
        // A standalone target with no group wrapper.
        list.appendChild(makeCheckbox(group, 'ves-leaf ves-leaf-orphan'));
        return;
      }

      var block = document.createElement('div');
      block.className = 'ves-group';
      block.appendChild(makeCheckbox(group, 'ves-group-title'));

      group.children.forEach(function (leaf) {
        block.appendChild(makeCheckbox(leaf, 'ves-leaf'));
      });

      list.appendChild(block);
    });

    return list;
  }

  // VAN's Fancytree build exposes partial selection as the `partsel` property;
  // newer releases added an isPartsel() method. Accept either.
  function isPartiallySelected(node) {
    if (typeof node.isPartsel === 'function') return node.isPartsel();
    return !!node.partsel;
  }

  // The Fancytree is the single source of truth; our checkboxes are a view of
  // it. selectMode 3 cascades parent/child selection and flags partially
  // selected parents, so mirror that with the indeterminate state.
  function syncFromTree(tree, list) {
    list.querySelectorAll('input[type="checkbox"]').forEach(function (box) {
      var node = tree.getNodeByKey(box.dataset.vesKey);
      if (!node) return;
      box.checked = node.isSelected();
      box.indeterminate = !node.isSelected() && isPartiallySelected(node);
    });
  }

  function enhanceTargets(tree) {
    var native = document.getElementById(NATIVE_CONTAINER_ID);
    var host = native && native.parentElement;
    var hidden = document.querySelector(HIDDEN_INPUT_SELECTOR);

    if (!native || !host || !hidden) {
      log('Targets markup not recognized; leaving the native picker alone.');
      return;
    }
    if (host.querySelector('.ves-targets')) return; // already enhanced

    var total = countNodes(tree);
    if (total > MAX_NODES) {
      log('Targets has ' + total + ' nodes (limit ' + MAX_NODES + '); keeping the tree.');
      return;
    }

    var list = buildTargetsList(tree);

    list.addEventListener('change', function (event) {
      var box = event.target;
      if (!box.dataset || !box.dataset.vesKey) return;
      var node = tree.getNodeByKey(box.dataset.vesKey);
      if (!node) return;
      node.setSelected(box.checked);
      syncFromTree(tree, list);
    });

    syncFromTree(tree, list);
    host.appendChild(list);
    native.classList.add('ves-replaced');

    // The row label is vertically centered by default, which leaves it
    // floating beside a full-height list. Top-align the whole row.
    var row = host.closest && host.closest('tr');
    if (row) row.classList.add('ves-row');

    // Anything that selects tree nodes programmatically (gotv-mode.js) needs a
    // way to bring the checkboxes back in step, since they only re-sync on
    // their own change events.
    window.vanEnhancementSuite = window.vanEnhancementSuite || {};
    window.vanEnhancementSuite.syncTargets = function () {
      syncFromTree(tree, list);
    };

    log('Targets rendered as ' + total + ' checkboxes.');
  }

  function enhanceMatchType() {
    var select = document.getElementById(MATCH_SELECT_ID);
    if (!select || select.dataset.vesReplaced) return;
    var host = select.parentElement;
    if (!host || select.options.length === 0) return;

    var group = document.createElement('span');
    group.className = 'ves-match';

    [].forEach.call(select.options, function (option) {
      var label = document.createElement('label');
      label.className = 'ves-match-option';

      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'ves-match-' + MATCH_SELECT_ID;
      radio.value = option.value;
      radio.checked = option.value === select.value;

      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        select.value = radio.value;
        // Let VAN's own listeners (jQuery or DOM) see a real change.
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery) window.jQuery(select).trigger('change');
      });

      var text = document.createElement('span');
      text.textContent = option.text;

      label.appendChild(radio);
      label.appendChild(text);
      group.appendChild(label);
    });

    select.dataset.vesReplaced = '1';
    select.classList.add('ves-replaced');
    host.appendChild(group);
    log('Match Type rendered as radios.');
  }

  function run(tree) {
    try {
      enhanceTargets(tree);
    } catch (e) {
      log('Targets enhancement failed:', e);
    }
    try {
      enhanceMatchType();
    } catch (e) {
      log('Match Type enhancement failed:', e);
    }
  }

  // A partial postback (choosing a county, say) re-renders panels and rebuilds
  // the Fancytree without re-running this script, which throws away the
  // checkbox list. Re-enhance once each one finishes; whenReady re-resolves the
  // tree, so we never hold on to the detached instance.
  //
  // Opening a collapsed Targets section is a partial postback too, and when
  // Targets is not a favorite that is the first time the tree exists — so the
  // hook goes on at load, not after the tree is first found.
  function hookPartialPostbacks() {
    var sys = window.Sys;
    if (!sys || !sys.WebForms || !sys.WebForms.PageRequestManager) return;
    try {
      sys.WebForms.PageRequestManager.getInstance().add_endRequest(function () {
        whenReady(run);
      });
    } catch (e) {
      log('Could not hook partial postbacks:', e);
    }
  }

  whenReady(run);
  hookPartialPostbacks();
})();
