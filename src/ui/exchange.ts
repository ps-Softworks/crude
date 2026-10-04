// Lädt die Texte der Börse (4.15) aus content/exchange.yaml für die Oberfläche.
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import exchangeText from '../../content/exchange.yaml?raw';
import { formatContentError } from '../sim/eventContent';
import { parseExchangeContent } from '../sim/exchangeContent';
import { balance } from './balance';

const { content, errors } = parseExchangeContent(
  'content/exchange.yaml',
  exchangeText,
  balance.exchange.stocks.map((s) => s.id),
);
if (!content) throw new Error(errors.map(formatContentError).join('\n'));

export const exchangeContent = content;
