# Phase 4 – Integrations-Branch (`phase4/integration`)

Stand: 2026-10-04 · Version unverändert 0.4.2 (Basis: main mit 4.1 Weltmodell und 4.2 Politik).
Block A (4.3 Gesetze, 4.4 Kreditklima, 4.5 Zeitsprung) läuft auf main und ist **noch nicht** hier drin.

## Stand auf main (0.4.5+1)

Der Integrations-Branch ist in main zusammengeführt (mit 4.3 Gesetze, 4.4 Kreditklima, 4.5 Zeitsprung),
dazu „Frühes Öl“ (`fix/fruehes-oel`) und die Bohrquoten-Messung (`fix/bohr-bug`, `tools/bohrquote.ts`).
Was beim Zusammenstecken entschieden wurde:

- **Kapitel:** `state.chapter` (Pflichtfeld aus 4.5) und `chapterStart`; alle lesen das Kapitel über
  `chapterOf` (jetzt eigene Datei `src/sim/chapterOf.ts`, von stocks.ts weitergereicht). Runden zählen über
  Kapitel weiter (Kapitel 2 beginnt bei Runde ≈ 41); `minRound`/`maxRound` zählen ab Kapitelbeginn.
- **Eine Kapitel-Regel für Ereignisse** (`chapterMet`): Ohne `minChapter` nur Kapitel 1 (bzw. bis `maxChapter`).
  Die sicheren Kapitel-1-Ereignisse (thomas_geburt, Silas, Moss, Wegerecht, Rivalen) tragen zusätzlich ausdrücklich
  `maxChapter: 1` (Test). Der Familienabend mit den Kindern aus 4.5 (`termin_familie_k2`) gilt nur in Kapitel 2.
  Thomas' Alter (`minThomasAge`/`maxThomasAge`, 4.5) und die Integrations-Bedingungen stehen nebeneinander.
- **Kapitelstart:** `runTimeskip` setzt Kapitel 2, nimmt die Merkzeichen mit (`marksIntoNextChapter(events,
  chapterStart − 1)` – sie gelten als vor Kapitelbeginn gesetzt, `delay` zählt ab Runde 1 des Kapitels) und ruft
  `openChapterSystems` auf: Raffinerie, Fernleitungen, Aktienbuch (Räte aus content/stocks.yaml, die Oberfläche gibt
  sie über `texts.stocksBoard` mit), Personal, Diplomatie, Ermittler und Forschung sind ab der ersten Runde da.
- **Okara:** Die Kapitel-2-Texte fragen die Merkzeichen aus 4.5 ab (`okara_bullard`, `okara_pachten`) statt
  des Entwurfsnamens `zs1_okara`; `k2_okara_sauer` kommt nur, wenn Bullard die Okara-Pachten hat.
- **Weltmodell:** Die Kampagne der eigenen Zeitung (4.16) ist ein einmaliger Stoß (`moodKick`), seit 4.2 ist
  `moodShift` ein dauerhafter Eingriff. `advanceWorld` bekommt den Gesetzeskatalog und die drei Eingänge (Börse,
  Lobby, Konsortium).
- **Gesetze → Diplomatie:** `antitrustInForce` (4.10) erkennt das beschlossene Kartellgesetz aus 4.3
  (`worldModel.laws`, id `antitrust`).
- **Spielstand Format 19** (Felder der Kapitel-2/3-Systeme, alle freiwillig); Format 18 lädt weiter.
- Screenshots des Zeitsprungs heißen jetzt `31-…34-*` (16–30 sind die der Integration).

Noch offen aus „Zusammenführung mit main“: 4.14 `brandAntitrust` → `breakupFrom`, 4.16 Lobby auf die Gesetz-ids und
Lobby-Aktionen von main (`LAWS_CONNECTED` bleibt `false`), 4.7 Transportpflicht (`commonCarrier` gibt es nicht),
4.15 `crashWorld` auf eine gemeinsame Crash-Funktion in world.ts (heute Nachbau ohne Bankpanik), Maklerkredite
und Anleihen im Rating. Kapitelziele/Enden für Kapitel 3 und der Zeitsprung II fehlen weiter.

