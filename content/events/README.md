# Ereignisse

Jede `.yaml`-Datei hier ist eine Liste von Ereignissen und kommt automatisch ins Spiel –
ohne Codeänderung. Prüfen: `npm run check:content` (meldet Fehler mit Datei und Zeile).

- Anleitung zum Schreiben: `docs/ereignis-vorlage.md`
- Kommentiertes Beispiel zum Kopieren: `docs/ereignis-beispiel.yaml`

Kurzreferenz der Felder:
- Ereignis: `id`, `title`, `text`, `conditions`, `marked`, `notMarked`, `delay`, `chance`, `once`,
  `routine`, `appointments`, `mail`, `deadline`, `document`, `certain`, `rival`, `cooldown`, `group`,
  `draft`, `ranch`, `visitor`, `tableau`, `choices`
- Wahl: `id`, `label`, `result`, `requires`, `effects`, `marks`, `default`, `appointments`,
  `requiresFound`, `marksIfForged`, `sharp`, `unlocks`
- Karte (0.2.15+5): `ranch: moss` sagt, um wessen Ranch es geht (Figuren unter `figures` in
  `content/map.yaml` – jede Figur bekommt dort eine echte Ranch). `unlocks: [hollins]` an einer Wahl
  schaltet ein gesperrtes Gebiet aus `content/map.yaml` frei; seine Ranches entstehen dann aus dem Seed.
- Bedingungen: `minRound`, `maxRound`, `minCash`, `maxCash`, `minOilStock`,
  `minProducingWells`, `maxProducingWells`, `minLeases`, `minStrength`, `maxStrength` (Kraft 0–100),
  `minChapter`, `maxChapter` (Kapitel; ohne Angabe im Spielstand gilt Kapitel 1 – Phase 4)
- Effekte: `cash`, `oilStock`, `railTariff`, `strength` (Kraft), `ruth`, `thomas` (Beziehung 0–100, 2.7),
  `teams` (eigene Gespanne +/−), `teamsIdle` (eigene Fuhrwerke stehen bis Runde jetzt+n still; 0.2.15+2),
  befristet für `events.timedRounds` Runden (0.2.15+3): `price` ($ je Barrel beim Trust), `production`
  (Anteil der Förderung), `leaseCost` (Anteil am Pachtbonus); dasselbe Ereignis stapelt sich nicht
- Termine (2.3): `appointments` = Termine, die eine Antwort kostet (Standard 1; an einer Wahl
  überschreibt es den Wert des Ereignisses, z. B. `appointments: 0` für „abwinken“).
  Bleibt ein Ereignis liegen, gilt die Standard-Wahl und kostet keine Termine.
- Feste Termine: `routine: true` – nicht gewürfelt (`chance` darf fehlen), stehen jede Runde im
  Terminkalender, solange die Bedingungen stimmen; einmal je Runde; liegen lassen hat keine Folgen.
  Beispiele: `k1-termine.yaml`.
- Posteingang (2.4): `mail: offer | demand | info | personal` macht ein Ereignis zum Brief
  (Angebot, Forderung, Information, Persönliches). Briefe kommen zusätzlich mit der Post
  (`events.mail.maxPerRound`), bleiben `deadline` Runden liegen (Standard `events.mail.deadlineRounds`),
  in der letzten Runde mit rotem Siegel, danach gilt die Standard-Wahl. Kam von einer Art
  `events.mail.guaranteeRounds` Runden keiner, bringt die Post sicher einen – darum braucht jede
  Art einen Alltagsbrief ohne Bedingungen mit `once: false`. Beispiele: `k1-post.yaml`.
- Dokumentenprüfung (2.5): `document` mit `title`, `reference`, `forgeryChance` (optional) und
  `fields` (`id`, `label`, `value`, `reference`, `forged`). Beim Eintreffen wird gewürfelt, ob ein
  Feld mit `forged` gefälscht ist (`events.documents.forgeryChance`); die Lupe prüft bis zu
  `events.documents.maxChecks` Felder. Wahl mit `requiresFound: true` geht nur nach gefundener
  Fälschung; `marksIfForged` setzt Merkzeichen nur bei einer Fälschung (die teure Folge).
  Beispiele: `k1-dokumente.yaml`.
- Familie und Kraft (2.7): Eine Wahl mit `ruth` oder `thomas` > 0 ist Familienzeit – sie gibt am
  Rundenende Kraft (+3 bis +8 je nach Beziehung, `family` in balance.yaml); eine Runde ohne
  Familienzeit kostet Beziehung. Die Simulation setzt zur Geburt das Merkzeichen `thomas_geboren`
  (mit `delay: 0` reagiert ein Ereignis noch in derselben Runde). `sharp: true` markiert eine beste
  Antwort: Sie fehlt, solange Jacob erschöpft ist (`agenda.errorsBelow`). Zustandswörter und Sätze
  des Familienbildschirms stehen in `content/family.yaml`. Beispiele: `k1-0-thomas-geburt.yaml`,
  `k1-7-arzt.yaml`, `k1-termine.yaml`.
- Rivalen (2.8): `certain: true` – kommt sicher, sobald Bedingungen und Merkzeichen stimmen (kein
  Würfel, `chance` darf fehlen, zählt nicht gegen `maxPerRound`). `rival: crane | thorne | bullard`
  sagt, wer dahintersteckt. Einige Merkzeichen liest die Simulation selbst (Crane-Abschlag,
  Thorne-Frachtvertrag, Bullards Handschlag/Fehde, Verkauf an Crane) – Liste oben in
  `k1-rivalen.yaml`, Namen nicht ändern. `bullard_verraten` setzt die Simulation.
