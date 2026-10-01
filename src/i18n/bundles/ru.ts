// Every namespace of one language, as one lazily loaded chunk — see
// src/i18n/index.ts. A new namespace goes here, in all three bundles, and in
// NAMESPACES there.
import common from '@/locales/ru/common.json';
import auth from '@/locales/ru/auth.json';
import doctor from '@/locales/ru/doctor.json';
import lab from '@/locales/ru/lab.json';
import clinic from '@/locales/ru/clinic.json';
import admin from '@/locales/ru/admin.json';
import landing from '@/locales/ru/landing.json';
import errors from '@/locales/ru/errors.json';

export default { common, auth, doctor, lab, clinic, admin, landing, errors };