**Seit 0.4.12 (4.12, docs/phase4/4.12.md):** Kapitel 2 ist spielbar – Kapitelprüfung, frühe Enden (abgesetzt,
geschluckt, hinter Gittern), Bögen `nora_k2`/`silas_k2`/`ruth_k2`/`crane_k2`, Ruf und die Systemwirkungen der
Kapitel-2-Ereignisse (offene Fragen 1 und 2 unten und die TODO-Effekte von Kapitel 2 sind damit erledigt; die
TODO-Effekte von Kapitel 3 stehen weiter als Kommentar).

**Seit 0.4.19 (4.19, docs/phase4/4.19.md):** Zeitsprung II (Jahr 15–20, Weichen Krieg/Marine/Grady/College) und
Kapitel 3 „Der Konzernherr“ sind spielbar – Kapitelprüfung (Marke in 3 Regionen oder 10 % Marktanteil, Rating C),
Rivalen K3 (src/sim/rivalsK3.ts, Andockpunkt in `endRound` nach `advanceKapitel3`), Bögen `daniel_k3`/`thomas_k3`/
`ruth_k3`/`vale_k3`, alle TODO-Effekte der Kapitel-3-Ereignisse als Systemwirkungen. Danach endet der Early-Access-Umfang.

**Seit 0.4.20 (4.20, docs/phase4/4.20.md):** Kampagnen-Bots spielen 1.000 Welten über Kapitel 1–3 (`npm run kampagne`,
Tabelle Ist/Ziel in docs/botlaeufe.md, Abschnitt „Kapitel 2 und 3“). Justiert: Nachbarbezirke für alle Haltungen,
Börsenfieber, Kreditkündigung in Krisen auch im Kapitel (GDD §8), Depot im Imperiumswert, Familiennamen für Bitterwasser.

## Kurz

Alle 15 Branches sind zusammengeführt: 4.6 Raffinerie, 4.7 Fernleitungen, 4.8 Aktien, 4.9 Personal,
4.10 Diplomatie, 4.11 Ermittler und Forschung, 4.14 Marke, 4.15 Börse, 4.16 Nebeninvestments und Lobby,
4.17 Seismik und Konsortium sowie die Inhalte (Story-Bibel, Kapitel-2- und Kapitel-3-Story, Kapitel-2- und
Kapitel-3-Alltag). Kapitel 1 spielt sich unverändert: Die Bot-Zahlen sind auf die Nachkommastelle dieselben
wie vor der Integration (nur die Zahl der geladenen Ereignisse in `docs/botlaeufe.md` ist von 122 auf 383 gestiegen).

### Prüfung

| Prüfung | Ergebnis |
|---|---|
| `npm test` | 81 Dateien, 1664 Tests grün |
| `npm run typecheck` / `npm run build` | sauber (nur der bekannte Hinweis zur Bundle-Größe) |
| `npm run check:content` | 383 Ereignisse in 44 Dateien in Ordnung, 69 Entwürfe, alle 1021 Antworten spürbar |
| `npm run check:events` | 830 stark, 185 Gegenstück, 6 feste Termine, 0 schwach |
| `npm run bots` (Kapitel 1) | alle 15 Zielwerte im Rahmen; Siegquote max. 35,7 %, Pleite Standard-Bot 0,5 %, Kapitelziel 44,1 % |
| `npm run welt` | läuft, `docs/weltmodell.md` unverändert |
| `npm run screenshots` | 79 Prüfungen ok, 30 Bilder in `docs/screenshots/` (16–30 neu, siehe unten) |
| Rauchtest Kapitel 2/3 | je 40 Partien × 16 Runden mit allen Systemen (Bot „ausgewogen“): kein Absturz, Kasse immer eine Zahl, jeder Stand lädt wieder |

### Bei der Abschlussprüfung behoben

- **Abgeschnittene Schilder am Tisch (Kapitel 3):** Die Hallstead-Mappe zeigte „0 Beteiligungen · 0 Gefallen“,
  der Vertrieb vor der Gründung „Ein Brief vom Vertriebschef“ – beides passte in keiner Bildschirmgröße.
  Jetzt kurz: „n Gefallen“ bzw. „n Anteile“ und „noch keine Marke“ (`content/brand.yaml → ui.deskNoBrand`).
- **Marke ohne Debug-Knopf:** Alle neuen Systeme ließen sich vorab freischalten, nur der Vertrieb (4.14) nicht.
  Neu: `previewBrand` (src/sim/brand.ts, Feld `previewChapter` im Markenzustand, mit Test) und der Knopf
  „Marke und Tankstellen freischalten“ im Debug-Reiter.
