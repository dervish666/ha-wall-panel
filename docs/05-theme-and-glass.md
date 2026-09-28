# 05 Theme and glass

The look is frosted glass over a dark wallpaper: translucent cards with a sheen and a 1px
rim, one amber accent, Instrument Sans, and nothing that scrolls at 1280x800. All of it is
in `themes/wall-panel.yaml`, and none of the glass depends on card-mod.

## Glass from native ha-card tokens

On the TSW-1060, card-mod only reaches the card surface and sometimes skips a load
([trap 6](07-traps.md#6-card-mod-4-on-the-legacy-build-only-reaches-the-card-surface)).
So the glass is built from variables `ha-card` already reads from the theme:

| Token | What it does here |
|---|---|
| `ha-card-background` | takes a full `background` shorthand, so the sheen gradient and the fill are one value: `linear-gradient(135deg, rgba(255,255,255,.11) 0%, rgba(255,255,255,.035) 45%, rgba(255,255,255,0) 100%), rgba(18,26,38,.42)` |
| `ha-card-border-width`, `ha-card-border-color` | the 1px rim, white at 14% |
| `ha-card-border-radius` | 26px, the one radius used everywhere |
| `ha-card-box-shadow` | inset highlights for the top edge, a soft drop shadow underneath |
| `ha-card-backdrop-filter` | `none`, see below |
| `ha-card-header-font-size`, `ha-card-header-color` | a markdown card's `title:` |
| `lovelace-background` | the wallpaper, `center / cover no-repeat url("/local/wallpaper.jpg?v=2")` |

Mushroom reads its own `mush-*` variables for radius, icon size and type, and the accent is
set once as `mush-rgb-*`. The one card-mod rule left in the theme is `card-mod-root`, which
hides the header so the view gets the whole 800px.

A card that should sit flat on the wallpaper (the date line, the "around the house" list)
undoes the glass with a small card-mod block kept as a YAML anchor, `&flat`, in the dashboard.
Glass means "you touch this often". Flat means "reference".

## Why there is no backdrop blur

`backdrop-filter` works on the panel's Chrome 87 and it paints. The question is cost. We
measured it with `www/glass-probe.html`, which puts twelve glass cards in shadow roots over the
wallpaper, and a dot sweeping underneath so the compositor has to re-read the backdrop on
every frame.

| Cards | fps |
|---|---|
| translucent fill only | 60 |
| `blur(24px) saturate(140%)` | 10 to 14 |
| `blur(8px) saturate(140%)` | 8 to 12 |

The radius makes no difference. The cost is the readback per surface. A dashboard that never
moves could carry it, but the side keys swipe between views and those would run as a
slideshow. So the theme sets `ha-card-backdrop-filter: none` and gets the frosted look from
a wallpaper that is already soft, plus the fill, sheen and rim. In a still photo the two are
hard to tell apart.

On a faster tablet, try it. It is one theme line:

```yaml
ha-card-backdrop-filter: "blur(14px) saturate(150%)"
```

Then measure on the device, not on your desktop.

## The glass probe

Open `/local/glass-probe.html` on the device:

- `?mode=flat` draws the cards with the fill only;
- `?mode=blur&r=8` adds `backdrop-filter: blur(8px)`, and `r` sets the radius.

The HUD prints frames per second averaged over three-second windows, plus whether the
browser claims `backdrop-filter` support. On the TSW-1060, open it with `BROWSEROPEN`
(close the browser first, [trap 9](07-traps.md#9-browseropen-will-not-navigate-an-open-browser))
and read the HUD off a screenshot. Re-run it after a firmware update.

## The wallpaper

`tools/wallpaper.py` draws `wallpaper.jpg`: a near-black navy ground, a few wide luminous
ribbons and glows in blues, teal and one amber, heavily blurred, with grain so the LCD does
not band. It needs Python 3 with `numpy` and `Pillow`.

```sh
python3 tools/wallpaper.py homeassistant/www/wallpaper.jpg 7
```

The second argument is the seed. A given seed always draws an identical image, so try a few and keep
the one you like. Size is `W, H` at the top of the script (1280x800). After replacing the
file, bump `?v=` in the theme's `lovelace-background` and reload themes (Developer tools,
Actions, `frontend.reload_themes`).

## Columns

The views use the sections layout. Its column count comes from two theme variables:

```
columns = floor((width - padding + gap) / (min_width + gap))
```

The default minimum of 320px gives three columns at 1280 wide. The theme sets
`ha-view-sections-column-min-width: 272px` and `ha-view-sections-column-gap: 20px`, which
gives four. Each view can still cap itself lower with `max_columns`. For a different
screen, solve for `min_width` with your own width.

## Rows

Card height in a sections view comes from `grid_options.rows`, not from CSS. `height:` on
`ha-card` is ignored. Rows are 56px with 8px gaps, so:

```
height of a card with rows: N  =  64 * N - 8  px
```

A full column is **twelve rows, 760px**, which is the budget at 800px tall. Every card on
the Today view has a fixed row count, `overflow: hidden` and a capped list, so a busy day
truncates instead of scrolling the whole wall.

Two things break the budget silently:

- **`rows: auto`** cannot be counted. Adding one light card to an `auto` column pushed two
  tiles below the bottom of the screen with nothing to say so.
- **A hidden conditional card still reserves its rows**
  ([trap 15](07-traps.md#15-a-hidden-conditional-card-still-reserves-its-grid-rows)).

Both look identical to a card that failed to render, and neither shows in a desktop browser.
After adding or resizing a card, look at the actual panel.

## Type

Instrument Sans throughout, self-hosted in `www/fonts/` and registered by
`www/panel-fonts.js`. A theme can name a font but cannot load one, and the legacy build
ignores `extra_module_url`, so the script loads the faces with the `FontFace` API. The
Meadow uses Fredoka, loaded by its own `@font-face`.

Card-level type sizes come from theme variables and native cards, because card-mod cannot
reach inside a card on this build. The large clock on Home is the core `clock` card, and the
big numbers on the Printer view are `mushroom-legacy-template-card`, because the Mushroom 4
template card ignores size variables
([trap 14](07-traps.md#14-mushroom-4s-template-card-ignores-every-card-variable)).
