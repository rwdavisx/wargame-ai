// Online play: tell the player it is their move again (a buzz on phones that allow it, a bugle call, and the
// page title while the page is in the background).
import { sfx } from './sound';

const MARK = '● Your move · ';
let base: string | null = null;

function clearTitle() {
  if (base !== null && !document.hidden) {
    document.title = base;
    base = null;
  }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', clearTitle);

export function yourMoveAlert(): void {
  try {
    navigator.vibrate?.([90, 60, 90]);
  } catch {
    /* not allowed here */
  }
  sfx.yourMove();
  if (document.hidden && base === null) {
    base = document.title;
    document.title = MARK + base;
  }
}
