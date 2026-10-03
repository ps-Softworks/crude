// Lädt die Texte zum Kapitelende aus content/chapter.yaml (2.11).
// Eine kaputte Datei hält das Spiel an – npm run check:content zeigt vorher, wo es hakt.
import chapterText from '../../content/chapter.yaml?raw';
import { checkChapterMarks, parseChapterContent } from '../sim/chapter';
import { formatContentError } from '../sim/eventContent';
import { events } from './events';

const { content, errors } = parseChapterContent('content/chapter.yaml', chapterText);
const alle = content ? [...errors, ...checkChapterMarks('content/chapter.yaml', content, events)] : errors;
if (!content || alle.length > 0) throw new Error(alle.map(formatContentError).join('\n'));

export const chapterContent = content;
