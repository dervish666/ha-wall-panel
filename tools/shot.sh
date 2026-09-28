#!/bin/zsh
# Take a panel screenshot, fetch it, convert to a small JPG for review.
# Usage: PANEL_HOST=... PANEL_USER=... PANEL_PASS=... ./shot.sh name
#   -> shots/name.jpg (960px wide)
# macOS: uses sips for the conversion. Needs expect.
set -e
: ${PANEL_HOST:?set PANEL_HOST} ${PANEL_USER:?set PANEL_USER} ${PANEL_PASS:?set PANEL_PASS}
[[ -n "$1" ]] || { echo "usage: shot.sh name" >&2; exit 2; }
D=${0:A:h}
mkdir -p $D/shots
expect $D/console.exp "screenshot" 2>&1 | tr -d '\r' | grep -viE "^spawn|password|TSW-1060>|^\s*$" | head -3
sleep 2
expect - <<EXP >/dev/null 2>&1
set timeout 60
spawn sftp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null $PANEL_USER@$PANEL_HOST
expect -re "assword:"
send "\$env(PANEL_PASS)\r"
expect "sftp>"
send "get /logs/ScreenShot.bmp $D/shots/$1.bmp\r"
expect "sftp>"
send "quit\r"
expect eof
EXP
expect $D/console.exp "delete /logs/ScreenShot.bmp" >/dev/null 2>&1
sips -s format jpeg -s formatOptions 85 --resampleWidth 960 $D/shots/$1.bmp --out $D/shots/$1.jpg >/dev/null 2>&1
rm -f $D/shots/$1.bmp
ls -la $D/shots/$1.jpg
