// Self-hosted fonts — replaces the Google Fonts <link> that used to sit in
// index.html (broke offline use and strict-CSP). The Inter variable font is
// what makes weight 800 available; the mockups lean on it heavily.
import '@fontsource-variable/inter';
import '@fontsource/noto-sans-georgian/400.css';
import '@fontsource/noto-sans-georgian/500.css';
import '@fontsource/noto-sans-georgian/600.css';
import '@fontsource/noto-sans-georgian/700.css';
// Icon font is a 55 KB subset, not the 5.2 MB `material-symbols` package.
// Regenerate with `npm run icons:fetch` after editing scripts/icon-names.txt.
import '@/assets/fonts/material-symbols.css';

import { i18nReady } from './i18n';
import './lib/zod-i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ColorModeProvider } from '@/theme/ColorModeProvider';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/auth/AuthProvider';
import { App } from '@/App';

// index.html carries the landing page's long Georgian title for crawlers and
// link previews. Inside the app the tab says just the product name; the
// landing sets its own title while mounted and restores this one on leaving.
document.title = 'Dentallabs.ge';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

// The date pickers' LocalizationProvider is no longer mounted here: it sits
// at the top of each lazy area and of the guest wizard
// (src/routes/DatePickerProvider.tsx), so the pickers stay out of this chunk.
//
// The first render waits for the visitor's language bundle (src/i18n): one
// small request, and no raw keys on screen while it is in flight.
void i18nReady.then(() => {
  createRoot(container).render(
    <StrictMode>
      <ColorModeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ColorModeProvider>
    </StrictMode>,
  );
});
