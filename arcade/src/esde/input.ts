import { useEffect, useRef } from 'react';
import { padEnabled, padRoles, subscribePad, type PadButton } from '../engine/gamepad';

/**
 * Keyboard and gamepad for the cabinet views, as one stream of intents. A view says
 * what an action means; it never learns which device produced it.
 *
 * The pad half is just a translation of `engine/gamepad.ts` events — the poll loop,
 * auto-repeat and stick hysteresis all live there, so two mounted views can use this
 * hook without polling twice or acting on one press twice.
 */

export type EsdeAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'accept'
  | 'back'
  | 'menu'
  | 'search'
  | 'pageUp'
  | 'pageDown'
  | 'letter';

const KEYS: Record<string, EsdeAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'accept',
  NumpadEnter: 'accept',
  Backspace: 'back',
  Escape: 'back',
  F1: 'menu',
  Tab: 'menu',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
};

const REPEAT = new Set<EsdeAction>(['left', 'right', 'up', 'down', 'pageUp', 'pageDown']);

/** Which intent a pad button carries. Confirm and cancel swap with the user's layout. */
function padAction(button: PadButton): EsdeAction | undefined {
  const { confirm, cancel } = padRoles();
  if (button === confirm) return 'accept';
  if (button === cancel) return 'back';
  switch (button) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      return button;
    case 'start':
    case 'select':
      return 'menu';
    case 'north':
      return 'search';
    case 'l1':
      return 'pageUp';
    case 'r1':
      return 'pageDown';
    default:
      return undefined;
  }
}

export function useEsdeInput(
  onAction: (action: EsdeAction, letter?: string) => void,
  active: boolean,
) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!active) return;

    const fire = (action: EsdeAction, letter?: string) => {
      onActionRef.current(action, letter);
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !e.repeat) {
        e.preventDefault();
        fire('search');
        return;
      }
      const action = KEYS[e.code] ?? KEYS[e.key];
      if (action) {
        e.preventDefault();
        if (e.repeat && !REPEAT.has(action)) return;
        fire(action);
        return;
      }
      if (e.key.length === 1 && /[a-z0-9]/i.test(e.key) && !e.repeat) {
        fire('letter', e.key.toLowerCase());
      }
    };

    const offPad = subscribePad((e) => {
      if (!e.down || !padEnabled()) return;
      const action = padAction(e.button);
      // Held movement repeats; a held confirm must not launch the same game twice.
      if (!action || (e.repeat && !REPEAT.has(action))) return;
      fire(action);
    });

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      offPad();
    };
  }, [active]);
}
