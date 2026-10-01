"""Tests für den Papierprototyp (Roadmap 0.7).

Prüft, dass die Tabellen auf dem Druckbogen zu den Startwerten des
Tabellenmodells passen und dass Karte und Kartenstapel zusammenpassen.

Aufruf:  .venv/bin/python -m unittest tools/papierprototyp/test_papierprototyp.py
"""

import re
import sys
import tempfile
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_papierprototyp as bp  # noqa: E402

P = bp.P


class Rechenregeln(unittest.TestCase):
    def test_erloes_wie_tabellenmodell(self):
        # Tabellenmodell: Erlös (Preis − Fuhrwerk) minus Förderzins (Preis × 1/8)
        for preis in bp.preisstufen():
            modell = 1000 * (preis - P["transport"]) - 1000 * preis * P["royalty"]
            self.assertAlmostEqual(bp.marge_je_1000_bbl(preis), modell)

    def test_erloes_beim_startpreis(self):
        self.assertAlmostEqual(bp.marge_je_1000_bbl(1.00), 625.0)

    def test_foerderung_wie_tabellenmodell(self):
        # erste Förderrunde: q0 × Tage; danach −12 % pro Quartal
        self.assertAlmostEqual(bp.foerderung_kbbl(P["q0"], 0), P["q0"] * P["days"] / 1000)
        self.assertAlmostEqual(bp.foerderung_kbbl(150, 1), 150 * 91 * 0.88 / 1000)

    def test_zinsen_pro_runde(self):
        self.assertAlmostEqual(bp.zinsen(3000), 75.0)

    def test_pleite_nach_zwei_trockenbohrungen(self):
        # wie im Tabellenmodell: 2.000 $ Kasse + 3.000 $ Kredit, Zinsen fressen den Rest
        self.assertEqual(bp.trockenbohrungen_bis_pleite(), 2)

    def test_preisleiste(self):
        stufen = bp.preisstufen()
        self.assertEqual(stufen[0], bp.PREIS_MIN)
        self.assertEqual(stufen[-1], bp.PREIS_MAX)
        self.assertIn(bp.PREIS_START, stufen)
        self.assertEqual(sorted(bp.PREIS_WURF), [1, 2, 3, 4, 5, 6])


class KarteUndStapel(unittest.TestCase):
    def test_karte_ist_6x6(self):
        self.assertEqual(len(bp.KARTE), 6)
        self.assertTrue(all(len(r) == 6 for r in bp.KARTE))

    def test_jedes_feld_bekommt_genau_eine_karte(self):
        felder = Counter("".join(bp.KARTE))
        karten = Counter(z for z, _art in bp.stapel())
        self.assertEqual(felder, karten)

    def test_trefferquote_nahe_tabellenmodell(self):
        # GDD §15: etwa 1 von 5 bis 1 von 10; Modell 15 %
        self.assertAlmostEqual(bp.trefferquote(), P["hit_rate"], delta=0.03)

    def test_oelsicker_lohnt_mehr_als_flach(self):
        def quote(z):
            karten = bp.ZEICHEN[z]["karten"]
            return 1 - karten["Trocken"] / sum(karten.values())
        self.assertGreater(quote("S"), quote("K"))
        self.assertGreater(quote("K"), quote("F"))
        self.assertGreater(bp.ZEICHEN["S"]["bonus"], bp.ZEICHEN["F"]["bonus"])

    def test_startraten_im_gdd_rahmen(self):
        for art in ("Klein", "Fund"):
            self.assertTrue(all(50 <= r <= 500 for r in bp.STARTRATE[art]))
        self.assertTrue(all(r > 300 for r in bp.STARTRATE["Gusher"]))


class Druckbogen(unittest.TestCase):
    def setUp(self):
        with tempfile.TemporaryDirectory() as tmp:
            ziel = Path(tmp) / "bogen.html"
            bp.bauen(ziel)
            self.html = ziel.read_text(encoding="utf-8")

    def test_alle_karten_auf_dem_bogen(self):
        self.assertEqual(self.html.count('class="kartei'), len(bp.stapel()))

    def test_karte_hat_36_felder(self):
        self.assertEqual(self.html.count('class="feld'), 36)

    def test_rundenbogen_hat_16_runden(self):
        self.assertEqual(len(re.findall(r"<small>J\d Q\d</small>", self.html)), 16)

    def test_pleite_zahl_steht_in_den_regeln(self):
        self.assertIn("nach <b>2 Trockenbohrungen</b>", self.html)


if __name__ == "__main__":
    unittest.main()