- **Konkurrenz-Fenster mit Diplomatie:** fünf Reiter brachen im schmalen Fenster in zwei Zeilen um. Mit
  Diplomatie öffnet die Pinnwand jetzt das breite Fenster (SheetHost.tsx).
- **Debug-Reiter „Vorab freischalten“:** Knöpfe gleichmäßig nebeneinander, einheitliche Beschriftung
  („Hallstead öffnen (Kapitel 3 vorziehen)“ statt „Debug: Hallstead jetzt öffnen“).
- **Bedingungen der Kapitel-2-Ereignisse angeschlossen:** Die 22 Ereignisse mit `# TODO-Bedingung` prüfen jetzt
  echte Bedingungen – `minRefineryLevel: 1` (eigene Raffinerie, 4.6), `minPipelines: 1` (laufende kleine
  Pipeline oder Fernleitung, 4.7), `minPublicShare: 1` (Harlan Oil ist Aktiengesellschaft, 4.8). Neu in
  `src/sim/events.ts` (CONDITION_KEYS), mit Test; beschrieben in `content/events/README.md` und
  `docs/ereignis-vorlage.md`. Übrig: Silas' Leitungsangebot (bewusst über den Frachtvertrag, solange es keine
  Leitung gibt) und die Okara-Bedingung (`zs1_okara`, kommt mit dem Zeitsprung).
- **Kapitelstart in einem Aufruf:** `openChapterSystems(state, balance, { stocksBoard })` in
  `src/sim/chapterSystems.ts` legt alle Systeme an, die im Kapitel `state.chapter` dazugehören (mit Test).
  4.5 muss damit nur eine Funktion kennen (siehe „Kapitelstart“).
- **Screenshot-Werkzeug:** prüft jetzt auch den Tisch mit allen Kapitel-2- bzw. Kapitel-2/3-Systemen in fünf
  Größen (Schilder **und** Gegenstände dürfen sich nicht überdecken, nichts außerhalb, kein Seiten-Scroll) und
  öffnet jedes neue Fenster (muss ganz im Bild liegen). Läuft auch in einem Worktree mit verlinktem
  `node_modules` (Schriften wurden sonst nicht ausgeliefert) und auf eigenen Ports
  (`SHOT_PORT`, `SHOT_DEBUG_PORT`), wenn parallel ein zweiter Lauf läuft.

## Was wo andockt

Alle Stellen in gemeinsamen Dateien tragen den Kommentar `// 4.x Andockpunkt`. Die Einzelheiten stehen in
`docs/phase4/<id>.md`; hier der Gesamtüberblick.

### Rundenende (`endRound` in src/sim/game.ts)

Reihenfolge nach der Integration (neu = fett):

1. Post: **Vorzimmer erledigt Briefe (4.9 `delegateMail`)**, dann Standardantworten, Regionen
2. Verkauf an Crane (Kapitel 1), Familie, Termine
3. **Personal (4.9 `settleStaff`)** → **Raffinerie (4.6 `advanceRefinery`)** – nimmt, was nach den Verkäufen im Tank steht
4. Lager, Förderung, Weltmodell und Markt (`advanceWorldInGame`, s. u.), Bohren, Pachten, Bullard
5. **Marke (4.14 `settleBrand`)** → Logistik → Türme → **Aktien und Anleihen (4.8 `settleStocks`)** → Zinsen
6. **Börse (4.15 `settleExchange`)** → **Kapitel 3 (4.17 `advanceKapitel3`)**
7. Transport → **Fernleitungen (4.7)** → **Diplomatie (4.10; Verkauf an Pruett beendet die Partie)**
8. **Ermittler (4.11)** → **Forschung (4.11)** → **Hallstead (4.16)** → Pleiteprüfung → Kapitelende

Jedes System gibt ohne eigenen Zustand dasselbe Objekt zurück und zieht keinen Zufall – deshalb sind die
Kapitel-1-Bot-Läufe unverändert. `endRound` hat einen vierten Parameter `texts: { kapitel3 }` (Kladde-Zeilen
aus 4.17); Tools und Bots rufen ohne ihn.

### Weltmodell

