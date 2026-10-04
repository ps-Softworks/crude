// 4.8: Lädt Räte, Strohmänner und Forderungstexte aus content/stocks.yaml für die Oberfläche.
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import stocksText from '../../content/stocks.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseStocksContent } from '../sim/stocksContent';
import { balance } from './balance';

const { content, errors } = parseStocksContent('content/stocks.yaml', stocksText, balance.stocks.board.seatsMax);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const stocksContent = content;
