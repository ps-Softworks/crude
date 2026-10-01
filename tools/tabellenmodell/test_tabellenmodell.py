"""Tests für das Tabellenmodell (Roadmap 0.6).

Baut die Excel-Datei frisch, setzt je Szenario Eingaben, lässt alle Formeln
mit der Bibliothek `formulas` rechnen und vergleicht mit einer unabhängigen
Python-Nachrechnung der Spielregeln.

Aufruf:  .venv/bin/python -m unittest tools/tabellenmodell/test_tabellenmodell.py
"""

import sys
import tempfile
import unittest
from pathlib import Path

import formulas
from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_tabellenmodell as bt  # noqa: E402

STANDARD = {name: wert for name, _t, wert, *_r in bt.STARTWERTE}


# --- Unabhängige Nachrechnung -------------------------------------------
def referenz(p, runden):
    """runden: Liste von (pachten, bohren, ergebnis, groesse) je Runde."""
    bar, schuld = p["start_cash"], 0.0
    gepachtet, trocken, pleite, fund_nr = 0, 0, False, 0
    quellen = []  # dicts: runde, r0, rest, silas
    zeilen = []
    for r, (pachten, bohren, ergebnis, groesse) in enumerate(runden, start=1):
        alt_bezahlt = max(0, gepachtet - p["free_leases"])
        gepachtet += pachten
        k_pacht = (max(0, gepachtet - p["free_leases"]) - alt_bezahlt) * p["lease_bonus"]
        k_bohr = bohren * p["drill_cost"]
        zinsen = schuld * p["rate"] / 4
        foerd = silas_bbl = 0.0
        for q in quellen:
            alter = r - q["runde"] - 1
            if alter < 0 or q["r0"] <= 0:
                continue
            menge = min(q["rest"], p["q0"] * p["days"] * (1 - p["decline"]) ** alter
                        * q["rest"] / q["r0"])
            q["rest"] -= menge
            foerd += menge
            if q["silas"]:
                silas_bbl += menge
        erloes = foerd * (p["price"] - p["transport"])
        foerderzins = foerd * p["price"] * p["royalty"]
        silas = silas_bbl * (p["price"] - p["transport"] - p["price"] * p["royalty"]) \
            * p["silas_share"]
        vor = bar + erloes - foerderzins - silas - k_pacht - k_bohr - zinsen
        kredit = min(-vor, max(0, p["credit_limit"] - schuld)) if vor < 0 else 0
        tilgung = min(vor, schuld) if (p["auto_repay"] == 1 and vor > 0) else 0
        schuld = schuld + kredit - tilgung
        bar = vor + kredit - tilgung
        if bohren == 1 and ergebnis == "Trocken":
            trocken += 1
        pleite = pleite or bar < 0
        if bohren == 1 and ergebnis == "Fund":
            fund_nr += 1
            quellen.append(dict(runde=r, r0=groesse, rest=groesse,
                                silas=fund_nr <= p["silas_wells"]))
        zeilen.append(dict(bar=bar, schuld=schuld, foerd=foerd, zinsen=zinsen,
                           trocken=trocken, status="PLEITE" if pleite else "ok"))
    return zeilen


def referenz_pleiterechner(p, kosten, rahmen):
    summe = 0.0
    bezahlbar = 0
    for r in range(1, bt.RUNDEN + 1):
        zins = max(0, summe - p["start_cash"]) * p["rate"] / 4 if r > 1 else 0
        summe += kosten + (p["lease_bonus"] if r > p["free_leases"] else 0) + zins
        if summe <= p["start_cash"] + rahmen:
            bezahlbar += 1
    return bezahlbar