| Richtung | Was | Wo |
|---|---|---|
| Welt → System | Kapitel lesen alle über **einen** Helfer `chapterOf` (src/sim/stocks.ts, liest `state.chapter`, sonst 1) | 4.8, 4.9, 4.11, 4.14–4.17, Ereignisse |
| Welt → System | `state.worldModel` (mood, credit, crash, tech, tension, government, demand) | 4.6 `refineryWorld`, 4.7 `pipelineWorldOf`, 4.8 `stocksWorldOf`, 4.9 `staffWorld`, 4.10 `diplomacyWorld`, 4.11 `worldPort`, 4.14 `brandWorldFrom`, 4.15 `readClimate`, 4.16 `worldView`, 4.17 `worldOf` |
| System → Welt | Kauf auf Kredit heizt das Kreditklima | 4.15 `exchangeWorldInput` in `advanceWorldInGame` |
| System → Welt | Kampagne der eigenen Zeitung hebt die Stimmung | 4.16 `hallsteadWorldInput` |
| System → Welt | Macht des Konsortiums (Spannung, Kredit, Stimmung) | 4.17 `konsortiumWorldInput` |
| System → Welt | Börsencrash löst Weltcrash aus | 4.15 `crashWorld` (Nachbau der Crash-Logik aus world.ts!) |
| vorbereitet, nicht eingespeist | Kartelle drücken die Stimmung | 4.10 `diplomacyMoodShift` |

### Gemeinsame Rechnungen

- **Imperiumswert** (`empire.ts`): + Raffinerie (4.6), + Fernleitungen (4.7), − Anleihen (4.8), + Marke (4.14),
  + Hallstead-Beteiligungen (4.16), + Kapitel-3-Projekte (4.17). Börsendepot (4.15 `exchangeEquity`) zählt **noch nicht**.
- **Bankzins** (`credit.ts`): `bankRate(state, balance, secured)` = Rating + Pfand + Kreditklima (4.1) − eigene Bank
  in Hallstead (4.16 `bankRateDiscount`) − Stand-Rabatt (4.17). `takeLoan` und Kassenbuch nutzen dieselbe Funktion.
- **Sabotage**: Der Fixer (4.9 `fixerDefense`) schützt kleine Pipeline und Fernleitungen (4.7).
- **Schattenbuch**: Absprachen aus 4.10 (`diplomacy.traces`) zählen als Spuren der Art `absprache` (4.11).
- **Forschung → Seismik**: 4.17 `techStage` nimmt die höchste eigene Technik (`techTier`, 4.11).
- **Raffinerie-Zufuhr** nutzt dieselben Wege wie der Verkauf, also auch Fernleitungen.

### Spielstand

`SAVE_FORMAT` bleibt 15 (aus 4.2). Alle neuen Felder sind freiwillig und werden nur geprüft, wenn sie da sind:
`refinery`, `bigPipelines`, `stocks`, `staff`, `diplomacy`, `investigation`, `research`, `brand`, `exchange`,
`hallstead`, `kapitel3`. Kapitel-1-Stände laden unverändert.

### Oberfläche

- **Fenster** (`SHEET_IDS` in sceneState.ts): `raffinerie`, `personal`, `schattenbuch`, `werkstatt`, `marke`,
  `boerse`, `hallstead`, `konzern`. Ohne eigenes Fenster: Fernleitung (Reiter in der Fracht), Aktien/Aufsichtsrat/
  Anleihen (Reiter im Kassenbuch), Diplomatie (Reiter an der Pinnwand „Konkurrenz“), Börsenseite (Zeitung).
- **Tastenkürzel**: keine neuen – die Tastatur kennt das Kapitel noch nicht. Vorschläge der Branches: R (Raffinerie), O (Börse).
- **Debug**: Menü → Debug → „Vorab freischalten (spätere Kapitel)“ – ein Knopf je System.
- **Platzplan am Tisch** (DeskScene.tsx, Prozent der Bühne):

