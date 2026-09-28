# Crestron launcher project

The CH5 user project the TSW-1060 boots into. It has one job: POST a webhook to
Home Assistant, which answers by opening the panel's real browser on the kiosk
page over SSH (`automations.example.yaml`, `shell_command.crestron_browser_open`).
It keeps asking until the browser is on top, and asks again whenever the
browser closes.

Before building, edit `HA_URL` near the top of the script in `index.html`: it
must be the plain `http://` LAN address of your Home Assistant, with the port.

## Build

From this folder, with Node installed:

```sh
npx --yes @crestron/ch5-utilities-cli archive -p crestron-panel-launcher -d . -o ../archive
```

`-d` is the folder holding `index.html` and `appui/manifest`. The output is
`../archive/crestron-panel-launcher.ch5z`. It carries your Home Assistant
address, so it is ignored by git and should stay out of any public copy.

## Load

1. Upload the `.ch5z` to the panel's `/display` folder over SFTP, logged in
   with the panel's console user.
2. On the panel console (SSH, or `tools/console.exp`), run `PROJECTLOAD`.
3. The panel restarts its UI into the launcher, which fires the webhook.

If nothing happens, check that the automation is on and that the panel can
reach `HA_URL` (the launcher prints "Home Assistant not reachable" when it
cannot).
