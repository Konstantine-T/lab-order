import i18n, { type Callback, type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
// A few KB, and kept here rather than in the language bundles: they import
// dayjs from this chunk, so the bundles' hashes would change on every deploy
// instead of only when a string does.
import 'dayjs/locale/ka';
import 'dayjs/locale/ru';
import { reloadForStaleChunk } from '@/routes/chunkReload';

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ka', label: 'ქართული', flag: '🇬🇪' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const SUPPORTED_CODES = LANGUAGES.map((l) => l.code) as readonly string[];
const isLanguageCode = (code: unknown): code is LanguageCode =>
  typeof code === 'string' && SUPPORTED_CODES.includes(code);

const NAMESPACES = ['common', 'auth', 'doctor', 'lab', 'clinic', 'admin', 'landing', 'errors'] as const;
const FALLBACK: LanguageCode = 'en';

/**
 * LOADING ONE LANGUAGE, NOT THREE
 *
 * Each language's eight namespaces are one chunk (`./bundles/<code>.ts`), and
 * a visitor downloads only the language they are reading:
 *
 *   - Boot: the language detector picks the code (localStorage, then the
 *     browser), and `main.tsx` waits for `i18nReady` — that one bundle — before
 *     the first render. Nothing is painted until its strings are here, so no
 *     raw key ever shows.
 *   - Switching: `i18n.changeLanguage` (wrapped below) downloads the bundle
 *     first and only then switches, so the page stays in the old language for
 *     the length of one request instead of flashing keys. Every caller — the
 *     LanguageSwitcher, the landing nav, the account menu, the doctor's profile
 *     — goes through it without knowing.
 *   - English is still `fallbackLng`, as before, for any key a Georgian or
 *     Russian file lacks. It is fetched after first paint, when the browser is
 *     idle, rather than holding the first paint up for strings that are shown
 *     only when a translation is missing.
 */
const BUNDLES: Record<LanguageCode, () => Promise<{ default: Record<string, object> }>> = {
  en: () => import('./bundles/en'),
  ka: () => import('./bundles/ka'),
  ru: () => import('./bundles/ru'),
};

const loads = new Map<LanguageCode, Promise<void>>();

function loadLanguage(code: LanguageCode): Promise<void> {
  let load = loads.get(code);
  if (!load) {
    load = BUNDLES[code]().then(({ default: bundle }) => {
      for (const ns of NAMESPACES) i18n.addResourceBundle(code, ns, bundle[ns], true, true);
    });
    // A failed download may be tried again by the next caller.
    load.catch(() => loads.delete(code));
    loads.set(code, load);
  }
  return load;
}

// Wipe corrupted stored language codes so a stale value like "ka/ka/" can't
// resurrect itself across reloads.
try {
  const stored = localStorage.getItem('lab-order:lang');
  if (stored && !SUPPORTED_CODES.includes(stored)) {
    localStorage.removeItem('lab-order:lang');
  }
} catch {
  /* ignore — incognito or storage disabled */
}

i18n.on('languageChanged', (lng) => {
  // The language the strings actually come from: the same as `lng` unless its
  // bundle failed to load and English stands in.
  const shown = i18n.resolvedLanguage ?? lng;
  dayjs.locale(shown);
  document.documentElement.lang = shown;
});

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: FALLBACK,
    supportedLngs: LANGUAGES.map((l) => l.code),
    ns: [...NAMESPACES],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lab-order:lang',
      caches: ['localStorage'],
    },
    // Filled by loadLanguage(). An (empty) inline store keeps init synchronous
    // — the detected language is known on the next line — and tells i18next
    // there is no backend to wait for.
    resources: {},
  });

/** The bundle a language code draws its strings from: `ka-GE` → `ka`, anything unsupported → English. */
function bundleFor(lng: string | undefined): LanguageCode | null {
  if (!lng) return null;
  const [primary] = i18n.services.languageUtils.toResolveHierarchy(lng);
  return isLanguageCode(primary) ? primary : null;
}

const currentT = (): TFunction => i18n.getFixedT(i18n.language);
const switchLanguage = i18n.changeLanguage.bind(i18n);
let latestSwitch = 0;

i18n.changeLanguage = (lng?: string, callback?: Callback): Promise<TFunction> => {
  const code = bundleFor(lng);
  if (!code) return switchLanguage(lng, callback);
  const ticket = ++latestSwitch;
  return loadLanguage(code).then(
    () => {
      if (ticket === latestSwitch) return switchLanguage(lng, callback);
      // Two picks in quick succession: only the later one wins, whichever
      // bundle happens to arrive first.
      callback?.(null, currentT());
      return currentT();
    },
    (error: unknown) => {
      console.error(`[i18n] could not load the "${code}" strings`, error);
      // Most likely a tab left open across a deploy, asking for a bundle that
      // no longer exists: remember the pick and reload once into the new build.
      // Otherwise stay in the current language rather than switch to one with
      // no strings.
      if (ticket === latestSwitch) {
        reloadForStaleChunk(() => i18n.services.languageDetector?.cacheUserLanguage?.(code));
      }
      callback?.(error, currentT());
      return currentT();
    },
  );
};

function whenIdle(run: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 2000);
  }
}

/**
 * Resolves once the visitor's language is loaded and active. Never rejects:
 * if the bundle cannot be fetched it tries English, and if that fails too the
 * app still renders rather than stay blank.
 */
export const i18nReady: Promise<void> = (async () => {
  const detected = bundleFor(i18n.language) ?? FALLBACK;
  try {
    await loadLanguage(detected);
    // Re-run the switch now that the strings exist, so `resolvedLanguage`,
    // dayjs and <html lang> are computed against a filled store.
    await switchLanguage(i18n.language);
  } catch (error) {
    console.error(`[i18n] could not load the "${detected}" strings`, error);
    if (detected !== FALLBACK) {
      try {
        // Stays on the detected code, so the visitor's stored choice is kept
        // for next time; with no strings of its own it resolves to English.
        await loadLanguage(FALLBACK);
        await switchLanguage(i18n.language);
      } catch {
        /* render anyway */
      }
    }
  }
  if (!loads.has(FALLBACK)) whenIdle(() => void loadLanguage(FALLBACK).catch(() => {}));
})();

export default i18n;
