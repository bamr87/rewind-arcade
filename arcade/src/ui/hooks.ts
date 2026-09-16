import { useCallback, useSyncExternalStore } from 'react';
import { audio } from '../engine/audio';
import { getPads, subscribePads, type PadInfo } from '../engine/gamepad';

/** Global mute, shared by the shell, the HUD, settings, and the command palette. */
export function useMuted(): [boolean, () => void] {
  const muted = useSyncExternalStore(audio.subscribe, () => audio.muted, () => audio.muted);
  const toggle = useCallback(() => {
    audio.ensure();
    audio.setMuted(!audio.muted);
  }, []);
  return [muted, toggle];
}

/**
 * Connected gamepads. Browsers only reveal a pad once the page has seen a gesture, so
 * this is empty until the first button press — which is why the UI asks for one rather
 * than reporting "no controller".
 */
export function useGamepads(): PadInfo[] {
  return useSyncExternalStore(subscribePads, getPads, getPads);
}
