import { useEffect, useRef } from 'react';

export type EsdeAction =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'accept'
  | 'back'
  | 'menu'
  | 'search'
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
};

const REPEAT = new Set<EsdeAction>(['left', 'right', 'up', 'down']);

export function useEsdeInput(
  onAction: (action: EsdeAction, letter?: string) => void,
  active: boolean,
) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!active) return;
    const held = new Map<EsdeAction, number>();
    let raf = 0;
    let lastPad = 0;

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

    const poll = (t: number) => {
      raf = requestAnimationFrame(poll);
      const pads = navigator.getGamepads?.() ?? [];
      const pad = pads[0];
      if (!pad) return;
      const now = t;
      const press = (action: EsdeAction, down: boolean) => {
        if (down) {
          const prev = held.get(action);
          if (prev == null) {
            held.set(action, now);
            fire(action);
          } else if (now - prev > 280 && now - lastPad > 70) {
            lastPad = now;
            fire(action);
          }
        } else {
          held.delete(action);
        }
      };
      const b = pad.buttons;
      press('accept', Boolean(b[0]?.pressed));
      press('back', Boolean(b[1]?.pressed));
      press('menu', Boolean(b[9]?.pressed) || Boolean(b[8]?.pressed));
      press('up', Boolean(b[12]?.pressed) || pad.axes[1] < -0.55);
      press('down', Boolean(b[13]?.pressed) || pad.axes[1] > 0.55);
      press('left', Boolean(b[14]?.pressed) || pad.axes[0] < -0.55);
      press('right', Boolean(b[15]?.pressed) || pad.axes[0] > 0.55);
    };

    window.addEventListener('keydown', onKey);
    raf = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [active]);
}
