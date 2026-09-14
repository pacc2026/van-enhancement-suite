// Fills in the toolbar popup's version and copyright year.
//
// Loaded as a separate file because extension pages' content security policy
// blocks inline scripts in both Chrome and Firefox.

'use strict';

(function () {
  var version = document.getElementById('version');
  try {
    version.textContent = 'Version ' + chrome.runtime.getManifest().version;
  } catch (e) {
    // Better no line than a bare "Version" with nothing after it.
    version.hidden = true;
  }

  document.getElementById('year').textContent = String(new Date().getFullYear());
})();
