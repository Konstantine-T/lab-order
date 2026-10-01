// Every namespace of one language, as one lazily loaded chunk — see
// src/i18n/index.ts. A new namespace goes here, in all three bundles, and in
// NAMESPACES there.
import common from '@/locales/ka/common.json';
import auth from '@/locales/ka/auth.json';
import doctor from '@/locales/ka/doctor.json';
import lab from '@/locales/ka/lab.json';
import clinic from '@/locales/ka/clinic.json';
import admin from '@/locales/ka/admin.json';
import landing from '@/locales/ka/landing.json';
import errors from '@/locales/ka/errors.json';

export default { common, auth, doctor, lab, clinic, admin, landing, errors };
