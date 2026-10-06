#!/bin/zsh
# Warteschlange für den Rechenknecht (Sitzung „bot runner“, Auftragsweg in CLAUDE.md).
# Es läuft immer genau ein großer Lauf (bis 18 Worker); danach der dringendste Auftrag:
#   1 = blockiert (ohne Ergebnis geht es nicht sinnvoll weiter)
#   2 = bremst (weiter geht es, aber mit geratenen Entscheidungen)
#   3 = Kontrolle (Bestätigung/Doku, die Arbeit läuft ohne weiter)
# Gleiche Stufe: wer zuerst kam. Wer über 2 Stunden wartet, rückt eine Stufe auf.
# Ein Auftrag der Stufe 1 verdrängt einen laufenden Lauf der Stufe 3 (der kommt vorn wieder in die Schlange).
#   tools/pcschlange.sh neu <stufe> <name> <ref> <absender> '<befehl>'
#   tools/pcschlange.sh liste
#   tools/pcschlange.sh weg <name>          Auftrag aus der Schlange nehmen
#   tools/pcschlange.sh laufen              Schleife (im Hintergrund starten); schreibt Ereignisse nach $LOG
# Ereignisse (eine Zeile je Ereignis): START, FERTIG <exit>, VERDRAENGT, FEHLER – für einen Monitor mit tail -f.
set -u
cd "${0:A:h}/.."
DIR=tools/tmp_scratch_ignored/pcschlange
Q=$DIR/schlange.tsv          # stufe \t eingang(epoch) \t name \t ref \t absender \t befehl
AKTIV=$DIR/aktiv.tsv         # derselbe Eintrag für den laufenden Lauf
LOG=$DIR/ereignisse.log
mkdir -p $DIR; touch $Q
ts() { date +%H:%M; }

# Wirksame Stufe mit Aufrücken nach Wartezeit (je 2 h eine Stufe, mindestens 1).
wirksam() { local stufe=$1 eingang=$2; local s=$(( stufe - ($(date +%s) - eingang) / 7200 )); (( s < 1 )) && s=1; echo $s; }

naechster() {
  local best="" bs=9 be=0
  while IFS=$'\t' read -r stufe eingang name ref absender befehl; do
    [ -z "$name" ] && continue
    local w=$(wirksam $stufe $eingang)
    if (( w < bs || (w == bs && eingang < be) )); then best="$name"; bs=$w; be=$eingang; fi
  done < $Q
  echo "$best"
}

starte() {
  local zeile=$(awk -F'\t' -v n="$1" '$3==n' $Q | head -1)
  local stufe eingang name ref absender befehl
  IFS=$'\t' read -r stufe eingang name ref absender befehl <<< "$zeile"
  awk -F'\t' -v n="$name" '$3!=n' $Q > $Q.neu && mv $Q.neu $Q
  local aus
  for versuch in 1 2 3; do
    aus=$(PC_REF=$ref tools/pc.sh start "$name" "$befehl" 2>&1)
    echo "$aus" | grep -q "gestartet:" && break
    sleep 10
  done
  if ! echo "$aus" | grep -q "gestartet:"; then echo "$(ts) FEHLER $name Start ging nicht: $(echo $aus | tail -1) (für $absender)" >> $LOG; rm -f $AKTIV; return; fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$stufe" "$eingang" "$name" "$ref" "$absender" "$befehl" > $AKTIV
  # Lebt der Lauf wirklich? (Fallstrick: Startfehler blieb einmal 14 Minuten unbemerkt.)
  sleep 90
  if ! ssh pc "Test-Path \$env:USERPROFILE\\CRUDE-laeufe\\$name.log" 2>/dev/null | grep -q True; then
    echo "$(ts) FEHLER $name: kein Lauf auf dem PC (für $absender)" >> $LOG; rm -f $AKTIV; return
  fi
  echo "$(ts) START $name (Stufe $stufe, $ref, für $absender)" >> $LOG
}

verdraenge() {
  local stufe eingang name ref absender befehl
  IFS=$'\t' read -r stufe eingang name ref absender befehl < $AKTIV
  ssh pc "schtasks /End /TN crude_$name | Out-Null; Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*$name-wt*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
  # vorn wieder einreihen: Eingangszeit 0 = vor allen gleicher Stufe
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$stufe" 0 "$name" "$ref" "$absender" "$befehl" >> $Q
  rm -f $AKTIV
  echo "$(ts) VERDRAENGT $name (Stufe 1 hat Vorrang)" >> $LOG
}

case ${1:-} in
  neu)
    [ $# -ge 6 ] || { echo "Aufruf: neu <stufe 1-3> <name> <ref> <absender> '<befehl>'"; exit 1; }
    [[ $2 == [123] ]] || { echo "Stufe muss 1, 2 oder 3 sein"; exit 1; }
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$2" "$(date +%s)" "$3" "$4" "$5" "$6" >> $Q
    echo "eingereiht: $3 (Stufe $2)" ;;
  liste)
    [ -s $AKTIV ] && awk -F'\t' '{print "läuft:  " $3 " (Stufe " $1 ", " $4 ", für " $5 ")"}' $AKTIV
    while IFS=$'\t' read -r stufe eingang name ref absender befehl; do
      [ -n "$name" ] && echo "wartet: $name (Stufe $stufe → wirksam $(wirksam $stufe $eingang), $ref, für $absender, seit $(( ($(date +%s) - eingang) / 60 )) min)"
    done < $Q ;;
  weg)
    awk -F'\t' -v n="$2" '$3!=n' $Q > $Q.neu && mv $Q.neu $Q; echo "entfernt: $2" ;;
  laufen)
    echo "$(ts) SCHLANGE läuft" >> $LOG
    while true; do
      if [ -s $AKTIV ]; then
        name=$(cut -f3 $AKTIV); stufe=$(cut -f1 $AKTIV)
        st=$(tools/pc.sh status "$name" 2>/dev/null | head -1)
        if echo "$st" | grep -q "^fertig"; then
          echo "$(ts) FERTIG $name ${st#fertig, } (für $(cut -f5 $AKTIV))" >> $LOG; rm -f $AKTIV
        elif [ "$stufe" = 3 ] && [ -n "$(naechster)" ] && [ "$(awk -F'\t' '$1==1' $Q | wc -l | tr -d ' ')" != 0 ]; then
          verdraenge
        fi
      fi
      if [ ! -s $AKTIV ]; then n=$(naechster); [ -n "$n" ] && starte "$n"; fi
      sleep 30
    done ;;
  *) sed -n 2,16p "$0" ;;
esac
