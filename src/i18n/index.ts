import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/ka';
import 'dayjs/locale/ru';

import enCommon from '@/locales/en/common.json';
import enAuth from '@/locales/en/auth.json';
import enDoctor from '@/locales/en/doctor.json';
import enLab from '@/locales/en/lab.json';
import enClinic from '@/locales/en/clinic.json';
import enAdmin from '@/locales/en/admin.json';
import enLanding from '@/locales/en/landing.json';
import enErrors from '@/locales/en/errors.json';

import kaCommon from '@/locales/ka/common.json';
import kaAuth from '@/locales/ka/auth.json';
import kaDoctor from '@/locales/ka/doctor.json';
import kaLab from '@/locales/ka/lab.json';
import kaClinic from '@/locales/ka/clinic.json';
import kaAdmin from '@/locales/ka/admin.json';
import kaLanding from '@/locales/ka/landing.json';
import kaErrors from '@/locales/ka/errors.json';

import ruCommon from '@/locales/ru/common.json';
import ruAuth from '@/locales/ru/auth.json';
import ruDoctor from '@/locales/ru/doctor.json';
import ruLab from '@/locales/ru/lab.json';
import ruClinic from '@/locales/ru/clinic.json';
import ruAdmin from '@/locales/ru/admin.json';
import ruLanding from '@/locales/ru/landing.json';
import ruErrors from '@/locales/ru/errors.json';

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ka', label: 'ქართული', flag: '🇬🇪' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

const SUPPORTED_CODES = LANGUAGES.map((l) => l.code) as readonly string[];

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

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map((l) => l.code),
    ns: ['common', 'auth', 'doctor', 'lab', 'clinic', 'admin', 'landing', 'errors'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lab-order:lang',
      caches: ['localStorage'],
    },
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        doctor: enDoctor,
        lab: enLab,
        clinic: enClinic,
        admin: enAdmin,
        landing: enLanding,
        errors: enErrors,
      },
      ka: {
        common: kaCommon,
        auth: kaAuth,
        doctor: kaDoctor,
        lab: kaLab,
        clinic: kaClinic,
        admin: kaAdmin,
        landing: kaLanding,
        errors: kaErrors,
      },
      ru: {
        common: ruCommon,
        auth: ruAuth,
        doctor: ruDoctor,
        lab: ruLab,
        clinic: ruClinic,
        admin: ruAdmin,
        landing: ruLanding,
        errors: ruErrors,
      },
    },
  });

i18n.on('languageChanged', (lng) => {
  dayjs.locale(lng);
  document.documentElement.lang = lng;
});

dayjs.locale(i18n.resolvedLanguage ?? 'en');
document.documentElement.lang = i18n.resolvedLanguage ?? 'en';

export default i18n;