# --- Tabelle rechnen lassen ----------------------------------------------
def rechne(startwerte=None, runden=None):
    tmp = Path(tempfile.mkdtemp()) / "modell.xlsx"
    bt.baue(tmp)
    wb = load_workbook(tmp)
    for i, (name, *_r) in enumerate(bt.STARTWERTE):
        if startwerte and name in startwerte:
            wb["Startwerte"][f"B{bt.ERSTE_STARTZEILE + i}"] = startwerte[name]
    if runden:
        ws = wb["Runden"]
        for r, (pachten, bohren, ergebnis, groesse) in enumerate(runden, start=1):
            z = bt.rz(r)
            ws[f"C{z}"], ws[f"D{z}"], ws[f"E{z}"], ws[f"F{z}"] = pachten, bohren, ergebnis, groesse
    wb.save(tmp)
    sol = formulas.ExcelModel().loads(str(tmp)).finish().calculate()
    werte = {}
    for k, v in sol.items():
        if "!" in k and ":" not in k:
            blatt, zelle = k.split("]", 1)[1].split("!")
            werte[(blatt.strip("'").upper(), zelle)] = v.value[0, 0]

    def get(blatt, zelle):
        return werte[(blatt.upper(), zelle)]
    return get


PECHSTRAEHNE = [(1, 1, "Trocken", 200000)] * bt.RUNDEN


class Basis(unittest.TestCase):
    def vergleiche(self, get, p, runden):
        ref = referenz(p, runden)
        for r, erw in enumerate(ref, start=1):
            z = bt.rz(r)
            with self.subTest(runde=r):
                self.assertAlmostEqual(get("Runden", f"V{z}"), erw["bar"], places=4)
                self.assertAlmostEqual(get("Runden", f"U{z}"), erw["schuld"], places=4)
                self.assertAlmostEqual(get("Runden", f"L{z}"), erw["foerd"], places=4)
                self.assertAlmostEqual(get("Runden", f"K{z}"), erw["zinsen"], places=4)
                self.assertEqual(get("Runden", f"W{z}"), erw["trocken"])
                self.assertEqual(get("Runden", f"X{z}"), erw["status"])
        return ref


class TestStandard(Basis):
    """Vorgabe: Pechsträhne mit den Startwerten aus GDD §15."""

    @classmethod
    def setUpClass(cls):
        cls.get = staticmethod(rechne())

    def test_startwerte_aus_gdd(self):
        self.assertEqual(STANDARD["start_cash"], 2000)
        self.assertEqual(STANDARD["royalty"], 0.125)
        self.assertEqual(STANDARD["silas_share"], 0.30)
        self.assertTrue(1500 <= STANDARD["drill_cost"] <= 3000)
        self.assertTrue(0.08 <= STANDARD["decline"] <= 0.15)
        self.assertTrue(0.10 <= STANDARD["hit_rate"] <= 0.20)

    def test_alle_runden_wie_referenz(self):
        self.vergleiche(self.get, STANDARD, PECHSTRAEHNE)

    def test_pleite_nach_zwei_trockenbohrungen(self):
        # Runde 1: 2.000 $ bar weg. Runde 2: 2.000 $ Kredit. Runde 3: 2.000 + 150 Pacht
        # + 50 Zins = 2.200 $, aber nur noch 1.000 $ Kreditrahmen -> pleite.
        s = bt.rz(bt.RUNDEN) + 2
        self.assertEqual(self.get("Runden", f"G{s+1}"), 3)
        self.assertEqual(self.get("Runden", f"G{s+2}"), 2)
        self.assertAlmostEqual(self.get("Runden", f"V{bt.rz(3)}"), -1200)

    def test_pacht_erst_nach_freien_optionen(self):
        self.assertEqual(self.get("Runden", f"I{bt.rz(1)}"), 0)
        self.assertEqual(self.get("Runden", f"I{bt.rz(2)}"), 0)
        self.assertEqual(self.get("Runden", f"I{bt.rz(3)}"), 150)

    def test_pleiterechner_wie_referenz(self):
        for i, kosten in enumerate(bt.PR_KOSTEN):
            for k, rahmen in enumerate(bt.PR_RAHMEN):
                zelle = f"{'CDEF'[k]}{6 + i}"
                n = referenz_pleiterechner(STANDARD, kosten, rahmen)
                with self.subTest(kosten=kosten, rahmen=rahmen):
                    self.assertEqual(self.get("Pleiterechner", zelle), n)
                    self.assertAlmostEqual(self.get("Pleiterechner", f"{'CDEF'[k]}{13 + i}"),
                                           (1 - STANDARD["hit_rate"]) ** n)

    def test_pleiterechner_passt_zum_rundenblatt(self):
        # 2.000 $ Bohrkosten, 3.000 $ Rahmen = Standardszenario im Rundenblatt
        self.assertEqual(self.get("Pleiterechner", "D7"), 2)

    def test_ohne_kredit_eine_trockenbohrung(self):
        self.assertEqual(self.get("Pleiterechner", "C7"), 1)


