/**
 * When a key press is not the page's to take. The window-level listeners — a game's
 * keys and pause, the cabinet views' arrows, letters, Enter and Backspace — check these
 * first and leave such a key alone.
 *
 * Both read the composed path rather than `e.target`: a shadow root retargets an event
 * to its host, so a key typed into the feedback dialog reaches `window` with the
 * `<fleet-feedback>` element as its target, not the textarea.
 */

/** A key typed into a form field, an editable element, or anything inside an open `<dialog>`. */
export function keyBelongsToField(e: KeyboardEvent): boolean {
  for (const node of e.composedPath()) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.isContentEditable) return true;
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      return true;
    }
    if (node instanceof HTMLDialogElement && node.open) return true;
  }
  return false;
}

// The element focus last reached with Tab. Focus a click left behind does not count, even
// though Chrome marks it :focus-visible after the next key press: in the cabinet views a
// clicked row is a stale selection, and Enter there still means "launch what is selected".
let tabbing = false;
let tabbed: EventTarget | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => { tabbing = e.key === 'Tab'; }, true);
  window.addEventListener('pointerdown', () => { tabbing = false; }, true);
  window.addEventListener('focusin', (e) => { tabbed = tabbing ? e.composedPath()[0] : null; }, true);
}

/**
 * Enter on a link or button the user reached with Tab, or Space on such a button: the
 * control's own activation, which a shortcut must not cancel. The skip link is one.
 */
export function keyActivatesFocus(e: KeyboardEvent): boolean {
  const el = e.composedPath()[0];
  if (el !== tabbed || !(el instanceof HTMLElement)) return false;
  if (e.code === 'Enter' || e.code === 'NumpadEnter') return el.matches('a[href], button, summary, [role="button"]');
  if (e.code === 'Space') return el.matches('button, summary, [role="button"]');
  return false;
}
