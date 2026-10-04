# 04 Hard keys and backlight

Everything here lives in `www/crestron-keys.js`, loaded into every dashboard page through
the `frontend` block. The side-key part is TSW-1060 specific. The idle part works anywhere.

## The side keys

With `APPKEYS ON`, the five capacitive keys reach the browser as ordinary `keydown`
events. `e.key` reads `Unidentified` and the useful name is in `e.code`, so match on `code`.
Top to bottom:

| Key | `e.code` | Page sees it | Then | Mapped to |
|---|---|---|---|---|
| Power | `BrowserBack` | yes | **the firmware closes the browser** | nothing |
| Home | `Home` | yes | **the firmware closes the browser** | the first view in `VIEWS` |
| Bulb | `AudioVolumeMute` | yes | **the firmware closes the browser** | `/wall-panel/lights` |
| Up | `AudioVolumeUp` | yes | nothing | next view |
| Down | `AudioVolumeDown` | yes | nothing | previous view |

The handler keeps a few alias names per key (`BrowserHome`, `VolumeUp` and so on) in case
other firmware reports them differently. Extra entries cost nothing, and a key that matches
nothing falls through to the OS.

Navigation is in-page, with `history.pushState` plus a `popstate` event, which Home Assistant's
router picks up without reloading anything. That is why up and down feel instant.

`VIEWS` at the top of the file is the panning order. Add a view to the dashboard, add its
path here, bump `?v=` in the `frontend` block.

## Power, home and bulb close the browser

The page receives all three, the handler matches them and calls `preventDefault`, and the
firmware closes the browser anyway. We also swallow `keyup` and `keypress` in case the
close was driven by the release. It is not. `APPKEYS` has no per-key setting and there is
no other console command for the keys, so the override applies to the CH5 project and not
to the browser.

How we proved it, because guessing cost three rounds. A temporary readout on the page
showed the key name as matched, so the page definitely caught the press. Then the webhook
automation's `last_triggered` time moved on that press, so the browser definitely
closed. You need both facts to see the cause. Set `KEY_READOUT = true` in
`crestron-keys.js` to get the readout back.

So the closing cannot be stopped. What happens next is the launcher chain from
[02](02-crestron-tsw1060.md#the-launcher-chain). The project underneath becomes visible,
posts the webhook, and Home Assistant reopens `kiosk.html` a few seconds later.

## The crestronNext handoff

Rather than fight the reload, we make it land on the right view. Before navigating, the
key handler writes a note to `localStorage`:

```js
localStorage.setItem("crestronNext", JSON.stringify({ path: m.path, at: Date.now() }));
```

`localStorage` in the standalone browser survives the browser closing (it does not survive
a reboot). When `kiosk.html` loads, it reads `crestronNext`, deletes it, and uses the path
as its target if the note is under 60 seconds old and the path looks like
`/wall-panel/<view>`. The bulb still costs a reload, but the reload ends on Lights.

## Idle return

After five minutes with no touch or key, any view other than the first in `VIEWS` goes back
to the first. That is `IDLE_MS`.

Taps inside the Meadow never reach the dashboard page, because the Meadow is an iframe. So
`meadow.html` dispatches a `crestron-activity` event on its parent document on every
`pointerdown`, and `crestron-keys.js` counts that as activity. It also forwards the side
keys up to the parent, so up and down still pan while the Meadow has focus.

## Keys from a page on another server

The Meadow can dispatch straight onto the dashboard document because it is served from
Home Assistant's own origin. An iframe from any other origin cannot: touching
`parent.document` throws a security error
([trap 21](07-traps.md#21-a-cross-origin-iframe-cannot-dispatch-events-on-the-dashboard)).
So `crestron-keys.js` has a small `postMessage` relay at the bottom.

- `EMBED_ORIGIN` is the one origin it listens to, scheme and port included, for example
  `"http://192.168.1.60:8137"`. It is `null` by default, which leaves the relay off.
- A message from any other origin is dropped, because any page can post one.
- `{ type: "crestron-activity" }` becomes a `crestron-activity` event, so the idle and
  backlight timers see the tap.
- `{ type: "crestron-key", event: "keydown", key, code }` becomes a real `KeyboardEvent` on
  the dashboard document, and the normal handler maps it. Only `keydown`, `keyup` and
  `keypress` are accepted.

The embedded page's half, about a dozen lines, is in
[06](06-views.md#a-page-from-another-server). Only one origin is supported. A second
embedded server would need `EMBED_ORIGIN` turned into a list.

## The Meadow's buildings

Tapping a building in the Meadow opens a view: the cottage opens Home, the bandstand Music,
the workshop Printer, and the office robot an Office view if you have one. The map is
`VIEW` in the Meadow's CONFIG block, and `null` leaves a building as scenery.

It uses the same trick as the side keys. `goView()` in `meadow.html` calls
`parent.history.pushState(null, "", path)` and then dispatches
`new parent.PopStateEvent("popstate")` on the parent window, and Home Assistant's router
moves to the view without a reload. The event is built from the parent window's own
`PopStateEvent`, so it belongs to the document it is dispatched on. It only works because
the Meadow is same-origin with the dashboard. Opened on its own, outside the dashboard, a tap logs a warning to the console
and does nothing.

A tap on a building is a touch on the page, so it counts as activity like any other, and
the idle return will bring the panel back to the Meadow five minutes later.

## Why not standby

The panel has its own standby (`STBYTO`, in minutes). It looks like the obvious way to dark
the screen at night. It is not, because **waking from standby makes the firmware reload the
browser page.** Every wake is a full dashboard rebuild with a blank screen in the middle.

We proved it by having the page post to the Home Assistant logbook on load and on
visibility change, then driving `STANDBY` and `STANDBY OFF` from the console. Every wake
logged "hidden" then "page load" within three seconds. The launcher webhook stayed silent,
so the browser was not closed, and `suspendWhenHidden` was already off, so it was not Home
Assistant either. No page code can stop it.

## The brightness replacement

So standby is off (`STBYTO 0`) and the page manages the backlight itself:

1. After 15 minutes idle (`DIM_MS`), a full-screen black shield covers the page and the
   script calls `shell_command.crestron_brightness` with `level: 0`. Home Assistant runs
   `crestron_cmd.py BRIGHTNESS 0` over SSH.
2. The next tap hits the shield, not whatever was under the finger. The shield hides and the
   script calls that command again with `level: 100`.
3. Every fresh page load sets brightness 100 once the Home Assistant connection is up. A key
   press in the dark closes and reopens the browser, and the new page must not inherit a
   backlight at zero.

`BRIGHTNESS` leaves auto-brightness on, so the panel's light sensor still scales the level
you set. The non-admin panel user can call the shell command.

The shell command in `configuration.example.yaml`:

```yaml
shell_command:
  crestron_brightness: "python3 /config/scripts/crestron_cmd.py BRIGHTNESS {{ level | int(100) }}"
```

The page stays loaded throughout, so waking is instant. To test without waiting a quarter
of an hour, set `DIM_MS` to a minute and bump `?v=`. A screenshot will not help here (the
shield is black either way), so confirm the calls in the Home Assistant log, where
`shell_command` failures show up, and look at the wall.

On a tablet that is not a TSW-1060, see [01](01-any-tablet.md#brightness).
