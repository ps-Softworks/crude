## Stand (wird während der Nacht nachgeführt)
- [x] Teil 1 Netzwerk + Teil 2 Großhändler – 0.4.20+42 (Zweig netzwerk)
- [x] B1 Einstellungen, B2 Geräusche (Agent) – zusammengeführt
- [x] C1 Verlauf/Diagramme, C2 Speicherplätze, C3 Glossar (Agent) – zusammengeführt
- [ ] A1 Verkaufen, A4 Pleite-Frist, A7 Versicherung, B4 Zweiter Anlauf (Agent läuft)
- [x] B3 Feuer in der Nacht (Agent) – 0.4.20+44
- [ ] A2 Investoren, A3 Farm-out, A5 Konsortium, A6 Staat (Agent läuft)
- [ ] C6 Abschluss: auf main zusammenführen, Roadmap, Tester-Build, Bericht

# Plan: Kontakte aufbauen, neue Großhändler, Geldquellen und Rest (Nachtarbeit)

## Context
Philipp hat sich die Roadmap angesehen: Im Spiel fehlt noch einiges.
- **Ab Kapitel 2 gibt es kaum etwas zu tun.** Die Kapitel-1-Stellen (Ölleute, Crane, Händler, Fuhrleute, Sheriff) verschwinden, weil ihre Karten `maxChapter: 1` tragen. Für Rohöl gibt es keine einzige Verhandlungskarte mehr. Kapitel 1 hat dagegen 36 Karten bei 11 Stellen, für Anfänger eher zu viel.
- **Kontakte sind statisch.** Alle Stellen sind von Anfang an da (`contacts` in content/plans.yaml, `contactOf` in src/sim/planContent.ts); es gibt kein Kennenlernen und keine Beziehung.
- **Käufer sind fest im Code**: `type Buyer = 'crane' | 'trader'` (src/sim/balance.ts:253), Händler nur in Port Ellis.
- **Telefon:** Der Code zeigt es ab Kapitel 2 (`DeskScene.tsx:130`, seit 0.4.20+34). Philipp sieht noch den Kalender, vermutlich in einer alten Spielfassung.
- **Schon abgesprochen:** Geldquellen (GDD §8), Einstellungen, Geräusche, Ende „Feuer in der Nacht“, Zweiter Anlauf, Block C.

**Entscheidungen Philipps:**
- Kontakte entstehen über **Beziehung pflegen + Empfehlungen + Ruf/Größe**, nicht über Reisen.
- **Kapitel 1 startet klein.**
- **Mehrere Abnehmer als Daten.** Keine vollen regionalen Rohölpreise.

## Arbeitsweise
- **Eigene Arbeitskopie:** Eine andere Sitzung ändert gerade map.yaml, geology.ts, timeskip.ts u. a. Deshalb baue ich in einem eigenen Worktree auf einem eigenen Zweig und führe am Ende auf main zusammen. Konflikte löse ich dabei und berühre die Dateien der anderen Sitzung nicht.
- **Je Schritt:** bauen → Tests → `npm test` → `npm run check:content`/`check:events` → Bildschirmfoto (`SHOT_NUR=…`) → Commit mit Version (0.4.20+41, +42 …).
- **Alte Spielstände:** Der Spielstand-Format steigt, wo nötig. Alte Stände laden mit „alle bisherigen Kontakte bekannt“, Beziehung neutral.
- Halbfertiges `src/sim/sale.ts` und `docs/plan-nacht.md` aus dem abgebrochenen Start: übernehmen (sale.ts → A1) bzw. durch diesen Plan ersetzen.

## Teil 0 – Telefon klären (5 min)
- Philipp liest die Version unten links ab.
- Ist sie älter als 0.4.20+34: am Ende `tools/pcweb.sh` mit dem neuen Stand (nur auf Philipps Wunsch).
- Im Code: Reste „Kalender (T)“ in Kapitel 2 umbenennen (`TransportPanel.tsx:400`, Tastenhilfe) – Telefon heißt ab Kapitel 2 überall Telefon.

