// Was jedes Fenster vom Schreibtisch bekommt (0.2.15+9).

import type { LoanResult } from '../../sim/credit';
import type { GameState } from '../../sim/game';
import type { Inbox } from '../inbox';
import type { SheetBack, SheetId } from '../sceneState';

export interface SheetContext {
  game: GameState;
  inbox: Inbox;
  debug: boolean;
  debugTools: boolean;
  /** Neuer Spielstand nach einer Aktion. */
  onGame: (state: GameState) => void;
  onLoan: (result: LoanResult) => void;
  /** Gewählter Reiter (undefined: der zuletzt benutzte). */
  tab: string | undefined;
  /** Dieses Ereignis liegt beim Öffnen vorn (0.2.15+11, z. B. vom Zeichen auf der Karte). */
  focus?: string;
  onTab: (tab: string) => void;
  open: (sheet: SheetId, opts?: { tab?: string; back?: SheetBack; focus?: string }) => void;
  showOnMap: (parcelId: string) => void;
}
