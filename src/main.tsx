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