| Platz | Kapitel 2 | Kapitel 3 zusätzlich |
|---|---|---|
| Wand zwischen Lampe und Kalender | Werkstatt (Blaupause) | – |
| rechts neben dem Kassenbuch | Personal (volle Höhe) | Personal und Vertrieb übereinander (`RECHTE_SPALTE_GETEILT`) |
| unter dem Kassenbuch | Raffinerie (volle Höhe) | Raffinerie und Börsenticker übereinander (`UNTER_KASSENBUCH_GETEILT`) |
| untere Reihe zwischen Kladde und Raffinerie | Schublade (Schattenbuch) | Schublade, Hallstead-Mappe, Siegelmappe zu dritt (`untereReihe`) |
| Pinnwand „Konkurrenz“ | Zettel der Diplomatie | – |

  Kapitel 2 sieht aufgeräumt aus (`docs/screenshots/16-tisch-kapitel2.png`). In Kapitel 3 überdeckt sich nichts,
  aber die geteilten Gegenstände werden klein (`17-tisch-kapitel3.png`) – siehe offene Fragen.

### Screenshots (neu)

`16-tisch-kapitel2`, `17-tisch-kapitel3`, `18-raffinerie`, `19-fernleitung`, `20-aktien` (Aufsichtsrat),
`21-personal`, `22-diplomatie`, `23-schattenbuch`, `24-werkstatt`, `25-marke`, `26-boerse`, `27-hallstead`,
`28-konzern`, `29-zeitung-kapitel3` (mit Börsenseite), `30-debug-freischalten`. Die Spielstände entstehen wie die
Debug-Knöpfe: Runde 6 eines Bot-Spiels, alle Systeme freigeschaltet, zwei Runden weitergespielt.

## Kapitelstart: was 4.5 aufrufen muss

**Empfehlung:** Nach dem Zeitsprung `chapter`, `round` und `startYear` setzen, dann
`openChapterSystems(state, balance, { stocksBoard: stocksContent.board })` aufrufen (src/sim/chapterSystems.ts)
und die Merkzeichen mit `marksIntoNextChapter` (events.ts) ins neue Kapitel nehmen. Ohne den Aufruf fehlen
Raffinerie, Aktien und Diplomatie ganz – sie entstehen **nicht** von selbst.

| System | ab Kapitel | entsteht von selbst? | was `openChapterSystems` tut | zusätzlich für 4.5 |
|---|---|---|---|---|
| 4.6 Raffinerie | 2 | nein | `unlockRefinery` | `startYear` muss stimmen (Preise rechnen mit Bezugsjahr 98) |
| 4.7 Fernleitungen | 2 | ja, beim ersten Rundenende | `unlockBigPipelines` | `railTariff` nach dem Sprung neu setzen (Thorne erholt sich) |
| 4.8 Aktien/Anleihen | 2 | nein | `startStocks` (AG nur mit `state.ipo.share > 0` aus dem Kapitel-1-Ende) | Räte aus `content/stocks.yaml` mitgeben |
| 4.9 Personal | 2 | ja, beim ersten Rundenende | `openStaff` (Bewerbungen schon in Runde 1) | was macht das Personal im Sprung? (`skipStaff` fehlt) |
| 4.10 Diplomatie | 2 | nein | `startDiplomacy` (setzt `k2_diplomatie`) | – |
| 4.11 Ermittler | 2 | ja | `newInvestigation` (alte Spuren verblassen um `jumpFade`) | `since`/`transferredUntil` beim Übergang 2→3 zurücksetzen, falls die Runden neu zählen |
| 4.11 Forschung | 2 | ja | `newResearch` | – |
| 4.14 Marke | 3 | ja (Ausgangslage) | Ausgangslage anlegen | soll `motor` (Automobilisierung) neu beginnen? |
| 4.15 Börse | 3 | ja, beim ersten Rundenende | `openExchange` | – |
| 4.16 Hallstead | 3 | ja, bei der ersten Handlung | – | – |
| 4.17 Kapitel 3 | 3 | ja | `ensureKapitel3` | Soll `kapitel3` beim nächsten Sprung bleiben oder gelöscht werden? |

**Weltmodell im Zeitsprung:** 4.11 (Technik-Schwellen: Drehbohren 10, Tanklaster 15, Rollenmeißel 17, Cracken 20)
und 4.17 (`techStages` [0, 15, 28, 55, 85]) sind auf ein Weltmodell eingemessen, das im Sprung **rundengenau
weiterläuft** (Kapitel 2 beginnt bei Runde ≈ 41, Kapitel 3 bei ≈ 81). Schreibt 4.5 das Weltmodell anders fort,
müssen diese Schwellen neu eingemessen werden.

