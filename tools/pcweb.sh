#!/bin/zsh
# Spiel-Fassung als Webseite auf dem Windows-PC (0.4.20+32): baut den Tester-Build aus einem Commit
# (Standard: main), lädt ihn auf den PC nach %USERPROFILE%\CRUDE-web\<version> und startet dort einen kleinen
# Webserver (tools/pcweb-server.mjs, Port 8080) als geplante Aufgabe „crude_web“ – die überlebt das Ende der
# SSH-Sitzung und startet bei der Anmeldung neu. Er läuft auf den Kernen 0–1 (die Läufe des bot runner nutzen 2–19). Die Seite aktualisiert sich NICHT von selbst: Eine neue
# Fassung kommt nur, wenn dieses Skript wieder läuft. Ältere Fassungen bleiben auf dem PC liegen.
#   tools/pcweb.sh            aktueller Stand von main
#   tools/pcweb.sh <commit>   ein bestimmter Stand
#   tools/pcweb.sh stop       Webserver anhalten
#   tools/pcweb.sh tunnel     Tunnel vom Mac zum PC öffnen (läuft im Hintergrund) → http://localhost:8080
# Im Heimnetz direkt http://192.168.178.85:8080 – nur, wenn die Windows-Firewall Port 8080 durchlässt (Stand 06.10.2026: blockt).
set -e
port=${PCWEB_PORT:-8080}
haupt=$(cd "$(git rev-parse --path-format=absolute --git-common-dir)/.." && pwd)

if [ "$1" = stop ]; then
  ssh pc "schtasks /End /TN crude_web 2>\$null | Out-Null; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*CRUDE-web*server.mjs*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }; 'angehalten'"
  exit 0
fi

if [ "$1" = tunnel ]; then
  pkill -f "L $port:127.0.0.1:$port pc" 2>/dev/null || true
  ssh -f -N -o ExitOnForwardFailure=yes -L "$port:127.0.0.1:$port" pc
  echo "Tunnel offen: http://localhost:$port  (schließen: pkill -f 'L $port:127.0.0.1:$port pc')"
  exit 0
fi

ref=${1:-main}
tmp=$(mktemp -d)
wt=$tmp/crude-web
git -C "$haupt" worktree add -q --detach "$wt" "$ref"
trap 'git -C "$haupt" worktree remove --force "$wt" >/dev/null 2>&1; rm -rf "$tmp"' EXIT
ln -s "$haupt/node_modules" "$wt/node_modules"
(cd "$wt" && node tools/release.mjs >/dev/null)
ver=$(node -p "require('$wt/package.json').version")
stand=$(git -C "$wt" log --oneline -1)

ssh pc "New-Item -ItemType Directory -Force \$env:USERPROFILE\\CRUDE-web | Out-Null"
scp -q "$wt/release/crude-$ver.zip" "pc:CRUDE-web/crude-$ver.zip"
scp -q "${0:A:h}/pcweb-server.mjs" "pc:CRUDE-web/server.mjs"
ssh pc "\$d = \"\$env:USERPROFILE\\CRUDE-web\";
  Expand-Archive -Force \"\$d\\crude-$ver.zip\" \"\$d\\$ver\";
  Set-Content \"\$d\\stand.txt\" '$ver · $stand';
  Set-Content \"\$d\\server.ps1\" \"(Get-Process -Id \`\$PID).ProcessorAffinity = 3; Set-Location '\$d'; node server.mjs '\$d\\$ver' $port *> '\$d\\server.log'\";
  schtasks /End /TN crude_web 2>\$null | Out-Null;
  Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*CRUDE-web*server.mjs*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force };
  schtasks /Create /F /TN crude_web /SC ONLOGON /TR \"powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \$d\\server.ps1\" 2>\$null | Out-Null;
  if (\$LASTEXITCODE -ne 0) { schtasks /Create /F /TN crude_web /SC ONCE /ST 23:59 /TR \"powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \$d\\server.ps1\" | Out-Null; 'Hinweis: startet nach einem Neustart nicht von selbst (keine Rechte für ONLOGON)' };
  schtasks /Run /TN crude_web | Out-Null"
sleep 3
if curl -s -m 5 "http://192.168.178.85:$port/" | grep -q "<html"; then
  echo "läuft: http://192.168.178.85:$port  ($ver · $stand)"
else
  echo "Server gestartet ($ver · $stand). Im Heimnetz blockt die Firewall – öffnen mit: tools/pcweb.sh tunnel → http://localhost:$port"
fi
