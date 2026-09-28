#!/usr/bin/env python3
"""Run one console command on the Crestron TSW-1060 over SSH and print its reply.

Used by shell_command.crestron_browser_open, which the panel's own user project
triggers through a webhook every time it boots or regains the screen, and by
shell_command.crestron_brightness, which the page calls to dim the backlight.
Usage: python3 crestron_cmd.py BROWSEROPEN http://HOME_ASSISTANT_IP:8123/local/kiosk.html

The panel's address and console login live in crestron_panel.json next to this
file (copy crestron_panel.example.json), never in here. PANEL_HOST, PANEL_USER
and PANEL_PASS in the environment override the file.
"""
import json
import os
import sys

import paramiko

CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crestron_panel.json")


def settings():
    conf = {}
    if os.path.exists(CONFIG):
        with open(CONFIG) as f:
            conf = json.load(f)
    host = os.environ.get("PANEL_HOST") or conf.get("host")
    user = os.environ.get("PANEL_USER") or conf.get("user")
    password = os.environ.get("PANEL_PASS") or conf.get("password")
    missing = [n for n, v in (("host", host), ("user", user), ("password", password)) if not v]
    if missing:
        raise RuntimeError("no panel %s: fill in %s or set PANEL_HOST/PANEL_USER/PANEL_PASS"
                           % ("/".join(missing), CONFIG))
    return host, user, password


cmd = " ".join(sys.argv[1:]).strip() or "VER"
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    host, user, password = settings()
    client.connect(host, username=user, password=password, timeout=10,
                   look_for_keys=False, allow_agent=False)
    _, out, err = client.exec_command(cmd, timeout=20)
    reply = out.read().decode(errors="replace").strip()
    print(reply or "(no reply)")
except Exception as exc:  # surface, never swallow: HA logs shell_command output
    print("crestron_cmd failed: %s" % exc, file=sys.stderr)
    sys.exit(1)
finally:
    client.close()
