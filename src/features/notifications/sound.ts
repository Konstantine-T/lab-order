/**
 * The notification chime: only while the tab is hidden, only after the
 * viewer has interacted with the page once (browsers refuse audio before
 * that), never more than once per burst, and mutable.
 *
 * The mute choice is a per-viewer preference, so it lives in this browser.
 * Every storage access is guarded: private windows and blocked site data
 * throw, and the page must work without it.
 */
const MUTE_KEY = 'lab-order:notifications-muted';
const SOUND_URL = '/notification.mp3';
/** One chime for a lab save that writes three rows. */
const MIN_GAP_MS = 2_000;

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean) {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* storage blocked: the choice lasts for this page only */
  }
}

let unlocked = false;
let audio: HTMLAudioElement | null = null;
let lastPlayed = 0;

/** Arms the chime on the first gesture; returns the cleanup. */
export function listenForFirstGesture(): () => void {
  if (unlocked || typeof window === 'undefined') return () => {};
  const unlock = () => {
    unlocked = true;
    remove();
  };
  const events = ['pointerdown', 'keydown', 'touchstart'] as const;
  const remove = () => events.forEach((e) => window.removeEventListener(e, unlock, true));
  events.forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
  return remove;
}

export function playChime(muted: boolean) {
  if (muted || !unlocked || typeof document === 'undefined' || !document.hidden) return;
  const now = Date.now();
  if (now - lastPlayed < MIN_GAP_MS) return;
  lastPlayed = now;
  try {
    audio ??= new Audio(SOUND_URL);
    audio.volume = 0.6;
    audio.currentTime = 0;
    // A refusal (autoplay policy, no output device) is not worth a console line.
    void audio.play()?.catch(() => {});
  } catch {
    /* no Audio in this environment */
  }
}
