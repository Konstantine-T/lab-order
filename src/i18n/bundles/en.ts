// Every namespace of one language, as one lazily loaded chunk — see
// src/i18n/index.ts. A new namespace goes here, in all three bundles, and in
// NAMESPACES there.
import common from '@/locales/en/common.json';
import auth from '@/locales/en/auth.json';
import doctor from '@/locales/en/doctor.json';
import lab from '@/locales/en/lab.json';
import clinic from '@/locales/en/clinic.json';
import admin from '@/locales/en/admin.json';
import landing from '@/locales/en/landing.json';
import errors from '@/locales/en/errors.json';

export default { common, auth, doctor, lab, clinic, admin, landing, errors };
