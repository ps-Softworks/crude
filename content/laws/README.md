# Gesetze (4.3, GDD §10)

Jede `.yaml`-Datei hier beschreibt **ein Gesetz** und kommt automatisch ins Spiel. Prüfen:
`npm run check:content`. Gesetze haben kein festes Jahr: Sie sammeln **Druck**, solange ihre Gründe im
Weltmodell stimmen, kommen über der Schwelle mit etwas Glück als **Antrag** ins Parlament, werden
**debattiert** und **abgestimmt**. Die Zeitung meldet jeden Schritt. Ablauf-Zahlen (Verfall des Drucks,
Antragschance, Dauer der Debatte, Zufall bei der Abstimmung, Ruhe nach einer Niederlage) stehen in
`content/balance.yaml` unter `worldModel.laws`. Allgemeine Zeitungstexte (Abstimmung, Aussicht) in
`content/politics.yaml` unter `laws`.

Felder:
- `id` (a–z, 0–9, _), `name`, `summary` (de/en), `draft: true` für Entwürfe.
- `threshold`: ab so viel Druck kann der Antrag kommen. Druck je Runde = alter Druck × `decay` + Punkte.
  Ein Grund, der dauerhaft stimmt, bringt den Druck auf Punkte ÷ (1 − decay), bei decay 0,85 also × 6,7.
- `pressure`: Liste von Gründen `- when: { … }` / `add: Punkte` (auch negativ: bremst).
- `votes`: Anteil Ja-Stimmen je Fraktion (`handel`, `volksbund`, `provinz`, je 0–1). Die Sitze sind das
  Ergebnis der letzten Wahl (vor der ersten Wahl: die Anteile zu Kampagnenbeginn). Angenommen bei über 50 %.
- `swing`: Gründe wie bei `pressure`, aber `add` ist ein Zu- oder Abschlag auf die Zustimmung (0,05 = 5 Punkte).
- `effects.world` (jede Runde, solange das Gesetz gilt): `creditShift`, `moodShift`, `tensionShift`,
  `nationalismShift` (dauerhafte Verschiebung wie im Weltmodell), `trustShift` (Marktanteil des Trusts).
- `effects.rules` (für spätere Kapitel, je 0–1): `incomeTax` (Steuersatz), `cartelBan` (1 = Absprachen
  verboten), `breakupFrom` (Zerschlagung ab diesem Marktanteil).
- `lobby` (vorbereitet, ab Kapitel 2): `demand`, `block`, `weaken` (mit verwässerten `rules`), `delay`,
  je mit `label`. Stärke der Züge in balance.yaml (`worldModel.laws.lobby`).
- `news`: `proposed`, `debate`, `passed`, `failed`, je `title` und `text` (de/en).

Bedingungen in `when` (alle müssen stimmen): Bereiche `{ min: …, max: … }` für `scarcity` (Weltpreis ÷
Trendpreis, 1 = normal), `credit`, `mood`, `tension`, `nationalism`, `tech` (0–100), `trustShare`
(Marktanteil des größten Konzerns, 0–1), Sitze `handel`, `volksbund`, `provinz` (0–1); dazu
`government: volksbund` (oder Liste), `war: true/false`, `crash: true/false`.
