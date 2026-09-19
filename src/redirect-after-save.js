// Sends the user back to CreateAList.aspx once a turf has been saved.
//
// In GOTV mode a user cuts one precinct after another, and every one of those
// laps starts on CreateAList.aspx. VAN instead ends the save on TurfList.aspx,
// which takes several seconds to load and is never the page they wanted.
//
// Saving POSTs to TurfCutterService.asmx/CreateAndSaveTurfs; on success VAN
// navigates to TurfList.aspx from its own handler. That navigation is not
// blocked here. window.location cannot be overridden, and the destination is a
// minified constant in a cache-busted bundle, so patching either is coupled to
// markup that changes on every VAN deploy. The endpoint below is a server
// route, which is far steadier ground.
//
// So the navigation is allowed to start and is then superseded: a second
// navigation issued before the first commits cancels it, and TurfList.aspx is
// never fetched. Verified against this page -- VAN's navigation started, then
// location.replace() 8ms later (the measured gap): the browser lands on
// CreateAList.aspx, TurfList.aspx never loads, and no history entry is left.
//
// Winning that race means going *last*, which is why the listener is attached
// inside the wrapped send(). By then VAN has already attached its own handler
// to the request, so ours runs after it and navigates second.

(function () {
  'use strict';

  // Written by gotv-mode.js on CreateAList.aspx. Keep in step with it.
  var MODE_KEY = 'ves:gotv-turf-cutting';

  var SAVE_ENDPOINT = '/Services/JS/TurfCutterService.asmx/CreateAndSaveTurfs';
  var RETURN_TO = '/CreateAList.aspx';

  function log() {
    var args = ['[van-enhancement-suite:redirect-after-save]'].concat([].slice.call(arguments));
    console.debug.apply(console, args);
  }

  // Only in GOTV mode. A user who cut a turf by hand asked for nothing and is
  // entitled to VAN's own landing page.
  function gotvModeOn() {
    try {
      return window.localStorage.getItem(MODE_KEY) === 'on';
    } catch (e) {
      return false;
    }
  }

  function isSaveRequest(method, url) {
    return String(method || '').toUpperCase() === 'POST' &&
      String(url || '').indexOf(SAVE_ENDPOINT) !== -1;
  }

  // A 200 alone is not success: the service answers errors with 200 as well.
  // A saved turf comes back as {"d":"EID..."}, so require that envelope rather
  // than bouncing the user off a failure they never got to read.
  function savedOk(xhr) {
    if (xhr.status !== 200) return false;
    try {
      var body = JSON.parse(xhr.responseText);
      return typeof body.d === 'string' && body.d.length > 0;
    } catch (e) {
      return false;
    }
  }

  // replace() rather than assigning href: after a save the map is spent, and a
  // Back that returned to it would only bounce forward again on the next save.
  function returnToList() {
    log('Turf saved; returning to ' + RETURN_TO + ' instead of TurfList.aspx.');
    window.location.replace(RETURN_TO);
  }

  function install() {
    var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__vesRedirectHooked) return;
    proto.__vesRedirectHooked = true;

    var open = proto.open;
    var send = proto.send;

    proto.open = function (method, url) {
      this.__vesSave = isSaveRequest(method, url);
      return open.apply(this, arguments);
    };

    proto.send = function () {
      // Attached here, not in open(), so this fires after VAN's own handler and
      // the navigation it starts. See the note at the top of this file.
      if (this.__vesSave) {
        var xhr = this;
        xhr.addEventListener('loadend', function () {
          if (!gotvModeOn()) {
            log('GOTV mode is off; leaving VAN to land on TurfList.aspx.');
            return;
          }
          if (!savedOk(xhr)) {
            log('Save did not come back clean (status ' + xhr.status + '); staying put.');
            return;
          }
          returnToList();
        });
      }
      return send.apply(this, arguments);
    };

    log('Watching for turf saves.');
  }

  install();
})();