## Zusammenführung mit main (4.3/4.4/4.5)

Main ist inzwischen bei 0.4.4. Beim nächsten Merge von main in diesen Branch berühren sich:

- **Gesetze (4.3):** Auf main liegen sie unter `state.worldModel.laws` (Katalog `content/laws/`, Regeln über
  `lawRules`: `incomeTax`, `cartelBan`, `breakupFrom`; Lobby-Aktionen `demand/block/weaken/delay` vorbereitet).
  Anzupassen: 4.10 `antitrustInForce` (liest heute `state.laws` oder Merkzeichen `gesetz_kartell` → `cartelBan`),
  4.7 `laws.commonCarrier` (eine Transportpflicht gibt es auf main noch nicht), 4.14 `brandAntitrust` (→ `breakupFrom`),
  4.16 `lobbyLawShift`/`lobbyWaterDown` und der Ersatzkatalog in `content/hallstead.yaml → laws` auf die
  Lobby-Aktionen und Gesetz-ids von main umstellen, dann `LAWS_CONNECTED` in lobby.ts auf `true`.
- **Kreditklima (4.4):** 4.15 `crashWorld` baut die alte Crash-Logik aus world.ts nach – auf main gibt es jetzt
  Bankpanik und großen Crash. Besser eine exportierte `startCrash` in world.ts, die beide nutzen. 4.8: Anleihen zählen
  nicht ins Rating (bewusst); 4.15: Maklerkredite zählen nicht zu den Schulden – mit 4.4 entscheiden.
  `advanceWorld` hat auf main einen vierten Parameter (Gesetzeskatalog); `advanceWorldInGame` hier hängt drei
  Eingänge (Börse, Lobby, Konsortium) an – beim Merge beide Seiten behalten.
- **Zeitsprung (4.5):** siehe Kapitelstart. Feldname `state.chapter` ist hier schon im Zustand (optional) und wird
  von allen über `chapterOf` gelesen – heißt es in 4.5 anders, nur `chapterOf` ändern.

## Offene Fragen für den Kapitel-2/3-Ausbau

**Kapitelziele und Enden**
1. `chapterCheck` kennt nur Kapitel 1, und `endRound` schreibt am Ende immer „Kapitel 1 ist zu Ende“. Bereit liegen:
   Kapitel 2 – `ownsRefinery` (4.6) oder `ownsHarborPipeline` (4.7), Kontrolle ≥ 50 % über `control` (4.8);
   Kapitel 3 – `brandGoal` (4.14: ≥ 3 Regionen oder ≥ 10 %), dazu „mindestens Rating C“ (GDD §13).
2. Neue Enden fehlen: „abgesetzt“ (4.8 `stocks.ousted`), Haft/Zwangsverkauf (4.11), und „verkauft an Pruett“ (4.10)
   zeigt noch die Texte der Crane-Übernahme aus Kapitel 1.

**Kopplungen zwischen den Systemen (alle noch offen)**
3. ~~Raffinerie ↔ Forschung~~ erledigt (0.4.20+9): Alle Techniken wirken ab Kapitel 2. Cracken hebt den
   Benzin-Höchstanteil im Mix um 20 Punkte (20 % → 40 %, `refineryMixBounds`), Tanklaster geben jedem eigenen
   Gespann +50 % Kapazität (`teamCapacity`, auch im Wegevergleich), Bohrtiefe macht jede Stufe so sicher wie
   eine um 150 m (je Technik) flachere (`techStage`: Unfall/Klemmen, Kosten und Ölanteil bleiben). Zahlen sind
   Platzhalter in `research.techs`.
4. Raffinerie ↔ Marke: `ownGasoline` in 4.14 ist `null` (Benzin reicht immer). Soll die eigene Raffinerie die
   Tankstellen beliefern statt den Großhandel?
5. Börse ↔ Aktien: Der eigene Kurs (4.8) fällt im Börsencrash (4.15) nur indirekt mit; Harlan Oil steht nicht
   auf der Kurstafel. Hallstead-Bahn-/Autoaktien (4.16) sind eigene Beteiligungen ohne Kurs.
6. Personal ↔ Ermittler/Lobby: `staffHeat` (4.9) wirkt nicht auf Delaney; der Lobbyist (4.16) ist keine
   Personal-Rolle; Kronzeuge gegen Crane (4.11) macht Crane in 4.10 nicht zum Feind.
