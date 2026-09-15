import { useCallback, useSyncExternalStore } from 'react';
import { audio } from '../engine/audio';

/** Global mute, shared by the shell, the HUD, settings, and the command palette. */
export function useMuted(): [boolean, () => void] {
  const muted = useSyncExternalStore(audio.subscribe, () => audio.muted, () => audio.muted);
  const toggle = useCallback(() => {
    audio.ensure();
    audio.setMuted(!audio.muted);
  }, []);
  return [muted, toggle];
}
