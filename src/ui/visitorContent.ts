// Besetzung der Ereignisse für die Oberfläche (0.2.15+10): wer als Besucher kommt,
// was als Szene – aus content/events („visitor“, „tableau“) und content/figures.yaml.
import { events } from './events';
import { figureCatalog } from './figureContent';
import { appearancesOf } from './visitors';

export const appearances = appearancesOf(events, figureCatalog);
