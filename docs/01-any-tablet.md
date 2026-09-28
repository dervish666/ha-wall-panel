# 01 Any tablet

The dashboard is ordinary Home Assistant YAML with a theme and a few static files. Any
tablet with a current browser can run it. This page covers that path. The Crestron extras
are in [02](02-crestron-tsw1060.md).

## What is Crestron-only and what is not

| Piece | Any tablet | TSW-1060 only |
|---|---|---|
| `dashboards/wall-panel.yaml`, `themes/wall-panel.yaml` | yes | |
| `www/kiosk.html` (hands-free sign-in) | yes | |
| `www/panel-fonts.js`, `www/fonts/` | yes | |
| `www/meadow.html` | yes | |
| `www/crestron-keys.js`, idle return to the Meadow | yes | |
| `www/crestron-keys.js`, side keys | | yes, but any hardware keys that arrive as key events will work |
| `www/crestron-keys.js`, backlight off | needs your own brightness command | the shipped one SSHes to the panel |
| `crestron/launcher/`, the webhook, `scripts/crestron_cmd.py` | | yes |
| `tools/shot.sh`, `tools/console.exp` | | yes |
| `tools/wallpaper.py`, `www/glass-probe.html` | yes | |

## 1. Install the frontend pieces

Install **card-mod** and **Mushroom** from HACS. Copy `homeassistant/www/` to `config/www/`
and `homeassistant/themes/wall-panel.yaml` to `config/themes/`. Make sure your
`configuration.yaml` loads themes from that folder:

```yaml
frontend:
  themes: !include_dir_merge_named themes
```

## 2. Load the scripts

Home Assistant serves two frontend builds. Old browsers get the legacy build, which only
loads `extra_js_url_es5`. Current browsers get the modern build, which only loads
`extra_module_url`. The TSW-1060 gets the legacy one. A recent tablet almost certainly gets
the modern one, so list the scripts under both and let the browser take the one it uses:

```yaml
frontend:
  themes: !include_dir_merge_named themes
  extra_module_url:
    - /local/panel-fonts.js?v=1
    - /local/crestron-keys.js?v=1
  extra_js_url_es5:
    - /local/panel-fonts.js?v=1
    - /local/crestron-keys.js?v=1
```

Both files are plain scripts that also run as modules. Bump `?v=` every time you edit one,
because Home Assistant tells browsers to cache `/local/` for a month
([trap 5](07-traps.md#5-home-assistant-caches-local-for-a-month)).

Leave `crestron-keys.js` out if you do not want the idle behaviour. See "Brightness" below.

## 3. Register the dashboard

```yaml
lovelace:
  dashboards:
    wall-panel:
      mode: yaml
      filename: dashboards/wall-panel.yaml
      title: Wall Panel
      icon: mdi:tablet-dashboard
      show_in_sidebar: true
      require_admin: false
```

Swap the placeholder entities for your own ([06](06-views.md)) and restart. Open
`/wall-panel/home` on a desktop browser first. If it renders there, it will render on the wall.

## 4. A user for the tablet

Create a Home Assistant user for the tablet under Settings, People, Users. Make it
**non-admin** and tick **Can only log in from the local network**. Everything the wall
does, including calling the shell commands, works without admin rights.

## 5. Sign-in without a keyboard

A wall tablet should come back from a reboot signed in. Two ways:

- **Log in once by hand.** Fine on a tablet whose browser keeps its storage across reboots.
- **`trusted_networks` plus `kiosk.html`.** Home Assistant trusts one IP address and
  `kiosk.html` completes the sign-in itself. This is what the TSW-1060 needs, because a
  reboot wipes its browser storage. Read [03](03-kiosk-login.md) first, including the
  security section.

If you use `kiosk.html`, the tablet's start URL is:

```
http://<your-ha-address>:8123/local/kiosk.html
```

Point the tablet straight at Home Assistant, not through a reverse proxy. `trusted_networks`
checks the address the request comes from, and behind a proxy that is the proxy.

## 6. A browser in kiosk mode

You want a browser that fills the screen, starts on boot, and reopens after a crash. On
Android, [Fully Kiosk Browser](https://www.fully-kiosk.com/) is one well-known option.
Home Assistant also has a core Fully Kiosk integration that exposes screen brightness and
screen on/off as entities. We have not tested this repo on it, so treat it as a starting
point. On an iPad, Guided Access keeps Safari in front.

Whatever you pick, set its start URL to the one above.

## 7. The theme

`kiosk.html` pins the "Wall Panel" theme and hides the sidebar in the browser's own
settings on every visit. Each view in the dashboard also sets `theme: Wall Panel`, so the
look holds even if you sign in by hand. The rest of your Home Assistant keeps its own
theme, because this one applies only where it is named.

## 8. Your screen is not 1280x800

The layout is tuned for 1280x800 CSS pixels, landscape. Many 10 inch Android tablets
report exactly that at a device pixel ratio of 1.5. Check yours by opening a page that shows
`window.innerWidth` and `window.innerHeight`. If it differs:

- the column count comes from two theme variables and a formula in
  [05](05-theme-and-glass.md#columns);
- the vertical budget is `64 * rows - 8` pixels per column, and it is 12 rows at 800px
  ([05](05-theme-and-glass.md#rows));
- `tools/wallpaper.py` has `W, H` at the top.

## Brightness

`crestron-keys.js` turns the backlight off after 15 minutes idle by calling
`shell_command.crestron_brightness` with `level: 0`, and back to 100 on the next touch.
A black shield covers the page meanwhile, so the waking tap presses nothing.

On another tablet, that shell command does not exist. The call fails, the script logs a
warning, and you get the black shield with the backlight still on. Three ways out:

- define `shell_command.crestron_brightness` to do whatever dims your tablet;
- edit `brightness()` in `crestron-keys.js` to call your tablet's own brightness service
  instead (for example a `number` or `light` entity from a kiosk browser integration);
- raise `DIM_MS` so it never fires and let the tablet's own screen timeout do the job.

The idle return (five minutes on any view other than the first in `VIEWS`, then back to it)
works on any tablet with no changes.
