# 03 Kiosk login

A wall panel has no keyboard and nobody wants to type a password on it after every power
cut. `www/kiosk.html` signs the panel in by itself, using Home Assistant's
`trusted_networks` auth provider, then hands over to the dashboard.

## Why a page, and not the provider alone

`trusted_networks` on its own still shows a login screen with a provider picker, and on the
TSW-1060 the browser forgets everything on reboot
([trap 4](07-traps.md#4-storage-survives-a-browser-restart-but-not-a-reboot)). So a page on
Home Assistant's own origin runs the auth flow itself and stores the tokens where the
frontend looks for them.

## The configuration

```yaml
homeassistant:
  auth_providers:
    # Keep this. Declaring auth_providers replaces the defaults, and without
    # this entry every human is locked out.
    - type: homeassistant
    - type: trusted_networks
      trusted_networks:
        - 192.0.2.50/32                           # the panel, and only the panel
      trusted_users:
        192.0.2.50/32: <panel user id>
      allow_bypass_login: true
```

`192.0.2.50` is a documentation address. Use your panel's reserved one. The user id is the
long hex string on the user's page under Settings, People, Users (turn on Advanced mode in
your profile to see it).

Keep the `homeassistant` provider first so the normal login screen still offers passwords
by default everywhere else.

## What kiosk.html does

1. **Checks for a pending view.** If a side key asked for a view in the last 60 seconds
   (`crestronNext` in `localStorage`, see [04](04-hard-keys-and-backlight.md)), that view
   becomes the target. Otherwise the target is `/wall-panel/meadow`.
2. **Sets the frontend preferences**, because a reboot wipes them. `dockedSidebar` to
   `always_hidden`, `selectedTheme` to `Wall Panel` in dark mode, and `suspendWhenHidden`
   to `false` so the websocket stays open while the screen is dark.
3. **Already signed in?** If `hassTokens` exists, it goes straight to the target.
4. **Starts a login flow.** `POST /auth/login_flow` with
   `handler: ["trusted_networks", null]` and `client_id` set to the Home Assistant origin
   plus `/`. With `allow_bypass_login` and exactly one trusted user for that address, the
   flow finishes at once with `type: create_entry` and an authorisation code in `result`.
5. **Swaps the code for tokens.** `POST /auth/token`, form encoded,
   `grant_type=authorization_code`, the code and that `client_id` again.
6. **Stores them as the frontend would.** The token response gets three extra fields,
   `hassUrl` (the origin), `clientId` and `expires` (`expires_in * 1000` plus now, in
   milliseconds), and is written to `localStorage.hassTokens`. That is the shape
   `home-assistant-js-websocket` reads back.
7. **Redirects** to the target with `location.replace`, so the kiosk page is not in history.

If any step fails, the page says why and offers a plain link to Home Assistant.

The frontend refreshes the access token itself from then on. `meadow.html` reads that
`hassTokens` entry and refreshes it itself when it needs to call the REST API.

Each reboot creates a new refresh token under the panel user, because storage is wiped and
the page signs in again. They are harmless and pile up under the user's profile, Security.
Delete them now and then if the list bothers you.

## Security

Read this before you turn `trusted_networks` on.

**It grants a login to an IP address, not to a device.** Any machine that turns up on that
address gets the panel user's session with no password. So:

- **Give the panel a DHCP reservation** on your router, tied to its MAC address, and keep
  the rest of the pool clear of that address. If the reservation goes, the next device to
  get that address is signed in.
- **Trust one address**, a `/32`. Never a range.
- **Use a dedicated non-admin user**, with "Can only log in from the local network" ticked.
  A non-admin can still control devices and call services, including shell commands, so
  keep those shell commands narrow. The shipped `crestron_brightness` coerces its argument
  with `int`, so it cannot be turned into another command.
- **Point the panel at Home Assistant directly.** Behind a reverse proxy Home Assistant sees
  the proxy's address, and trusting that trusts everyone who comes through the proxy.

**`www/` is public.** Home Assistant serves everything under `config/www/` at `/local/`
**without authentication**. Anyone who can reach your Home Assistant can fetch any file
there by name. If Home Assistant is reachable from the internet (Nabu Casa, a tunnel, a
forwarded port), that means anyone on the internet.

That matters for one file in particular. The original setup kept `family-extra.json`
(school items, kit days, term dates, which inboxes were checked) in `www/`, so it was
readable at `/local/family-extra.json` by anyone who could reach the server. Do not do that
with real data. Better options:

- **Keep it outside `www/`.** The `family_extra` sensor reads the file from disk with
  `command_line`, so it does not need to be served at all. Put it in `config/private/` and
  change the path in the sensor's `command`. The Meadow reads the sensor through the
  authenticated API, never the file.
- **Skip the file.** Write those attributes into Home Assistant directly, for example
  with a `template` sensor, an `input_text`, or a script of your own that posts to the REST
  API with a long-lived token.

The rest of `www/` in this repo is safe to serve: pages, scripts, fonts, a wallpaper, and
`family-extra.example.json`, which holds only placeholder data.

**The SSH password.** On the TSW-1060, `config/scripts/crestron_panel.json` holds the
panel's console password in plain text, because Home Assistant has to log in to it. It
is not under `www/`, so it is not served. Set it to mode 600, and remember it is in your
Home Assistant backups.
