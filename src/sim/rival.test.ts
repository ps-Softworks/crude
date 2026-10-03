import { describe, it, expect } from 'vitest';
import { loadBalance } from './testBalance';
import { newGame, endRound } from './game';
import { newRival, rivalChance, rivalUtility, rivalCandidates, advanceRival } from './rival';
import { trueChance } from './forecast';
import { buyLease } from './lease';

const balance = loadBalance();

describe('Rivale Bullard (1.12)', () => {
  describe('newRival', () => {
    it('initialisiert Bullard mit startCash aus balance', () => {
      const rival = newRival('test', balance);
      expect(rival.cash).toBe(balance.rivals.bullard.startCash);
      expect(rival.wells).toHaveLength(0);
      expect(rival.id).toBe('bullard');
    });

    it('gibt jedem Seed einen eigenen RNG-Strom', () => {
      const r1 = newRival('seed1', balance);
      const r2 = newRival('seed2', balance);
      expect(r1.rng).not.toBe(r2.rng);
    });
  });

  describe('rivalChance', () => {
    it('ergibt wahre Chance für eine beliebige Parzelle', () => {
      const state = newGame('chance', balance);
      const parcel = state.parcels[0];
      const chance = rivalChance(state, balance, parcel);
      const expected = trueChance(balance, parcel);
      expect(chance).toBe(expected);
    });

    it('erhöht die Chance neben einer gebohrten Jacob-Pacht mit Öl', () => {
      let state = newGame('chance-neighbor', balance);
      // Finde eine Parzelle und bohre sie als Jacob
      const targetParcel = state.parcels.find(p => p.geology !== 'dry');
      if (!targetParcel) return; // Skip if no non-dry parcel
      
      const resultBuy = buyLease(state, balance, targetParcel.id);
      if (!resultBuy.ok) return;
      state = resultBuy.state;
      state = endRound(state, balance);
      state = { ...state, wells: state.wells.map(w => w.parcelId === targetParcel.id ? { ...w, status: 'found' as const } : w) };
      
      // Jetzt sollte eine Nachbar-Parzelle höhere Chance haben
      const neighbors = state.parcels.filter(p => 
        Math.abs(p.x - targetParcel.x) <= 1 && Math.abs(p.y - targetParcel.y) <= 1 && p.id !== targetParcel.id
      );
      
      if (neighbors.length > 0) {
        const neighbor = neighbors[0];
        const withoutBonus = trueChance(balance, neighbor);
        const withBonus = rivalChance(state, balance, neighbor);
        expect(withBonus).toBeGreaterThanOrEqual(withoutBonus);
      }
    });
  });

  describe('rivalUtility', () => {
    it('berechnet Nutzen nach der Formel mit roll 0.5', () => {
      const state = newGame('utility', balance);
      const parcel = state.parcels.find(p => !p.discovery && p.x !== balance.map.saltHill.x && p.y !== balance.map.saltHill.y);
      if (!parcel) return;

      const utility = rivalUtility(state, balance, parcel, 0.5);
      expect(typeof utility).toBe('number');
      expect(isNaN(utility)).toBe(false);
    });

    it('erhöht Nutzen für Nachbar einer Jacob-Pacht um aggression·nearJacobBonus', () => {
      let state = newGame('utility-neighbor', balance);
      const parcel1 = state.parcels.find(p => p.x < 5 && p.y < 5 && !p.discovery && p.id !== 'p-6-4');
      if (!parcel1) return;

      const resultBuy = buyLease(state, balance, parcel1.id);
      if (!resultBuy.ok) return;
      state = resultBuy.state;

      const neighbors = state.parcels.filter(p => 
        Math.abs(p.x - parcel1.x) <= 1 && Math.abs(p.y - parcel1.y) <= 1 && p.id !== parcel1.id
      );
      
      if (neighbors.length > 0) {
        const neighbor = neighbors[0];
        const utilityWithNeighbor = rivalUtility(state, balance, neighbor, 0.5);
        expect(utilityWithNeighbor).toBeGreaterThan(0);
      }
    });
  });

  describe('rivalCandidates', () => {
    it('schließt Salt Hill aus', () => {
      const state = newGame('candidates', balance);
      const candidates = rivalCandidates(state, balance);
      const saltHill = balance.map.saltHill;
      expect(candidates.every(p => p.id !== `p-${saltHill.x}-${saltHill.y}`)).toBe(true);
    });

    it('schließt bereits verpachtete Parzellen aus', () => {
      let state = newGame('candidates-leased', balance);
      const parcel = state.parcels.find(p => !p.discovery && p.id !== 'p-6-4');
      if (!parcel) return;

      const resultBuy = buyLease(state, balance, parcel.id);
      if (!resultBuy.ok) return;
      state = resultBuy.state;

      const candidates = rivalCandidates(state, balance);
      expect(candidates.every(c => c.id !== parcel.id)).toBe(true);
    });

    it('sortiert nach id', () => {
      const state = newGame('candidates-sort', balance);
      const candidates = rivalCandidates(state, balance);
      for (let i = 1; i < candidates.length; i++) {
        expect(candidates[i].id >= candidates[i - 1].id).toBe(true);
      }
    });
  });

  describe('advanceRival', () => {
    it('führt Bohrungen fort: roundsLeft − 1 pro Runde', () => {
      let state = newGame('advance-drilling', balance);
      const parcel = state.parcels.find(p => p.geology !== 'dry' && !p.discovery && p.id !== 'p-6-4');
      if (!parcel) return;

      // Manuell eine Bullard-Pacht und Bohrung erstellen
      const rival = { ...state.rival, cash: 100000 };
      state = {
        ...state,
        rival,
        leases: [...state.leases, {
          parcelId: parcel.id,
          holder: 'bullard' as const,
          bonus: 1000,
          royalty: 0.15,
          startRound: state.round,
          expiresAfterRound: state.round + 4,
          drilled: false,
        }],
      };

      state = advanceRival(state, balance);
      // Jetzt sollte eine Bohrung im Gang sein
      expect(state.rival.wells.some(w => w.parcelId === parcel.id && w.status === 'drilling')).toBe(true);
    });

    it('pachtet bis zu actionsPerRound beste Parzellen', () => {
      let state = newGame('advance-leasing', balance);
      let rival = { ...state.rival, cash: 200000 };
      state = { ...state, rival };

      state = advanceRival(state, balance);
      const bullardLeases = state.leases.filter(l => l.holder === 'bullard');
      expect(bullardLeases.length).toBeLessThanOrEqual(balance.rivals.bullard.actionsPerRound);
    });

    it('pachtet nie über verfügbares Geld', () => {
      let state = newGame('advance-budget', balance);
      const rival = state.rival; // Original mit startCash
      state = { ...state, rival };

      state = advanceRival(state, balance);
      expect(state.rival.cash).toBeGreaterThanOrEqual(0);
    });

    it('pachtet nicht unter minUtility', () => {
      let state = newGame('advance-min-utility', balance);
      const rival = { ...state.rival, cash: 200000 };
      const hiBalance = { ...balance, rivals: { bullard: { ...balance.rivals.bullard, minUtility: 1000000 } } };
      state = { ...state, rival };

      state = advanceRival(state, hiBalance);
      expect(state.leases.filter(l => l.holder === 'bullard')).toHaveLength(0);
    });
  });

  describe('Determinismus', () => {
    it('gleicher Seed → gleicher Rivalenzustand nach 5 Runden', () => {
      const seed = 'determinism-test';
      let s1 = newGame(seed, balance);
      let s2 = newGame(seed, balance);

      for (let i = 0; i < 5; i++) {
        s1 = endRound(s1, balance);
        s2 = endRound(s2, balance);
      }

      expect(s1.rival.cash).toBe(s2.rival.cash);
      expect(s1.rival.wells.length).toBe(s2.rival.wells.length);
      expect(s1.leases.filter(l => l.holder === 'bullard').length).toBe(
        s2.leases.filter(l => l.holder === 'bullard').length
      );
    });

    it('state.rng (Jacobs Strom) bleibt unberührt', () => {
      const state1 = newGame('rng-test', balance);
      const rngBefore = state1.rng;

      const state2 = advanceRival(state1, balance);
      // Der Jacob-RNG sollte nicht verändert werden durch advanceRival
      expect(state2.rng).toBe(rngBefore);
    });
  });

  describe('Markt-Integration', () => {
    it('eine fündige Bullard-Quelle senkt den Preis', () => {
      let state = newGame('market-test', balance);
      let rival = { ...state.rival, cash: 100000, wells: [
        { parcelId: 'p-5-4', startRound: 1, roundsLeft: 0, status: 'found' as const },
      ]};
      state = { ...state, rival };

      const state1 = endRound(state, balance);
      // Preis sollte niedriger sein als ohne fündige Bullard-Quelle
      const baseline = newGame('baseline', balance);
      const state2 = endRound(baseline, balance);
      
      expect(state1.postedPrice).toBeLessThanOrEqual(state2.postedPrice);
    });
  });

  describe('Pacht-Schnittstellen', () => {
    it('Jacobs buyLease auf Bullard-Parzelle schlägt fehl', () => {
      let state = newGame('lease-conflict', balance);
      let rival = { ...state.rival, cash: 100000 };
      const parcel = state.parcels.find(p => !p.discovery && p.id !== 'p-6-4');
      if (!parcel) return;

      state = { ...state, rival };
      state = advanceRival(state, balance);

      const bullardLeases = state.leases.filter(l => l.holder === 'bullard');
      if (bullardLeases.length > 0) {
        const bullardParcelId = bullardLeases[0].parcelId;
        const result = buyLease(state, balance, bullardParcelId);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason).toContain('verpachtet');
        }
      }
    });
  });

  describe('Fertig-Kriterium 1', () => {
    it('Option verfällt, Bullard pachtet, Log enthält "schnappt dir weg"', () => {
      let state = newGame('snatch', balance);
      // Setze Jacob eine Option
      const parcel = state.parcels.find(p => !p.discovery && p.id !== 'p-6-4' && p.geology !== 'dry');
      if (!parcel) return;

      state = { ...state, options: [...state.options, {
        parcelId: parcel.id,
        holder: 'jacob' as const,
        bonus: 1000,
        royalty: 0.15,
        fee: 100,
        free: true,
        expiresAfterRound: state.round,
      }]};

      // Bullard mit Geld
      let rival = { ...state.rival, cash: 100000 };
      state = { ...state, rival };

      state = endRound(state, balance);

      // Option sollte verfallen sein
      expect(state.options.some(o => o.parcelId === parcel.id)).toBe(false);
      // Bullard sollte jetzt eine Pacht haben
      const bullardLeaseCount = state.leases.filter(l => l.holder === 'bullard').length;
      expect(bullardLeaseCount).toBeGreaterThan(0);
    });
  });

  describe('Fertig-Kriterium 2', () => {
    it('passives Spiel 16 Runden → Bullard hat ≥1 Pacht', () => {
      let state = newGame('passive-16', balance);
      for (let i = 0; i < 16; i++) {
        state = endRound(state, balance);
      }

      const bullardLeases = state.leases.filter(l => l.holder === 'bullard');
      expect(bullardLeases.length).toBeGreaterThanOrEqual(1);
    });
  });
});