7. Gefallen (4.16 `spendFavors`) werden für Genehmigungen und Ermittlungen (4.11) noch nicht verlangt;
   politischer Druck kostet dort Geld. Einfluss für Enteignung (4.7) ist ein Entwurfsname (`politics.influence`).
8. Diplomatie → Welt: `diplomacyMoodShift` vorbereitet, nicht eingespeist. Bullards Gebietsabsprache wirkt nur
   über billigere Pachten, nicht in seiner Pacht-KI.
9. Zeitung: keine Schlagzeilen zu Fernleitung, Ermittlung, Preiskampf der Marke; die Börsenseite hängt in der
   Oberfläche (NewspaperPanel), nicht in `makeNewspaper`.
10. Imperiumswert ohne Börsendepot (4.15); Konsortium-Rauswurf (4.17) als feste Summe statt über den Weltpreis.

**Balance und Bots**
11. Alle Zahlen der Blöcke `refinery`, `bigPipelines`, `stocks`, `staff`, `diplomacy`, `investigation`, `research`,
   `brand`, `exchange`, `hallstead`, `kapitel3` in balance.yaml sind Platzhalter. Die Bots kennen keines der neuen
   Systeme; für Kapitel 2/3 braucht es Bot-Strategien und Zielwerte wie für Kapitel 1 (4.6 hat mit
   `tools/raffinerieLaeufe.ts` einen Anfang).
12. Doppelter Crash-Abschlag Marke/Weltmodell (4.14) ist bewusst getrennt – mit echten Kapitel-3-Bots prüfen.

**Tisch in Kapitel 3**
13. Ab Kapitel 3 liegen 21 Gegenstände auf dem Kapitel-1-Tisch; nichts überdeckt sich, aber Personal, Vertrieb,
   Raffinerie und Börsenticker teilen sich je einen Platz und werden klein. Der GDD sieht für Kapitel 3 einen
   neuen Tisch vor (Mahagoni, Radio) – dort die Plätze neu verteilen (z. B. Kurstafel an der Wand statt Ticker,
   eine Ablage für die Hallstead-/Siegelmappe).

**Ereignisse**
14. Die Kapitel-2-System-Ereignisse (`k2-fernleitung`, `k2-personal`, `k2-diplomatie`, `k2-delaney`) tragen
   `minChapter: 1` und hängen an Merkzeichen der Simulation – sie kommen also auch in Kapitel 1, wenn der Debug-Knopf
   das System dort freischaltet. Gewollt für die Vorschau, aber beim Testen beachten.
15. Das Ereignissystem kennt keine Platzhalter (Pruetts Kaufsumme, Kreuzbeteiligung fest 3.000 $) und kein
   „Brief zurückziehen“, wenn die Sache an der Pinnwand schon entschieden ist (4.10).
16. Delaneys Briefe kommen je Partie nur einmal; ein zweiter Fall (Kapitel 4) braucht eigene Ereignisse.

## TODO-Effekte aus den Ereignissen

In den Kapitel-2/3-Ereignissen stehen **425** gewünschte Wirkungen als `# TODO-Effekt: …` neben einer vorläufigen
(187 in Kapitel 2, 238 in Kapitel 3; 21 Dateien). Das Ereignissystem kennt bisher nur die Wirkungen aus Kapitel 1
(`cash`, `oilStock`, `railTariff`, `strength`, `ruth`, `thomas`, `teams`, `teamsIdle`, `price`, `production`,
`leaseCost`) plus öffentliche Taten (`public`, 4.2). Nach Häufigkeit und dem System, das sie tragen könnte:

