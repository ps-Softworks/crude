#!/bin/zsh
# Rechenknecht für lange Läufe (0.4.20+10): startet einen Befehl auf dem Windows-PC („Host pc“ in ~/.ssh/config)
# als geplante Aufgabe – nur die überlebt das Ende der SSH-Sitzung (getestet: Start-Process und Start-Job sterben mit).
# Jeder Lauf bekommt auf dem PC einen eigenen Arbeitsordner (git worktree, node_modules als Verknüpfung aufs Projekt),
# so stören sich gleichzeitige Läufe nicht. Stand: origin/main (erst pushen) – oder PC_REF=<zweig>: dann geht dieser
# Zweig als Git-Paket (bundle, nur die Commits über origin/main) per scp auf den PC, ganz ohne GitHub.
#   tools/pc.sh start <name> '<befehl>'   z. B. tools/pc.sh start kampagne 'npm run kampagne'
#   PC_REF=mein-zweig tools/pc.sh start <name> '<befehl>'
#   tools/pc.sh status <name>             läuft er noch? letzte Zeilen der Logdatei
#   tools/pc.sh log <name>                ganze Logdatei
#   tools/pc.sh hol <name> <datei>        Datei aus dem Arbeitsordner des Laufs holen (z. B. docs/botlaeufe.md)
# Auf dem PC: %USERPROFILE%\CRUDE-laeufe\<name>.log, <name>.fertig (Exit-Code), Arbeitsordner <name>-wt.
# Hat sich package.json geändert, vorher im Projekt auf dem PC npm install laufen lassen (node_modules wird geteilt).
set -e
cmd=$1; name=$2
case $cmd in
  start)
    befehl=$3
    ziel=origin/main
    bundle=nein
    if [ -n "$PC_REF" ]; then
      git fetch -q origin
      git bundle create /tmp/crude-$name.bundle "origin/main..$PC_REF" 2>/dev/null
      ssh pc "New-Item -ItemType Directory -Force \$env:USERPROFILE\\CRUDE-laeufe | Out-Null" >/dev/null
      scp -q /tmp/crude-$name.bundle "pc:CRUDE-laeufe/$name.bundle"
      rm -f /tmp/crude-$name.bundle
      bundle=ja
    fi
    # Der Läufer: Stand holen, eigener Arbeitsordner, Befehl ausführen, Ausgabe ins Log, am Ende Exit-Code in .fertig.
    ssh pc "New-Item -ItemType Directory -Force \$env:USERPROFILE\\CRUDE-laeufe | Out-Null;
      Remove-Item \$env:USERPROFILE\\CRUDE-laeufe\\$name.log, \$env:USERPROFILE\\CRUDE-laeufe\\$name.fertig -ErrorAction SilentlyContinue;
      Set-Content \$env:USERPROFILE\\CRUDE-laeufe\\$name.ps1 @'
\$d = \"\$env:USERPROFILE\\CRUDE-laeufe\"
\$log = \"\$d\\$name.log\"
\$wt = \"\$d\\$name-wt\"
Set-Location \$env:USERPROFILE\\CRUDE
git fetch -q origin *>> \$log
if ('$bundle' -eq 'ja') { git fetch -q -f \"\$d\\$name.bundle\" \"${PC_REF}:refs/laeufe/$name\" *>> \$log } else { git update-ref refs/laeufe/$name origin/main }
if (Test-Path \$wt) { cmd /c rmdir \"\$wt\\node_modules\" 2>\$null; git worktree remove --force \$wt *>> \$log }
git worktree prune
git worktree add -f --detach \$wt refs/laeufe/$name *>> \$log
cmd /c mklink /J \"\$wt\\node_modules\" \"\$env:USERPROFILE\\CRUDE\\node_modules\" *>> \$log
Set-Location \$wt
git log --oneline -1 *>> \$log
cmd /c \"$befehl\" *>> \$log
Set-Content \"\$d\\$name.fertig\" \$LASTEXITCODE
'@;
      schtasks /Create /F /TN crude_$name /SC ONCE /ST 23:59 /TR \"powershell -NoProfile -ExecutionPolicy Bypass -File \$env:USERPROFILE\\CRUDE-laeufe\\$name.ps1\" | Out-Null;
      schtasks /Run /TN crude_$name | Out-Null; 'gestartet: $name'"
    ;;
  status)
    ssh pc "\$d = \"\$env:USERPROFILE\\CRUDE-laeufe\"; if (Test-Path \$d\\$name.fertig) { 'fertig, Exit-Code ' + (Get-Content \$d\\$name.fertig) } else { 'laeuft noch' }; if (Test-Path \$d\\$name.log) { Get-Content \$d\\$name.log -Tail 5 }"
    ;;
  log)
    ssh pc "Get-Content \$env:USERPROFILE\\CRUDE-laeufe\\$name.log"
    ;;
  hol)
    datei=$3
    scp -q "pc:CRUDE-laeufe/$name-wt/$datei" "$datei"
    ;;
  *)
    echo "tools/pc.sh start|status|log <name> … | hol <name> <datei>"; exit 1
    ;;
esac