class TestFund(Basis):
    """Fund in Runde 1 (klein, 200.000 bbl), danach drei Trockenbohrungen, dann Pause."""

    RUNDEN = ([(0, 1, "Fund", 200000)] + [(1, 1, "Trocken", 0)] * 3
              + [(0, 0, "Trocken", 0)] * (bt.RUNDEN - 4))

    @classmethod
    def setUpClass(cls):
        cls.get = staticmethod(rechne(runden=cls.RUNDEN))

    def test_alle_runden_wie_referenz(self):
        ref = self.vergleiche(self.get, STANDARD, self.RUNDEN)
        self.assertEqual(ref[-1]["status"], "ok")

    def test_foerderung_startet_in_folgerunde(self):
        self.assertEqual(self.get("Runden", f"L{bt.rz(1)}"), 0)
        # q0 · Tage, Restreserve noch voll: 150 · 91 = 13.650 bbl
        self.assertAlmostEqual(self.get("Runden", f"L{bt.rz(2)}"), 13650)

    def test_rueckgang_und_reserve(self):
        q2, q3 = (self.get("Runden", f"L{bt.rz(r)}") for r in (2, 3))
        rest = 200000 - 13650
        self.assertAlmostEqual(q3, 13650 * (1 - 0.12) * rest / 200000)
        self.assertLess(q3, q2)

    def test_silas_bekommt_anteil(self):
        z = bt.rz(2)
        erwartet = 13650 * (1.00 - 0.25 - 0.125) * 0.30
        self.assertAlmostEqual(self.get("Runden", f"P{z}"), erwartet)
        self.assertAlmostEqual(self.get("Runden", f"O{z}"), 13650 * 0.125)


class TestTascheUndTilgung(Basis):
    """Kleine Tasche (20.000 bbl), drei Funde (dritter ohne Silas), automatische Tilgung."""

    RUNDEN = ([(1, 1, "Trocken", 0), (1, 1, "Fund", 20000), (1, 1, "Fund", 20000),
               (1, 1, "Fund", 2000000)] + [(0, 0, "Trocken", 0)] * (bt.RUNDEN - 4))
    P = dict(STANDARD, auto_repay=1, credit_limit=6000, q0=500)

    @classmethod
    def setUpClass(cls):
        cls.get = staticmethod(rechne(startwerte=cls.P, runden=cls.RUNDEN))

    def test_alle_runden_wie_referenz(self):
        self.vergleiche(self.get, self.P, self.RUNDEN)

    def test_tasche_nie_mehr_als_reserve(self):
        gesamt = sum(self.get("Quellen", f"B{bt.q_zeile(r)}") for r in range(1, 17))
        self.assertEqual(gesamt, 0)  # Runde 1 trocken: keine Quelle
        tasche = sum(self.get("Quellen", f"C{bt.q_zeile(r)}") for r in range(1, 17))
        self.assertLessEqual(tasche, 20000 + 1e-6)
        self.assertGreater(tasche, 0)

    def test_dritter_fund_ohne_silas(self):
        self.assertEqual(self.get("Quellen", "C6"), 1)
        self.assertEqual(self.get("Quellen", "D6"), 1)
        self.assertEqual(self.get("Quellen", "E6"), 0)

    def test_schuld_wird_getilgt(self):
        self.assertEqual(self.get("Runden", f"U{bt.rz(bt.RUNDEN)}"), 0)


class TestOhneKredit(Basis):
    P = dict(STANDARD, credit_limit=0)

    @classmethod
    def setUpClass(cls):
        cls.get = staticmethod(rechne(startwerte=cls.P))

    def test_pleite_nach_einer_trockenbohrung(self):
        self.vergleiche(self.get, self.P, PECHSTRAEHNE)
        s = bt.rz(bt.RUNDEN) + 2
        self.assertEqual(self.get("Runden", f"G{s+1}"), 2)
        self.assertEqual(self.get("Runden", f"G{s+2}"), 1)


if __name__ == "__main__":
    unittest.main()
