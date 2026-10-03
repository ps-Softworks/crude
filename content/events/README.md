# Ereignisse

Jede `.yaml`-Datei hier ist eine Liste von Ereignissen und kommt automatisch ins Spiel –
ohne Codeänderung. Prüfen: `npm run check:content` (meldet Fehler mit Datei und Zeile).

- Anleitung zum Schreiben: `docs/ereignis-vorlage.md`
- Kommentiertes Beispiel zum Kopieren: `docs/ereignis-beispiel.yaml`

Kurzreferenz der Felder:
- Ereignis: `id`, `title`, `text`, `conditions`, `marked`, `notMarked`, `delay`, `chance`, `once`,
  `routine`, `appointments`, `mail`, `deadline`, `document`, `certain`, `rival`, `cooldown`, `group`,
  `draft`, `choices`
- Wahl: `id`, `label`, `result`, `requires`, `effects`, `marks`, `default`, `appointments`,
  `requiresFound`, `marksIfForged`, `sharp`
- Bedingungen: `minRound`, `maxRound`, `minCash`, `maxCash`, `minOilStock`,
  `minProducingWells`, `maxProducingWells`, `minLeases`, `minStrength`, `maxStrength` (Kraft 0–100)
- Effekte: `cash`, `oilStock`, `railTariff`, `strength` (Kraft), `ruth`, `thomas` (Beziehung 0–100, 2.7)
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
- Dateien werden alphabetisch gewürfelt, höchstens `events.maxPerRound` (balance.yaml) neue je Runde.
- Die Bots spielen (noch) ohne Ereignisse.
