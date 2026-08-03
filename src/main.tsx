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

import './i18n';
import './lib/zod-i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ColorModeProvider } from '@/theme/ColorModeProvider';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/auth/AuthProvider';
import { App } from '@/App';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

createRoot(container).render(
  <StrictMode>
    <ColorModeProvider>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </LocalizationProvider>
    </ColorModeProvider>
  </StrictMode>,
);
