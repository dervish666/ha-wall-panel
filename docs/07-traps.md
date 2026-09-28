# 07 Traps

Nineteen things that cost us time. Most are TSW-1060 specific, some bite on any Home
Assistant dashboard, and several fail silently while looking plausible, which is what makes
them expensive. Each says what happens, why, and what to do.

Tested on a TSW-1060, firmware v3.002.0036 (built 20 June 2022), Home Assistant 2026.9,
card-mod 4.2.1, Mushroom 4.

### 1. There are two browser engines and the default one is from 2015

`BROWSERSELECT` switches between `CHROMIUM` and `WEBVIEW`. The default, `CHROMIUM`, claims
to be Chrome 55 and behaves like Chrome 40: no custom elements, no Shadow DOM, no CSS
variables, no async/await. Its user agent string lies. `WEBVIEW` is a genuine Chrome 87.

On `CHROMIUM`, Home Assistant dies before painting and the logo sits there forever. It looks
like an auth problem and is not one. Run `BROWSERSELECT WEBVIEW`. It survives a reboot.

### 2. The user project's webview has no localStorage, on any origin

A CH5 user project runs in that Chrome 87 engine too, but `window.localStorage` is `null`
there, and stays `null` after navigating to Home Assistant's origin. IndexedDB,
sessionStorage and cookies work. Home Assistant keeps its tokens in `localStorage`, so the
dashboard cannot run inside the project. The project has to get the standalone browser
opened instead, which is the whole reason the webhook chain exists
([02](02-crestron-tsw1060.md#the-launcher-chain)).

### 3. Half the useful console commands are hidden from HELP ALL

`BROWSEROPEN`, `SCREENSHOT` and most of the browser and memory commands are missing from
`HELP ALL` on this firmware and work anyway. Probe with `COMMAND ?` (not `HELP COMMAND`) and
treat absence from the help listing as saying nothing. The confirmed list is in
[02](02-crestron-tsw1060.md#useful-console-commands).

### 4. Storage survives a browser restart but not a reboot

`localStorage` in the standalone browser persists across `BROWSERCLOSE` and `BROWSEROPEN`,
even with the cache disabled. A reboot wipes it. So `kiosk.html` re-establishes the session
and the frontend preferences on every visit, and each reboot leaves one more refresh token
under the panel user.

### 5. Home Assistant caches /local/ for a month

Everything under `www/` is served with `Cache-Control: public, max-age=2678400`, and the
panel honours it even with `BROWSERCACHE DISABLE`. Edit `kiosk.html` and nothing changes
until the URL does. The shell command appends `?b=<timestamp>` to the kiosk URL, and every
script in the `frontend` block carries a `?v=N` that you bump by hand after each edit. Bump
the Meadow's iframe URL and the wallpaper URL in the theme as well.

### 6. card-mod 4 on the legacy build only reaches the card surface

The panel gets Home Assistant's legacy frontend build. There, card-mod rules against
`ha-card` itself work (background, border, padding). Nothing inside the card does. Not
`:host` variables, not the old `$` shadow piercing, not selectors on Mushroom's inner
elements. We tried five variants and photographed each.

What does work:

- On the markdown card, a rule on `ha-markdown` itself lands, and **inherited** properties
  reach the content. `ha-markdown { font-size: 21px; line-height: 1.5; }` works.
  `ha-markdown h2`, `ul` and `li` do not, so you cannot style one part differently from
  another.
- **CSS custom properties cross shadow boundaries when selectors cannot.** Set
  `--ha-card-header-font-size: 27px` on `ha-card` and it reaches a header no selector can
  touch. Before inventing a workaround, look for the custom property Home Assistant already
  exposes for that part. It usually exists and it survives frontend updates.

Consequences for layout. Do not build hierarchy with markdown headings, because `## Name` is
em-relative, so raising the body size raises the heading too. Use the card's `title:`
instead, which renders at the header size. card-mod on the core clock card applies on some
loads and not others, so leave the clock plain.

Related, and true on any browser. A card's `content` must be a **literal** block scalar
(`|-`), never folded (`>-`). Folded scalars join lines with spaces and silently collapse
every markdown list item onto one line. It looks like a template bug and is not.

### 7. The power key cannot be caught, and neither can home or the bulb

All five side keys reach the page as key events (name in `e.code`, `e.key` is
`Unidentified`). Power, home and the bulb then close the browser whatever the page does,
including `preventDefault` on keydown, keyup and keypress, and a history back-trap. Up and
down do nothing else and navigate cleanly. `APPKEYS` has no per-key setting.

We stopped fighting it. The key handler leaves the wanted view in `localStorage` as
`crestronNext`, and when the launcher reopens `kiosk.html` it lands there. Detail and the
way we proved it are in [04](04-hard-keys-and-backlight.md).

### 8. EMS app mode kills the SD card

`APPMODE EMS` is the obvious way to point the panel at a URL. Its caching writes to flash
over 100,000 times an hour, which wears out the storage. The crestron-ha-launcher author
measured this. Use `BROWSEROPEN` with `BROWSERCACHE DISABLE`.

### 9. BROWSEROPEN will not navigate an open browser

With the browser closed, `BROWSEROPEN <url>` opens it at the URL. With it already open, it
only brings the current page to the front, which looks exactly like a navigation that
worked. We took three screenshots of the wrong view before a probe page spelled it out.

Run `BROWSERCLOSE`, wait about five seconds, then `BROWSEROPEN`. And turn off the
open-browser automation while you do, or the launcher reopens the kiosk in the gap.

### 10. Hidden dashboard views are not routable

A view with `visible: false` exists in the config, but the frontend refuses to route to it
and falls back to the first view, even from a direct URL. Keep every view visible. The
theme's `card-mod-root` already hides the header and the tabs with it, so it costs nothing.

### 11. The camera is out of reach of the browser

The panel's camera toggle only arms it for Crestron's own intercom. `getUserMedia` needs a
secure context and `http://<ha-address>` is not one. `www/camera-probe.html` reports
`isSecureContext: false`, no `navigator.mediaDevices`, and no legacy
`navigator.getUserMedia`. Reaching the camera would need HTTPS on Home Assistant with a
certificate the panel trusts, and then a permission prompt nobody is there to answer. We
did not attempt it.

### 12. Backdrop blur renders, and costs the frame rate whatever the radius

`backdrop-filter` is supported and paints. Any backdrop filter at all drops moving content
from 60 fps to 8 to 14 fps, and the radius makes no difference. Numbers and the probe are in
[05](05-theme-and-glass.md#why-there-is-no-backdrop-blur). The theme sets
`ha-card-backdrop-filter: none` and fakes the frost with a soft wallpaper.

### 13. Glass needs no card-mod, it is all native ha-card tokens

Given trap 6, none of the look depends on card-mod. `ha-card` reads fill, sheen, border,
radius, shadow and backdrop filter from theme variables, and the sections layout reads its
column width and gap from the theme too. Card height comes from `grid_options.rows` (`64 * N - 8`
pixels), not from CSS, and `height:` on `ha-card` is ignored. The full list is in
[05](05-theme-and-glass.md).

The markdown card has `tap_action` (since at least 2026.9), so a tappable panel with a title
is one markdown card. `<br>` inside markdown survives the sanitiser, which is how lists
render without bullets.

### 14. Mushroom 4's template card ignores every card variable

`custom:mushroom-template-card` is built on the Tile card in Mushroom 4 and does not honour
Mushroom themes. `--card-primary-font-size`, `--card-primary-color`, `--icon-size` and the
rest do nothing to it. We set 31px on three stat cards and the screenshot showed them
unchanged.

`custom:mushroom-legacy-template-card` ships in that bundle and honours all of them. Use
it wherever size or colour matters. Light, media player and entity cards are unaffected.
Read this before styling a card, not after screenshotting it.

### 15. A hidden conditional card still reserves its grid rows

In a sections view, a `conditional` card whose condition is false renders nothing, but its
grid rows stay allocated. Three mutually exclusive conditionals (Pause, Resume, "nothing
printing") cost four empty rows, 256px of an 800px screen, and pushed the last card off the
bottom. It looks exactly like a card that failed to render.

There is no card-level fix, because a `tap_action` can neither branch on state nor template
its target. Put the branch in a script and keep one card. `script.printer_pause_resume` is
the worked example.

Silent overflow also comes from `rows: auto`, which cannot be counted. And when you
budget a markdown card, count **rendered** lines, not list entries. A 272px column holds
about 26 characters at 18px, so one entry can be three lines on the wall. Estimate each
with `(plain_text | length / 26) | round(0, 'ceil')` after stripping `**`, `*` and HTML
entities, and spend the budget on warnings before ordinary items. After any layout change,
screenshot the real panel. Nothing else reports these failures.

### 16. set inside a Jinja for does not survive the loop

Not panel-specific, but it broke three cards here, each time silently and plausibly. A
`{% set %}` inside a `{% for %}` is scoped to that iteration, so:

- a list built inside the loop comes out empty, and its line vanishes;
- a day-grouped agenda renders each day's header with nothing under it, which reads as
  "nothing on that day";
- a running total stays at its starting value.

Use a namespace. `{% set ns = namespace(rows=[]) %}`, then `{% set ns.rows = ns.rows + [x] %}`
inside the loop.

### 17. A YAML alias cannot precede its anchor, so subview order matters

The detail subviews on Today reuse YAML anchors (`&back`, `&personlist`) defined in the
first person subview. YAML resolves top to bottom, so the detail views **must stay after
the person views** in the file. Move them up and the dashboard fails to parse, with an error
that names the alias and says nothing about order.

### 18. Mushroom primary and secondary are plain text, not HTML

`&middot;` in a Mushroom card's `primary` or `secondary` renders as the seven characters
`&middot;`. A markdown card three lines away decodes that entity fine, which is how it
slips through review. Nothing in the logs shows it, because the template produced exactly
what it was asked for. Type the actual character.

### 19. Waking from standby reloads the browser page

Standby (`STBYTO`) freezes the page, and on wake the firmware reloads it, so every wake is
a full dashboard rebuild. No page code can stop it. Set `STBYTO 0` and let the page turn the
backlight off itself after 15 minutes idle with `BRIGHTNESS 0`, behind a black shield that
eats the waking tap. `STANDBY` and `STANDBY OFF` drive standby from the console, so you can
test without standing at the wall. How we proved it is in
[04](04-hard-keys-and-backlight.md#why-not-standby).

## Two habits that found most of these

**Look at the real screen.** `SCREENSHOT` writes a 1280x800 BMP to `/logs/ScreenShot.bmp`,
and `tools/shot.sh` fetches it over SFTP, deletes it from the panel and hands back a small
JPEG. Traps 6, 14, 15 and 18 were only visible this way. A desktop browser at a different
width shows none of them.

**Probe pages for what the screen cannot show.** Drop an HTML page into `www/`, open it with
`BROWSEROPEN`, and have it post what it finds to a throwaway HTTP server on your computer.
It is on Home Assistant's origin, so it can call `/auth/*` and the API directly.
`glass-probe.html` and `camera-probe.html` are two of these.