## Teil 1 – Netzwerk: Kontakte kennenlernen und pflegen (Kern)

**Neu: `src/sim/network.ts`** (rein, mit Tests). Zustand `state.network`:
```
known: { [contactId]: { since: round, relation: 0–100, lastRound: round } }
referrals: [{ from, to, round }]   // offene Empfehlung (Brief/Notiz)
```

**Daten in content/plans.yaml je Stelle (`contacts`):**
- `start: true` → bekannt ab Spielbeginn.
- `meet:` (eine oder mehrere Bedingungen):
  - `referral: { from: <stelle>, relation: 60 }` → Empfehlung, sobald die Beziehung zu `from` die Schwelle erreicht.
  - `empire: 150000` / `reputation: { public: 20 }` / `chapter: 2` → meldet sich von selbst. Ab Kapitel 2 als Anruf (vorhandenes `ringPhone`/`callerCard` in src/sim/plans.ts), in Kapitel 1 als Besucher bzw. Brief.
  - `mark: <merkzeichen>` → über ein Ereignis.

**Beziehung:**
- Jede gebuchte Karte der Stelle bringt `relation.use` (z. B. +8), Erfolg zusätzlich +4.
- Gebrochenes (Lieferung verfehlt, Vorschuss nicht bedient, Verrat-Merkzeichen) kostet `relation.breach`.
- Ohne Kontakt sinkt sie nach `relation.idle` Runden je Runde um `relation.decay`, bis auf einen Boden.
- **Wirkung:**
  - Karten können `requires.minRelation` tragen (bessere Angebote nur für gute Kontakte).
  - Preise und Prämien der Deals × (1 + `relation.bonus` × (Beziehung − 50)/50), über einen Helfer `relationFactor(state, contact)`, den die Handler in deals.ts/pricing.ts nutzen.
  - Unter `relation.cold` ist die Stelle „verärgert“: nur noch eine Versöhnungs-Karte.
- Zahlen in balance.yaml unter `network`.

**Filter:**
- `planCards`/`planView` (plans.ts) zeigen nur Karten bekannter Stellen.
- `CalendarSheet` zeigt nur bekannte Stellen.
- `checkPlanContent` prüft: jede Stelle hat `start` oder `meet`, und Empfehlungsketten haben keine Schleifen.
- Die Bots kennen alle Stellen, die ein Mensch an der gleichen Stelle kennen würde (gleiche Regeln). Die Kapitel-1-Bots laufen gegen die Zielwerte.

**Kapitel 1 klein:**
- Start mit Bank, Geologen, Grundbesitzer, Crane, Eisenbahn (Thorne), Händler Port Ellis, Selbst, Familie.
- Ölleute (Bullard/Brennan/Gemeinschaft) über eine Empfehlung der Grundbesitzer oder den ersten Fund.
- Fuhrleute über Händler, Zeitung über Ruf, Sheriff ab der ersten Öldieb-Meldung bzw. Ruf.
- Rundgang (content/rundgang.yaml) und Einstiegshinweise (content/tutorial.yaml) anpassen.

**Kontakte bleiben über Kapitel:**
- Alte Stellen bekommen Kapitel-2/3-Karten statt zu verschwinden:
  - Crane: Rohöl-Liefervertrag in Kapitelgröße.
  - Händler: Großabnahme und Vertrag.
  - Ölleute: Turm verleihen bzw. Bohrmannschaften.
  - Fuhrleute: Tanklaster mieten.
  - Sheriff: Wache für Fernleitung/Raffinerie.
- Die Beträge skalieren mit dem Erlös (`letterScale.ts`).
- Der Zeitsprung behält `network` (Beziehungen verblassen ein Stück, `network.jumpFade`).

**Oberfläche (Adressbuch/Telefon):**
- Bekannte Stellen mit Beziehungsbalken (kühl/neutral/gut/eng).
- „Neu“-Stempel für frisch kennengelernte Stellen (vorhandene gesehen-Liste).
- Offene Empfehlungen als Zeile „Pettibone empfiehlt: …“ mit Knopf „Vorstellen lassen“ (kostet 1 Termin).
- Unbekannte Stellen erscheinen nicht. Ruths Zettel nennt neue Empfehlungen.

