// Crestron TSW-1060 side buttons -> Home Assistant.
// With APPKEYS ON the five capacitive keys arrive in the browser as keyboard
// events. Top to bottom the panel prints: power, home, up, bulb, down.
//
// The top (power) key is BrowserBack and the OS closes the browser on it
// before any page can object, so it is not mapped; the launcher project
// reopens the browser when that happens. This firmware reports e.key as
// "Unidentified" and puts the name in e.code.
//
// Navigation is in-page: pushState plus a popstate event, which the Home
// Assistant router picks up without refetching anything. A key that does NOT
// match MAP falls through to the OS, and for the home key that means leaving
// the browser, which makes the launcher webhook reopen it from scratch. That
// full reload is the slow behaviour first seen on the home and bulb keys,
// and it is the symptom of a MISSED mapping rather than of navigation itself.
// Hence the aliases below and the on-screen readout.
(function () {
  "use strict";

  // Panning order. The Meadow is first because it is the landing page; Today
  // sits next to it. Add a view to dashboards/wall-panel.yaml and its path here.
  var VIEWS = [
    "/wall-panel/meadow",
    "/wall-panel/today",
    "/wall-panel/home",
    "/wall-panel/lights",
    "/wall-panel/printer"
  ];
  var HOME_VIEW = VIEWS[0];

  // Several aliases per key: this firmware has not been pinned down, and an
  // unmatched name is what causes the reload. Extra entries cost nothing.
  var MAP = {
    "Home":            { action: "navigate", path: HOME_VIEW },
    "BrowserHome":     { action: "navigate", path: HOME_VIEW },
    "GoHome":          { action: "navigate", path: HOME_VIEW },
    "AudioVolumeMute": { action: "navigate", path: "/wall-panel/lights" },
    "VolumeMute":      { action: "navigate", path: "/wall-panel/lights" },
    "AudioVolumeUp":   { action: "step", dir: 1 },
    "VolumeUp":        { action: "step", dir: 1 },
    "AudioVolumeDown": { action: "step", dir: -1 },
    "VolumeDown":      { action: "step", dir: -1 }
  };

  // Key-name readout, bottom right, for a second and a half: grey when the key
  // matched MAP, red and prefixed UNMAPPED when it did not. Off by default,
  // because this is a living-room wall and not a console. Flip to true when
  // working on the keys again; it is how we established that Home and the bulb
  // ARE caught by the page and the firmware closes the browser anyway.
  var KEY_READOUT = false;
  var box;
  function show(name, matched) {
    if (!KEY_READOUT) return;
    if (!box) {
      box = document.createElement("div");
      box.style.cssText =
        "position:fixed;right:10px;bottom:8px;z-index:99999;" +
        "font:600 15px/1.2 monospace;padding:5px 9px;border-radius:5px;" +
        "background:rgba(0,0,0,.72);pointer-events:none;";
      document.body.appendChild(box);
    }
    box.style.color = matched ? "rgba(255,255,255,.45)" : "#FF6B6B";
    box.textContent = (matched ? "" : "UNMAPPED ") + name;
    box.style.opacity = "1";
    clearTimeout(box._t);
    box._t = setTimeout(function () { box.style.opacity = "0"; }, 1500);
  }

  function go(path) {
    if (location.pathname === path) return;
    history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  function handle(e) {
    var name = (e.code && e.code !== "Unidentified") ? e.code : e.key;
    var m = MAP[name];
    show(name, !!m);
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return;
    if (m.action === "navigate") {
      // Home and the bulb close the browser whatever this page does (docs:
      // the side keys), and the launcher reopens it through kiosk.html. Leave
      // kiosk a note so the reopen lands on the view the key asked for.
      try { localStorage.setItem("crestronNext", JSON.stringify({ path: m.path, at: Date.now() })); } catch (err) {}
      go(m.path);
    } else if (m.action === "step") {
      var i = VIEWS.indexOf(location.pathname);
      if (i < 0) i = 0;
      go(VIEWS[(i + m.dir + VIEWS.length) % VIEWS.length]);
    }
  }

  // The firmware closes the browser on Home and the bulb even though the page
  // catches the keydown and calls preventDefault (verified 2026-09-19: the
  // launcher's crestron-open-browser webhook fires on every press). Trapping
  // keyup and keypress as well is the only remaining in-page lever: if the
  // close is driven by key RELEASE rather than press, swallowing it here stops
  // it. If the browser still closes after this, the behaviour is below the
  // webview and no page code can prevent it.
  function swallow(e) {
    var name = (e.code && e.code !== "Unidentified") ? e.code : e.key;
    if (!MAP[name]) return;
    e.preventDefault();
    e.stopPropagation();
  }

  // Idle: five minutes with no touch or key on any other view, and the panel goes
  // back to the Meadow. Taps inside the Meadow's iframe arrive as the
  // "crestron-activity" event that meadow.html dispatches on this document.
  //
  // Fifteen minutes idle and the backlight goes off. This replaces the panel's
  // own standby (STBYTO 0), because waking from standby makes the firmware
  // reload the browser page: proved 2026-09-27 with this page logging "hidden"
  // then "page load" on every wake, with suspendWhenHidden off and no launcher
  // webhook. A dim page stays loaded. While dark, a full-screen shield eats the
  // waking tap so it cannot also press whatever was under the finger.
  var IDLE_MS = 5 * 60 * 1000, DIM_MS = 15 * 60 * 1000, lastTouch = Date.now(), dark = false, shield;
  function brightness(level) {
    var ha = document.querySelector("home-assistant"), hass = ha && ha.hass;
    if (hass && hass.connected) hass.callService("shell_command", "crestron_brightness", { level: level })
      .catch(function (err) { console.warn("crestron-keys: brightness failed", err); });
    else console.warn("crestron-keys: no hass connection, brightness not set");
  }
  function wake() {
    lastTouch = Date.now();
    if (!dark) return;
    dark = false;
    shield.style.display = "none";
    brightness(100);
  }
  function sleep() {
    dark = true;
    if (!shield) {
      shield = document.createElement("div");
      shield.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:100000;background:#000;";
      ["pointerdown", "touchstart", "mousedown", "click"].forEach(function (ev) {
        shield.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); wake(); }, true); });
      document.body.appendChild(shield);
    }
    shield.style.display = "block";
    brightness(0);
  }
  // A fresh page is a lit page: Home and the bulb close the browser even while
  // dark, and the reopened page must not inherit a backlight at zero.
  (function lightUp(tries) {
    var ha = document.querySelector("home-assistant");
    if (ha && ha.hass && ha.hass.connected) brightness(100);
    else if (tries < 60) setTimeout(function () { lightUp(tries + 1); }, 1000);
  })(0);
  ["pointerdown", "touchstart", "keydown", "crestron-activity"].forEach(function (ev) {
    document.addEventListener(ev, wake, true); });
  setInterval(function () {
    var idle = Date.now() - lastTouch;
    if (!dark && idle > DIM_MS) sleep();
    else if (idle > IDLE_MS && location.pathname !== HOME_VIEW) go(HOME_VIEW);
  }, 30000);

  document.addEventListener("keydown", handle, true);
  document.addEventListener("keyup", swallow, true);
  document.addEventListener("keypress", swallow, true);
})();
