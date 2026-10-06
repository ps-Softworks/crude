// React-Anschluss an den Einstellungsspeicher (src/ui/settings.ts).
import { useSyncExternalStore } from 'react';
import { getSettings, subscribeSettings, type Settings } from './settings';

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings, getSettings);
}
