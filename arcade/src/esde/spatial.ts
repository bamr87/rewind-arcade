import { useEffect, type RefObject } from 'react';
import { padEnabled, padRoles, subscribePad } from '../engine/gamepad';

/**
 * Gamepad navigation for the pages that are ordinary DOM rather than a cabinet view —
 * the lobby, catalog, atlas, profile and settings.
 *
 * This is deliberately pad-only. A keyboard user's arrow keys already scroll the page,
 * and stealing them to move a focus ring would be a regression; a pad has no other way
 * to reach a button, so it gets one. Nothing here knows what any page contains: it
 * picks the nearest focusable element in the direction pressed, which means a new page
 * is navigable the moment it renders.
 */

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Dir = 'up' | 'down' | 'left' | 'right';

function visible(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function targets(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
}

const midX = (r: DOMRect) => r.left + r.width / 2;
const midY = (r: DOMRect) => r.top + r.height / 2;

/**
 * Nearest candidate in `dir`: distance along the axis pressed, plus a penalty for
 * drifting across it. Sharing a row (or column) with the current element counts as
 * being in line and is preferred, which is what keeps a grid feeling like a grid.
 */
function nearest(from: DOMRect, list: HTMLElement[], dir: Dir): HTMLElement | undefined {
  let best: HTMLElement | undefined;
  let bestScore = Infinity;
  for (const el of list) {
    const r = el.getBoundingClientRect();
    const dx = midX(r) - midX(from);
    const dy = midY(r) - midY(from);
    const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (along <= 1) continue;
    const horizontal = dir === 'left' || dir === 'right';
    const across = Math.abs(horizontal ? dy : dx);
    const overlap = horizontal
      ? Math.min(from.bottom, r.bottom) - Math.max(from.top, r.top)
      : Math.min(from.right, r.right) - Math.max(from.left, r.left);
    const score = along + across * (overlap > 0 ? 0.25 : 2.5);
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return best;
}

/** First target already on screen, so a fresh page starts at the top rather than mid-scroll. */
function firstOnScreen(list: HTMLElement[]): HTMLElement | undefined {
  const h = window.innerHeight;
  return list.find((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < h;
  }) ?? list[0];
}

function scroller(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

export function useSpatialNav(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    // The ring is drawn from this attribute rather than :focus-visible, which browsers
    // only raise for real key presses and so never shows for a programmatic focus.
    let marked: HTMLElement | null = null;
    const mark = (el: HTMLElement) => {
      marked?.removeAttribute('data-pad-focus');
      el.dataset.padFocus = '1';
      marked = el;
    };
    const clear = () => {
      marked?.removeAttribute('data-pad-focus');
      marked = null;
    };

    const move = (dir: Dir) => {
      const root = ref.current;
      if (!root) return;
      const list = targets(root);
      if (!list.length) return;
      const current = document.activeElement as HTMLElement | null;
      const here = current && list.includes(current) ? current : null;
      const next = here ? nearest(here.getBoundingClientRect(), list, dir) : firstOnScreen(list);
      if (!next) {
        // Nothing that way: keep long pages readable by scrolling instead of stalling.
        const box = here ? scroller(here) : null;
        const by = dir === 'up' ? -260 : dir === 'down' ? 260 : 0;
        if (by) (box ?? window).scrollBy({ top: by });
        return;
      }
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      mark(next);
    };

    const off = subscribePad((e) => {
      if (!e.down || !padEnabled()) return;
      const { confirm } = padRoles();
      if (e.button === confirm) {
        if (e.repeat) return;
        const el = document.activeElement as HTMLElement | null;
        if (el && ref.current?.contains(el)) el.click();
        return;
      }
      if (e.button === 'up' || e.button === 'down' || e.button === 'left' || e.button === 'right') {
        move(e.button);
      }
    });

    return () => {
      off();
      clear();
    };
  }, [ref, active]);
}