- Story-Bögen (2.9): Silas (`k1-2-silas.yaml`) und Moss (`k1-3-moss.yaml`) kommen in jeder Partie
  (`certain: true`). Wie ein Bogen ausgeht, steht in `content/arcs.yaml`: Ausgänge mit den
  Merkzeichen, an denen man sie erkennt (`any`), erster passender gilt. Der Kapitelabschluss zeigt
  „Was aus ihnen wurde“. Alles Entwurf – Philipp überarbeitet.
- Wiederholungsschutz (2.10a): `once: false` darf wiederkommen, frühestens nach `cooldown` Runden
  (fehlt er: `events.repeatCooldown` in balance.yaml; `cooldown: 0` = kein Schutz). `group: name`
  macht Varianten eines wiederkehrenden Ereignisses (z. B. drei Bohrpannen): Nach einer Variante kommt
  keine aus derselben Gruppe, bis der Abstand um ist. `draft: true` markiert eine Schlüsselszene als
  Entwurf – ändert nichts am Spiel, `npm run check:content` listet sie auf.
- Alltag (2.10a): `k1-8-alltag-1.yaml` (Bohrstelle), `-2` (Geschäft), `-3` (Menschen) – je 10 Ereignisse.
- Alltag (2.10b): `-4` (Rivalen und Bank, 13), `-5` (Arbeiter und Unglücke, 13), `-6` (Familie, Presse,
  Politik in Cordova, 11) – zusammen 67 Alltagsereignisse. Viele greifen Merkzeichen aus Teil 1 auf
  (Kerrigan, Eli, Sheriff, Nora, Ruths Bücher); die Liste steht oben in jeder Datei.
- Gewürfelt wird in zufälliger Reihenfolge (seit 2.10b – vorher hatten Dateien vorn im Alphabet
  Vorrang), höchstens `events.maxPerRound` (balance.yaml) neue je Runde. Was sicher kommen muss,
  bekommt `certain: true` (z. B. die Geburt von Thomas).
- Transport (0.2.15+2): `k1-9-transport.yaml` – Streik/Bestechung eigener Fuhrleute, Wegerechte für die
  Pipeline. Merkzeichen der Simulation: `fuhrleute_eigen`, `pipeline_geplant`, `pipeline_gebaut`, `haendler_kunde`.
- Wirkung (0.2.15+3): `npm run check:events` (`-- --alle` für alle) bewertet jede Antwort und meldet
  schwache: Wirkung unter 2 % des Kapitel-Gelds (balance.yaml `events.relevance`, 200 $), keine dauerhafte
  Folge, kein Merkzeichen, das später etwas abfragt. Eine einzelne schwache Antwort neben einer starken
  ist das „Gegenstück“ und erlaubt. Merkzeichen für spätere Kapitel: `content/relevance.yaml` (mit Grund).
  Neue Folgen früher folgenloser Merkzeichen: `bullard_rache_folge`, `kerrigan_zusammenbruch`,
  `wegerecht_moss_versoehnt`; Schutz durch `notMarked` (Diebe, Seil, Streik, Lohn, Schlamm, Lager).
- Auftritt (0.2.15+10): `visitor: silas` – das Ereignis kommt als Besuch an Jacobs Schreibtisch (Person
  klopft, tritt ein, redet); die Figur braucht in `content/figures.yaml` einen Namen
  (`silas: { form: muetze, name: Silas }`). `tableau: true` – kommt als Vollbild-Szene (Geburt, Brand,
  Blitz, Sturm). Nicht für Briefe (`mail`) und feste Termine (`routine`); ohne Auftritt hängt ein
  Ereignis als Vorfall am Notizspieß. Reine Darstellung, ändert keine Regel. Besetzt sind die Bögen von
  Silas, Moss und Ruth, dazu Arzt, Nora, Bullard, Fuhrleute, Sheriff und Prediger.
  Nur wer wirklich ins Büro kommt, bekommt `visitor` (0.2.15+11): Spielt der Text woanders (Saloon,
  Bahnsteig, Veranda, Bohrturm, Bank), bleibt das Ereignis ein Vorfall – sonst widerspricht die Szene
  „Besuch · Silas“ dem eigenen Text. ENTWURF: Philipp segnet die Besetzung ab.
- Kapitel 3 – Alltag (Phase 4, ENTWURF – Philipp überarbeitet): `k3-alltag-1-marke` (Marke, Tankstellen,
  Margaret Crane), `-2-boerse` (Börse, Kauf auf Kredit, Thornes Kurspflege), `-3-lobby` (Dunmore, Grady,
  Steuerabzug, Courier), `-4-seismik` (Dr. Hale, Konsortium, Ashcombe), `-5-stand` (Club, Kirche, Ball,
  Stiftung), `-6-rivalen` (Bullard verschuldet, Thorne, Pruett), `-7-krise` (volle Tanks, Zinsen,
  Flugblätter, Bankrun), `-8-familie` (Haskell, Silberhochzeit, Thomas, Clara, Silas) – 57 Ereignisse.
  Alle mit `conditions: { minChapter: 3, maxChapter: 3 }`; kommen also nie in Kapitel 1 und ändern dort
  auch keinen Wurf (gemischt werden nur Ereignisse des laufenden Kapitels). Wirkungen, die es noch nicht
  gibt (Marke, Aktien, Ruf, Stand, Clara …), stehen als `# TODO-Effekt: …` neben einer Ersatzwirkung.
  Offen für den Zeitsprung (Block A): Er muss `chapter` im Spielstand setzen. Fängt die Rundenzählung je
  Kapitel neu an, braucht `delay` bei Kapitel-1-Merkzeichen eine Lösung (Merkzeichen tragen die Runde,
  in der sie gesetzt wurden).
