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
        # Tabellenmodell: Erlös (Preis − Fuhrwerk) minus Förderzins (Preis × Satz der Parzelle)
        for preis in bp.preisstufen():
            for roy, _name in bp.ROY_STUFEN:
                modell = 1000 * (preis - P["transport"]) - 1000 * preis * roy
                self.assertAlmostEqual(bp.marge_je_1000_bbl(preis, roy), modell)

    def test_erloes_beim_startpreis_randlage(self):
        self.assertAlmostEqual(bp.marge_je_1000_bbl(1.00, 0.125), 625.0)

    def test_foerderung_wie_tabellenmodell(self):
        # erste Förderrunde: q0 × Tage; danach −12 % pro Quartal
        self.assertAlmostEqual(bp.foerderung_kbbl(P["q0"], 0), P["q0"] * P["days"] / 1000)
        self.assertAlmostEqual(bp.foerderung_kbbl(150, 1), 150 * 91 * 0.88 / 1000)

    def test_pacht_wie_gdd(self):
        # GDD §5: Randlage 150 $ · 1/8, Nachbar 2.000 $ · 1/6, Am Fund 8.000 $ · 1/5
        self.assertEqual(bp.pacht("Randlage", "neutral")[:2], (150, 0.125))
        self.assertEqual(bp.pacht("Am Fund", "neutral")[:2], (8000, 0.20))
        self.assertEqual(bp.pacht("Nachbar eines Funds", "misstrauisch")[0], 3000)
        self.assertEqual(bp.pacht("Randlage", "fromm")[0], 140)  # 135 $ auf 10 $ gerundet
        self.assertAlmostEqual(bp.pacht("Randlage", "gierig")[1], 0.155)
        self.assertAlmostEqual(bp.pacht("Randlage", "verschuldet")[1], 0.10)  # 9,5 % → Untergrenze

    def test_foerderzins_stufe_hoechstens_2_5_punkte_daneben(self):
        for lage in bp.LAGE:
            for besitzer in bp.BES:
                _bonus, genau, (stufe, _n) = bp.pacht(lage, besitzer)
                with self.subTest(lage=lage, besitzer=besitzer):
                    self.assertTrue(bp.ROY_MIN <= genau <= bp.ROY_MAX)
                    self.assertLessEqual(abs(stufe - genau), 0.025 + 1e-9)

    def test_besitzerwurf_deckt_alle_besitzer(self):
        self.assertEqual(sorted(bp.BESITZER_WURF), [1, 2, 3, 4, 5, 6])
        self.assertEqual(set(bp.BESITZER_WURF.values()), set(bp.BES))

    def test_bankzins_wie_tabellenmodell(self):
        # GDD §8: Rating C 10 %, ohne Sicherheit +3, mit Pfand −2
        self.assertAlmostEqual(bp.bankzins(mit_pfand=False), 0.13)
        self.assertAlmostEqual(bp.bankzins(mit_pfand=True), 0.08)
        self.assertAlmostEqual(bp.zinsen(2000, 0.13), 65.0)  # wie Tabellenmodell, Runde 3

    def test_pleite_nach_drei_trockenbohrungen(self):
        # wie im Tabellenmodell: die dritte nur noch mit dem Geldverleiher, die vierte geht nicht
        self.assertEqual(bp.trockenbohrungen_bis_pleite(), 3)

    def test_ohne_geldverleiher_nach_zwei(self):
        alt = P["leiher_an"]
        try:
            P["leiher_an"] = 0
            self.assertEqual(bp.trockenbohrungen_bis_pleite(), 2)
        finally:
            P["leiher_an"] = alt

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
        self.assertEqual(bp.ZEICHEN["S"]["lage"], "Nachbar eines Funds")  # teurer zu pachten

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

    def test_pachttabelle_hat_alle_kombinationen(self):
        self.assertIn("8.000 $ · 1/5", self.html)
        self.assertIn("150 $ · 1/8", self.html)

    def test_pleite_zahl_steht_in_den_regeln(self):
        self.assertIn("nach <b>3 Trockenbohrungen</b>", self.html)


if __name__ == "__main__":
    unittest.main()
