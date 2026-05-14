import { z } from 'zod';
import i18n from '@/i18n';

z.setErrorMap((issue, ctx) => {
  const key = `zod.${issue.code}`;
  const msg = i18n.t(key, { ns: 'errors', defaultValue: ctx.defaultError });
  return { message: msg };
});

export {};