| Gewünschte Wirkung | Anzahl | Wer kann sie tragen | Stand |
|---|---:|---|---|
| `reputation` (public, workers, politics, industryRespect) | 108 | Ruf-System (GDD §4) | **fehlt** – größter Brocken; 4.14 liest schon `state.reputation.public` |
| `rival: { name: { relation, trust, aggression } }` | 81 | 4.10 Diplomatie (Beziehungen zu Crane/Margaret, Pruett, Bullard, Thorne, Delgado) | System da, Wirkung im Ereignis fehlt |
| `heat`, `trace: { severity, label }`, `investigation`, `evidence` | 59 / 32 / 24 / 1 | 4.11 Schattenbuch und Delaney | System da (`traces`, Spuren-Arten), Wirkung fehlt |
| `boardLoyalty`, `boardMember`, `boardBoycott`, `control`, `shares`, `sharePrice`, `rivalStake`, `dividendPressure` | 44 / 10 / 1 / 36 / 16 / 11 / 17 / 2 | 4.8 Aktien und Aufsichtsrat | System da, Wirkung fehlt |
| `brand`, `stations`, `pumpPrice` | 23 / 3 / 2 | 4.14 Marke (`applyBrandScandal` liegt bereit) | System da, Wirkung fehlt |
| `standing`, `consortium`, `consortiumPower`, `consortiumDebt` | 23 / 7 / 2 / 1 | 4.17 Stand und Konsortium | System da, Wirkung fehlt |
| `favors`, `influence`, `lawPressure`, `party` | 15 / 8 / 8 / 15 | 4.16 Lobby (`spendFavors`), 4.3 Gesetze, 4.2 Parteien (`party` passt evtl. auf `public`-Taten) | teils da |
| `staffLoyalty`, `hire`, `fire`, `staff` | 17 / 7 / 4 / 4 | 4.9 Personal | System da, Wirkung fehlt |
| `investment`, `crash` | 7 / 1 | 4.16 Beteiligungen, 4.15 Börse | System da, Wirkung fehlt |
| `credit`, `rating`, `creditLine` | 9 / 5 / 1 | Kredit (credit.ts) und 4.4 Kreditklima | teils da |
| `research` | 8 | 4.11 Forschung | System da, Wirkung fehlt |
| `refineryDown`, `refineryOutput`, `productPrice`, `productYield`, `margin` | 4 / 1 / 3 / 2 / 4 | 4.6 Raffinerie (`repairLeft` gibt es schon für Brände) | System da, Wirkung fehlt |
| `pipelineDown`, `pipelineThroughput`, `transportFee`, `rightOfWay` | 3 / 2 / 8 / 1 | 4.7 Fernleitungen (`damaged`, Wegerechte) | System da, Wirkung fehlt |
| `clara`, `heirValues`, `legacy`, Ruths Anteile | 21 / 10 / 7 | Familie/Erben (Clara, Thomas' Werte – Kapitel 4+) | **fehlt** |
| `mood`, `tension` | 3 / 2 | Weltmodell (`WorldInput.moodShift`/`tensionShift`) | Weg da, Wirkung fehlt |
| `appointmentsNext`, `union`, `contract`, `leases` | 3 / 1 / 1 / 1 | Termine, Gewerkschaft, Verträge, Pachten | einzeln klären |
| nur Text (z. B. „Söhne erben den Groll“) | 12 | – | als Merkzeichen lösen |

**Vorschlag für den Ausbau:** eine allgemeine Ereignis-Wirkung je System statt 50 Einzelschlüssel – z. B.
`rival`, `trace`, `board`, `brand`, `standing`, `staff`, `favors` als verschachtelte Wirkungen, die `events.ts`
an die vorhandenen Funktionen der Systeme weiterreicht (wie heute schon `public` an `recordAct`). Zuerst die
Wirkungen, deren System schon da ist (rund drei Viertel), danach Ruf und Familie/Erben. `check:events` misst die
Spürbarkeit heute nur in Geld – mit den neuen Wirkungen braucht es eine Schwelle je System.

## Dateien dieses Abschlusses

- neu: `src/sim/chapterSystems.ts` (+ Test), `docs/phase4/integration.md`, `docs/screenshots/16-…30-*.png`
- geändert: `src/sim/events.ts` (+ Test), `src/sim/brand.ts` (+ Test), `src/sim/brandContent.ts`,
  `src/ui/sheets/MenuSheet.tsx`, `src/ui/sheets/SheetHost.tsx`, `src/ui/sheets/BrandSheet.tsx`,
  `src/ui/sheets/HallsteadSheet.tsx`, `src/ui/style.css`, `tools/screenshots.ts`, `content/brand.yaml`,
  `content/hallstead.yaml`, drei `content/events/k2-alltag-*.yaml`, `content/events/README.md`,
  `docs/ereignis-vorlage.md`, `docs/botlaeufe.md` (nur die Zahl der Ereignisse)