## Teil 2 – Neue Großhändler (Abnehmer als Daten)

**Neu: `content/buyers.yaml`.** Je Abnehmer: id, Name/Figur (de/en), Ort, was er nimmt (Rohöl und/oder Produkte), Aufschlag auf den Posted Price, Fracht-Abschlag je bbl nach Ort, Menge je Runde, Kapitel, zugehörige Stelle im Adressbuch (`contact`) und Kennenlern-Regel (über Teil 1).
- Port Ellis Hafenhändler (bisher `trader`, bleibt Startkontakt)
- Okara: Pruetts Einkauf
- Hallstead: Motorwerke-Treibstoffhandel
- Cordova: Lampenölhandel
- Ostküste: Crane Eastern, Margarets Einkauf (Rohöl-Lieferanten, Bibel §7)
- Aldmark-Export: nur bei hoher Außenspannung, Ausfallrisiko

Die Figuren (Name, Charakter) entwerfe ich nach weltbibel/story-bibel, markiert als ENTWURF.

**Umbau Käufer:**
- `Buyer` wird `'crane' | string` (id aus buyers.yaml).
- `BUYERS`, `buyerPrice`, `buyerCapacityLeft`, `quoteSale`, `sellOil` in src/sim/transport.ts arbeiten über die Liste; Crane bleibt Sonderfall mit `jacobPrice`/Groll aus trust.ts.
- Cranes Groll trifft jeden Nicht-Crane-Verkauf wie heute `traderSold`.
- Nur **bekannte** Abnehmer erscheinen.

**Weitere Anpassungen:**
- **TransportPanel/FreightSheet:** Zeilen je bekanntem Abnehmer statt fester zwei; `compareRoutes`/`traderGain` (logistics.ts) entsprechend.
- **Produkte:** Großhändler für Produkte bieten Lieferverträge über das vorhandene `SupplyContract`-Muster in deals.ts (`activeSupply`, `contractedOutput`). Neue Karten an ihren Stellen statt eines neuen Systems.
- **Bots:** Verkaufen an den besten bekannten Abnehmer (bots.ts:131). Kapitel-1-Läufe bleiben im Rahmen.
- **Spielstand:** alte Stände: `trader` → `haendler_port_ellis`.

## Block A – Geldquellen (GDD §8), wie besprochen – aufgehängt am Netzwerk
- **A1 Anlagen verkaufen:** Pacht/Quelle an Bullard, Turm an den Händler (sale.ts fertig machen, Zahlen `sale` in balance.yaml, Knopf im Ranch-Fenster und in der Bohrturm-Akte). Tankstellen haben schon `sellStation`.
- **A2 Privatinvestoren als Kontakte:** Witwe Quill, Doktor Haskell, ein Rancher (figures.yaml hat Quill/Haskell). Kennenlernen über Empfehlung von Bank bzw. Grundbesitzern. Karte „Geld gegen Gewinnanteil“ mit Laufzeit und Wunsch; bei Verlust ein Ereignis, die Beziehung leidet.
- **A3 Farm-out:** Karte bei den Ölleuten. Ein Partner bezahlt die Bohrung auf Jacobs Pacht, bekommt einen Förderanteil und rechnet mit Chance falsch ab (Prüfung über die Dokumentenprüfung, src/sim/documents.ts).
- **A4 Pleite-Frist mit Auswegen:** Notverkauf mit Geboten (nutzt sale.ts), Umschuldung (Anwalt + Rating C), Rettung durch das Konsortium. Erst danach kommt das Ende.
- **A5 Konsortium-Darlehen ab Kapitel 2:** zinslos gegen einen Gefallen. Stelle „Konsortium“, Kennenlernen über Größe.
- **A6 Staatsaufträge/Kriegskredit:** Stelle „Regierung“ meldet sich bei Krieg/Krise im Weltmodell.
- **A7 Versicherung ab Kapitel 1:** Mr. Ashby, die Stelle gibt es schon; Brand/Blowout, Prämie nach Unfällen.

