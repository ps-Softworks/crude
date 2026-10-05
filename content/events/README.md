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
- Bedingungen: `minRound`, `maxRound` (Runde im laufenden Kapitel, ab Kapitelbeginn wieder 1 – 4.5), `minCash`, `maxCash`, `minOilStock`,
  `minProducingWells`, `maxProducingWells`, `minLeases`, `minStrength`, `maxStrength` (Kraft 0–100),
  `minRefineryLevel` (fertige Raffinerie-Stufen), `minPipelines` (laufende eigene Leitungen: kleine Pipeline +
  fertige Fernleitungen), `minPublicShare` (Prozent der Aktien in fremder Hand, nur als Aktiengesellschaft),
  `minThomasAge`, `maxThomasAge` (Thomas' Alter in Jahren, vor der Geburt −1; 4.5),
  `minChapter`, `maxChapter` (Kapitel; ohne Angabe im Spielstand gilt Kapitel 1 – Phase 4). Für das
  ganze Ereignis gilt: Fehlt `minChapter`, ist es ein Kapitel-1-Ereignis – es kommt nur in Kapitel 1
  (bzw. bis `maxChapter`, falls angegeben). Mit `minChapter` und ohne `maxChapter` kommt es ab diesem
  Kapitel in jedem späteren. Das gilt für gewürfelte und sichere Ereignisse, Briefe und feste Termine.
  An einer Wahl prüfen `minChapter`/`maxChapter` nur, was dasteht.
  Die Ereignisse der Kapitel-2-Systeme (`k2-fernleitung`, `k2-personal`, `k2-diplomatie`, `k2-delaney`) tragen
  `minChapter: 1`: Sie hängen an Merkzeichen der Simulation und kommen so in jedem Kapitel, sobald diese gesetzt sind.
  Ereignisse für Kapitel 2 tragen `conditions: { minChapter: 2, maxChapter: 2 }` und erscheinen so nie in Kapitel 1.
  Kapitel-1-Ereignisse brauchen keine Angabe; ein paar tragen zur Klarheit trotzdem `maxChapter: 1` (Ruths Bücher,
  Pension, Fieber). Auch die festen Termine aus `k1-termine.yaml` gelten nur in Kapitel 1 – bis auf den
  Familienabend mit den Kindern (`termin_familie_k2`, `minChapter: 2, maxChapter: 2`).
  Merkzeichen gehen beim Kapitelwechsel mit (Zeitsprung, `marksIntoNextChapter`): Sie gelten als vor
  Kapitelbeginn gesetzt, `delay` zählt also ab der ersten Runde des neuen Kapitels.
- Kapitel 2 – Alltag (Phase 4, Entwurf): `k2-alltag-1` (Raffinerie, Geschäft), `-2` (Pipeline, Wegerechte,
  Fracht), `-3` (Aktionäre, Anleihen, Personal), `-4` (Rivalen: Crane-Nachfolge, Thorne, Bullard, Delgado),
  `-5` (Presse, Politik, Familie, Unglücke). Raffinerie-, Pipeline- und Aktien-Ereignisse prüfen seit der
  Integration `minRefineryLevel`, `minPipelines` und `minPublicShare` (siehe Bedingungen). Noch fehlende
  Wirkungen (Aktien, Rat, Ruf, Rivalen …) stehen als `# TODO-Effekt` neben den Ereignissen (Liste in
  `docs/phase4/integration.md`).
  Regeln für die Texte: Okara gibt es erst mit der Zeitsprung-Weiche (`okara_pachten` = Jacob
  pachtet, `okara_bullard` = Bullard bohrt dort; sonst Salt Hill/Cordova),
  Häfen liegen am Golf (Port Ellis); Bullards Söhne sind in Kapitel 2 noch Kinder (Wade 14–17, Cole 10–13);
  Ada Pell, Aufsichtsrat, Pettibone als Rat und Silas in der Firma nur mit passender Bedingung; politische
  Ausgänge (Gesetze, Wahlen) entscheidet das Weltmodell – die Texte sagen nur, wohin es sich neigt.
  Geht Greaves zu Pruett (`k2_greaves_weg`), sperren alle Greaves-Ereignisse (`notMarked`).
- Effekte: `cash`, `oilStock`, `railTariff`, `strength` (Kraft), `ruth`, `thomas`, `clara` (Beziehung 0–100, 2.7/4.5),
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
- Alltag (2.10a): `k1-8-alltag-1.yaml` (Bohrstelle), `-2` (Geschäft), `-3` (Menschen).
- Alltag (2.10b): `-4` (Rivalen und Bank), `-5` (Arbeiter und Unglücke), `-6` (Familie, Presse,
  Politik in Cordova). Ursprünglich 67 Alltagsereignisse, seit Etappe 3 noch 42. Viele greifen Merkzeichen
  aus Teil 1 auf (Kerrigan, Eli, Sheriff, Nora, Ruths Bücher); die Liste steht oben in jeder Datei.
- Gewürfelt wird in zufälliger Reihenfolge (seit 2.10b – vorher hatten Dateien vorn im Alphabet
  Vorrang), höchstens `events.maxPerRound` (balance.yaml) neue je Runde. Was sicher kommen muss,
  bekommt `certain: true` (z. B. die Geburt von Thomas).
- Transport (0.2.15+2): `k1-9-transport.yaml` – Streik eigener Fuhrleute, Bestechung von Brennans Fuhrleuten (Etappe 3), Wegerechte für die
  Pipeline. Merkzeichen der Simulation: `fuhrleute_eigen`, `pipeline_geplant`, `pipeline_gebaut`, `haendler_kunde`.
- Wirkung (0.2.15+3): `npm run check:events` (`-- --alle` für alle) bewertet jede Antwort und meldet
  schwache: Wirkung unter 2 % des Kapitel-Gelds (balance.yaml `events.relevance`, 200 $), keine dauerhafte
  Folge, kein Merkzeichen, das später etwas abfragt. Eine einzelne schwache Antwort neben einer starken
  ist das „Gegenstück“ und erlaubt. Merkzeichen für spätere Kapitel: `content/relevance.yaml` (mit Grund).
  Neue Folgen früher folgenloser Merkzeichen: `kerrigan_zusammenbruch`, `wegerecht_moss_versoehnt`
  (Bullards Rache steckt seit Etappe 3 direkt in „Das Seil ist angeschnitten“); Schutz durch `notMarked`
  (Diebe, Seil).
- Gekoppelte Briefe (Termine als Hauptwerkzeug, Etappe 3, nur Kapitel 1): Briefe und Ereignisse sind
  ausgedünnt (123 → 92) und hängen, wo es geht, an Jacobs Plänen. Die Simulation setzt dafür Merkzeichen
  (`src/sim/letters.ts`, `LETTER_MARKS`): frisch nach einem Plan und `letters.window` Runden lang
  `erkundet`, `thorne_besucht`, `thorne_abfuhr`, `geruecht_gestreut`, `kartell_klausel`,
  `gemeinschaft_abgesprungen`, `liefervertrag_fehlmenge`; solange etwas läuft `foerderbremse_laeuft`,
  `liefervertrag_laeuft`, `brennan_faehrt`, `gemeinschaft_laeuft`, `oel_zurueckgehalten`; dauerhaft
  `thorne_meldet_sich` (Thornes Frachtvertrag nach dem ersten Besuch, spätestens Runde `letters.thorneLatest`).
  Antworten, die die Simulation liest (`LETTER_ACTIONS`): `hale_gutachten_gekauft`/`_falsch` und
  `pike_pacht_gekauft`/`pike_urkunde_falsch` (Hinweis auf einer Ranch bzw. wertlos), `bohrliste_gekauft`
  (Bohrbericht), `nora_versoehnt`, `liefervertrag_aufgeloest`, `gemeinschaft_zurueck`,
  `wildcatter_geholfen`/`_verprellt` (Ruf ± `letters.standing`), `thorne_exklusiv_billig`.
  Regeln der Post in Kapitel 1: Antworten (Briefe mit `marked`) gehen bei Garantie und Würfeln den
  Alltagsbriefen vor; höchstens `events.mail.perRival` Briefe je Rivale und Runde (alle Kapitel).
  Gruppen in Kapitel 1 (`trupp`, `tank`, `thomas`) halten 4 Runden Abstand – alle Varianten einer Gruppe
  brauchen denselben `cooldown` (prüft `npm run check:content`). Jede Antwort in Kapitel 1 hat Wirkung
  (≥ 100 $, ein Merkzeichen mit Folge oder eine Beziehung; Test in `src/sim/letters.test.ts`).
- Kapitel 3, Story-Bögen (Phase 4): `k3-story-1-daniel.yaml` (Daniel Moss als Bezirksstaatsanwalt),
  `k3-story-2-thomas.yaml` (Thomas im Unternehmen oder nicht), `k3-story-3-ehe.yaml` (Wendepunkt der Ehe),
  `k3-story-4-vale.yaml` (Mr. Vales Karte – Auftakt Bogen D, auf sie wartet Ruths zweite Probe).
  Alle mit `minChapter: 3, maxChapter: 3`; Runden zählen innerhalb des Kapitels. Gewünschte neue Wirkungen
  stehen als `# TODO-Effekt:` neben einer vorläufigen. `k3-story-3-ehe-k2.yaml` erzählt die Folgen von Ruths
  Kapitel-2-Bogen (Merkzeichen aus `k2-story-3-ruth.yaml`; Test: `src/sim/k3Story.test.ts`). ENTWURF – Philipp überarbeitet.
- Auftritt (0.2.15+10): `visitor: silas` – das Ereignis kommt als Besuch an Jacobs Schreibtisch (Person
  klopft, tritt ein, redet); die Figur braucht in `content/figures.yaml` einen Namen
  (`silas: { form: muetze, name: Silas }`). `tableau: true` – kommt als Vollbild-Szene (Geburt, Brand,
  Blitz, Sturm). Nicht für Briefe (`mail`) und feste Termine (`routine`); ohne Auftritt hängt ein
  Ereignis als Vorfall am Notizspieß. Reine Darstellung, ändert keine Regel. Besetzt sind die Bögen von
  Silas, Moss und Ruth, dazu Arzt, Nora, Bullard, Fuhrleute, Sheriff und Prediger.
  Nur wer wirklich ins Büro kommt, bekommt `visitor` (0.2.15+11): Spielt der Text woanders (Saloon,
  Bahnsteig, Veranda, Bohrturm, Bank), bleibt das Ereignis ein Vorfall – sonst widerspricht die Szene
  „Besuch · Silas“ dem eigenen Text. ENTWURF: Philipp segnet die Besetzung ab.
- Öffentliches Handeln (4.2): `public: [field_fire]` an einer Wahl – darüber redet das Land. Am Rundenende
  verschiebt die Tat die Stimmung und die Parteien (Zahlen in balance.yaml, `worldModel.acts`), die Zeitung
  berichtet in der nächsten Runde. Taten: `price_war` (Jacob unterbietet wirklich, erst ab Kapitel 2), `independents_stand` (gemeinsam mit
  anderen Unabhängigen gegen den Trust), `field_fire` (Feldbrand), `strike`,
  `strike_break` (Streikbrecher), `charity` (Spende für die Stadt), `support_handel`, `support_volksbund`,
  `support_provinz` (Spende/Stimmen für eine Partei), `press_praise`, `press_scandal`. Ein Tankbrand im Lager
  zählt von selbst als `field_fire`. Parteinamen und Programme: `content/politics.yaml`.
- Kapitel 2 (Phase 4): Jedes Ereignis eines späteren Kapitels trägt `minChapter`/`maxChapter`
  (z. B. `{ minChapter: 2, maxChapter: 2 }`) – in Kapitel 1 kommt es nie (Test in `src/sim/events.test.ts`).
  Story-Bögen Ruth, Silas, Nora: `k2-story-1-nora.yaml`, `k2-story-2-silas.yaml`, `k2-story-3-ruth.yaml`
  (30 Ereignisse). Gewünschte neue Wirkungen stehen dort als Kommentar `# TODO-Effekt: …` neben einer
  vorläufigen. Runden zählen im Kapitel ab 1. Der Kapitelwechsel setzt alle Merkzeichen mit
  `marksIntoNextChapter` (src/sim/events.ts) auf Runde 0, damit `delay` ab Kapitelbeginn zählt.
  ENTWURF – Philipp überarbeitet.
- Kapitel 3 – Alltag (Phase 4, ENTWURF – Philipp überarbeitet): `k3-alltag-1-marke` (Marke, Tankstellen,
  Margaret Crane), `-2-boerse` (Börse, Kauf auf Kredit, Thornes Kurspflege), `-3-lobby` (Dunmore, Grady,
  Steuerabzug, Courier), `-4-seismik` (Dr. Hale, Konsortium, Ashcombe), `-5-stand` (Club, Kirche, Ball,
  Stiftung), `-6-rivalen` (Bullard verschuldet, Thorne, Pruett), `-7-krise` (volle Tanks, Zinsen,
  Flugblätter, Bankrun), `-8-familie` (Haskell, Silberhochzeit, Thomas, Clara, Silas) – 59 Ereignisse.
  Alle mit `conditions: { minChapter: 3, maxChapter: 3 }`; kommen also nie in Kapitel 1 und ändern dort
  auch keinen Wurf (gemischt werden nur Ereignisse des laufenden Kapitels). Umgekehrt kommen die
  Kapitel-1-Ereignisse (ohne `minChapter`) nach dem Zeitsprung nicht mehr – auch nicht als Brief oder
  fester Termin; Kapitel 3 braucht also eigene feste Termine (Abend mit Ruth usw.), falls gewünscht. Wirkungen, die es noch nicht
  gibt (Marke, Aktien, Ruf, Stand, Clara …), stehen als `# TODO-Effekt: …` neben einer Ersatzwirkung.
  Offen für den Zeitsprung (Block A): Er muss `chapter` im Spielstand setzen und beim Kapitelwechsel
  `marksIntoNextChapter` aufrufen, damit `delay` bei Merkzeichen früherer Kapitel ab Kapitelbeginn zählt.
