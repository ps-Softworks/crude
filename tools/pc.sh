#!/bin/zsh
# Rechenknecht für lange Läufe (0.4.20+10): startet einen Befehl auf dem Windows-PC („Host pc“ in ~/.ssh/config)
# als geplante Aufgabe – nur die überlebt das Ende der SSH-Sitzung (getestet: Start-Process und Start-Job sterben mit).
# Vorher holt der PC den Stand von GitHub (origin/main), also erst pushen.
#   tools/pc.sh start <name> '<befehl>'   z. B. tools/pc.sh start kampagne 'npm run kampagne'
#   tools/pc.sh status <name>             läuft er noch? letzte Zeilen der Logdatei
#   tools/pc.sh log <name>                ganze Logdatei
#   tools/pc.sh hol <datei>               Datei aus dem Projekt auf dem PC holen (z. B. docs/botlaeufe.md)
# Logs liegen auf dem PC unter %USERPROFILE%\CRUDE-laeufe\<name>.log, fertig = <name>.fertig (mit Exit-Code).
set -e
cmd=$1; name=$2
case $cmd in
  start)
    befehl=$3
    # Der Läufer: Stand holen, Befehl ausführen, Ausgabe ins Log, am Ende Exit-Code in .fertig.
    ssh pc "New-Item -ItemType Directory -Force \$env:USERPROFILE\\CRUDE-laeufe | Out-Null;
      Remove-Item \$env:USERPROFILE\\CRUDE-laeufe\\$name.* -ErrorAction SilentlyContinue;
      Set-Content \$env:USERPROFILE\\CRUDE-laeufe\\$name.ps1 @'
Set-Location \$env:USERPROFILE\\CRUDE
\$log = \"\$env:USERPROFILE\\CRUDE-laeufe\\$name.log\"
git fetch -q origin *>> \$log; git checkout -q -f main *>> \$log; git reset -q --hard origin/main *>> \$log
git log --oneline -1 *>> \$log
npm install --no-audit --no-fund *>> \$log
cmd /c \"$befehl\" *>> \$log
Set-Content \"\$env:USERPROFILE\\CRUDE-laeufe\\$name.fertig\" \$LASTEXITCODE
'@;
      schtasks /Create /F /TN crude_$name /SC ONCE /ST 23:59 /TR \"powershell -NoProfile -ExecutionPolicy Bypass -File \$env:USERPROFILE\\CRUDE-laeufe\\$name.ps1\" | Out-Null;
      schtasks /Run /TN crude_$name | Out-Null; 'gestartet: $name'"
    ;;
  status)
    ssh pc "\$d = \"\$env:USERPROFILE\\CRUDE-laeufe\"; if (Test-Path \$d\\$name.fertig) { 'fertig, Exit-Code ' + (Get-Content \$d\\$name.fertig) } else { 'läuft noch' }; if (Test-Path \$d\\$name.log) { Get-Content \$d\\$name.log -Tail 5 }"
    ;;
  log)
    ssh pc "Get-Content \$env:USERPROFILE\\CRUDE-laeufe\\$name.log"
    ;;
  hol)
    scp "pc:C:/Users/philipp/CRUDE/$name" "$name"
    ;;
  *)
    echo "tools/pc.sh start|status|log <name> … | hol <datei>"; exit 1
    ;;
esac