## Block B – wie besprochen (ohne Englisch, ohne Schwierigkeitsgrade)
- **B1 Einstellungen-Fenster** (ohne Sprache): Textgröße, Lautstärke/Ton aus, Vollbild (Browser + Electron), weniger Animation, farbenblind-freundliche Karte. Gemerkt wie `crude.szene`.
- **B2 Geräusche:** im Programm erzeugt (WebAudio, `src/ui/sound.ts`). Telefon, Telegramm, Kasse, Stempel, Glocke, Gusher.
- **B3 Ende „Ein Feuer in der Nacht“:** Fehde bzw. Rache eskaliert, mit Vorwarnung; neues Ende in chapter.yaml/ChapterEndScreen.
- **B4 Zweiter Anlauf:** einmal je Spiel nach der Pleite; Neustart mit wenig Geld, Netzwerk und Feinde bleiben (passt zu Teil 1).

## Block C – wie besprochen, ohne Demo-Build (C4) und Steam/Erfolge (C5)
- **C1** Verlauf je Runde + Diagramme im Kassenbuch + Abschluss-Statistik
- **C2** Drei Speicherplätze + Autosave (src/ui/storage.ts)
- **C3** Glossar
- **C6** Roadmap/CLAUDE.md, Tester-Build, Bericht

**Reihenfolge:** Teil 0 → Teil 1 (Netzwerk) → Teil 2 (Großhändler) → Block A → Block B → Block C. Alles gehört zum Auftrag. Reicht eine Nacht nicht, geht es in der nächsten Sitzung an derselben Stelle weiter; den Fortschritt hake ich in docs/plan-nacht.md ab. Je Schritt ein sauberer Commit.

## Kritische Dateien
- **Kontakte:** content/plans.yaml (contacts), content/balance.yaml (plans.cards, neu `network`, `sale`), src/sim/planContent.ts, src/sim/plans.ts, src/sim/deals.ts.
- **Abnehmer:** src/sim/transport.ts, logistics.ts, pricing.ts, balance.ts (Buyer).
- **Spielstand und Zeitsprung:** src/sim/game.ts + save.ts (Format), src/sim/timeskip.ts (nur `network` mitnehmen, Konflikt mit der anderen Sitzung beachten).
- **Oberfläche:** src/ui/sheets/CalendarSheet.tsx, src/ui/TransportPanel.tsx, src/ui/scene/DeskScene.tsx.
- **Bots:** src/sim/bots.ts.
- **Neu:** src/sim/network.ts, content/buyers.yaml, src/sim/buyers.ts (Lesen + Prüfung), src/ui/sound.ts.

## Prüfung
- **Tests je Regel:**
  - Kennenlernen über Empfehlung, Größe und Merkzeichen
  - Beziehung steigt, verfällt, „verärgert“
  - `minRelation`-Karten
  - Preisfaktor
  - Abnehmer: Preis, Menge, Groll
  - Speichern und Laden alter Stände
  - Verkauf von Pacht und Turm
- **Gesamtprüfung:**
  - `npm test`, `npm run check:content`, `npm run check:events`
  - `npm run bots` (Kapitel 1, alle Zielwerte im Rahmen)
  - kleine Kampagnen-Probe auf dem Mac (`KAMPAGNE_JOBS=3`, ~50 Seeds)
- **Im Spiel:** `npm run dev` mit `?seed=…&debug=1`.
  - Kapitel 1 startet mit 8 Stellen, die erste Empfehlung kommt.
  - Debug-Sprung nach Kapitel 2: Telefon, alte Kontakte mit neuen Karten, neuer Großhändler meldet sich, Verkauf an ihn im Frachtfenster.
- **Bildschirmfotos:** `npm run screenshots` (Adressbuch mit Beziehung, Frachtfenster mit mehreren Abnehmern).
