// SPDX-FileCopyrightText: 2026 Ben Richardson <https://benrichardson.dev>
// SPDX-License-Identifier: AGPL-3.0-or-later
// Based on au-spectrum by Ben Richardson — https://benrichardson.dev

/**
 * Every overlay on this site — the About modal, the holder drawer, the site
 * drawer — is created here, so the dismissal contract is implemented once.
 *
 * A visitor who opens an overlay must ALWAYS be able to get out of it, and one
 * exit is not enough:
 *   1. a ✕ control at least 44×44, inside the overlay's own bounds;
 *   2. a tap anywhere outside the panel, wired to `pointerdown` so it covers
 *      mouse, touch and pen in one handler;
 *   3. Escape, from anywhere on the page;
 *   4. a scrim that is genuinely reachable — fixed, inset 0, below the panel and
 *      above the page, and never `pointer-events: none`.
 *
 * Two failure modes this shape avoids on purpose. Attaching both `touchstart`
 * and `click` to the same control double-fires on a phone, so the overlay closes
 * and instantly reopens and the user sees a dead button — hence exactly one
 * event family per control. And the overlay is REMOVED from the DOM when closed
 * rather than translated off-screen, because a closed panel at
 * `translateX(100%)` is still a real box on iOS Safari and scrolls the page
 * sideways.
 */

let openCount = 0;

export interface Overlay {
  panel: HTMLElement;
  close: () => void;
}

export function openOverlay(kind: 'modal' | 'drawer', title: string, body: string, onClose?: () => void): Overlay {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';

  const panel = document.createElement('div');
  panel.className = kind;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  panel.innerHTML = `<button class="${kind}-close" aria-label="Close">✕</button>${body}`;

  document.body.appendChild(scrim);
  document.body.appendChild(panel);
  openCount++;

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    openCount--;
    document.removeEventListener('keydown', onKey);
    scrim.remove();
    panel.remove();
    onClose?.();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  };

  // pointerdown, not click: fires for touch and pen, and fires in places a
  // synthetic click never reaches.
  scrim.addEventListener('pointerdown', close);
  panel.querySelector(`.${kind}-close`)?.addEventListener('pointerdown', (e) => { e.preventDefault(); close(); });
  document.addEventListener('keydown', onKey);

  // Focus the close control so a keyboard user's first Tab is inside the dialog.
  (panel.querySelector(`.${kind}-close`) as HTMLElement | null)?.focus();

  return { panel, close };
}

export function overlaysOpen(): number { return openCount; }
