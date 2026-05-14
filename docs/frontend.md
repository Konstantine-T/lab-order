# Frontend Architecture — React + TypeScript + MUI

Source of truth for app structure, component patterns, routing, state, and key UI flows.

## 1. Tooling

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "@mui/material": "^5.16.0",
    "@mui/x-data-grid": "^7.0.0",
    "@mui/x-date-pickers": "^7.0.0",
    "@emotion/react": "^11.13.0",
    "@emotion/styled": "^11.13.0",
    "@supabase/supabase-js": "^2.45.0",
    "@tanstack/react-query": "^5.50.0",
    "react-hook-form": "^7.52.0",
    "zod": "^3.23.0",
    "@hookform/resolvers": "^3.9.0",
    "dayjs": "^1.11.0",
    "@react-pdf/renderer": "^3.4.0",
    "react-dropzone": "^14.2.0",
    "i18next": "^23.15.0",
    "react-i18next": "^15.0.0",
    "i18next-browser-languagedetector": "^8.0.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "supabase": "^1.190.0",
    "@playwright/test": "^1.46.0",
    "vitest": "^2.0.0",
    "@testing-library/react": "^16.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0"
  }
}
```

## 2. Supabase Client Setup

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } },
  }
);
```

```ts
// src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});
```

## 3. App Bootstrap

```tsx
// src/main.tsx
import './i18n';                                        // ← side-effect: initializes i18next before render
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ColorModeProvider } from './theme/ColorModeProvider';
import { queryClient } from './lib/queryClient';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <ColorModeProvider>                                   {/* ← provides ThemeProvider + CssBaseline + dark-mode context */}
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
);
```

## 4. Auth & Role Guards

```tsx
// src/auth/AuthProvider.tsx
type AuthContextValue = {
  session: Session | null;
  user: AppUser | null;     // joined view: auth user + public.users + role-specific profile
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
};

// On mount: supabase.auth.getSession(), then onAuthStateChange.
// On session change: fetch /users row joined with doctor_profiles or labs (owner) to populate `user`.
```

```tsx
// src/auth/ProtectedRoute.tsx
export function ProtectedRoute({ children }: PropsWithChildren) {
  const { session, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

// src/auth/RoleGuard.tsx
export function RoleGuard({ allow, children }: { allow: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

## 5. Routing

```tsx
// src/routes.tsx
const routes: RouteObject[] = [
  // Public
  { path: '/', element: <RoleAwareRedirect /> },          // landing if anon, dashboard if signed in
  { path: '/welcome', element: <LandingPage /> },         // direct link bypasses redirect
  { path: '/login', element: <LoginPage /> },
  { path: '/register/doctor', element: <DoctorRegisterPage /> },
  { path: '/register/lab', element: <LabRegisterPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },

  // Doctor
  {
    path: '/doctor', element: <ProtectedRoute><RoleGuard allow={['DOCTOR']}><DoctorLayout /></RoleGuard></ProtectedRoute>,
    children: [
      { index: true, element: <DoctorHomePage /> },
      { path: 'profile', element: <DoctorProfilePage /> },
      { path: 'work-locations', element: <WorkLocationsPage /> },
      { path: 'marketplace', element: <LabMarketplacePage /> },
      { path: 'labs/:labId', element: <LabPublicProfilePage /> },
      { path: 'orders', element: <DoctorOrderPortfolioPage /> },
      { path: 'orders/new', element: <OrderCreateWizardPage /> },
      { path: 'orders/:orderId', element: <DoctorOrderDetailPage /> },
      { path: 'patients', element: <PatientsListPage /> },
      { path: 'patients/:patientId', element: <PatientHistoryPage /> },
      { path: 'invoices', element: <DoctorInvoicesPage /> },
      { path: 'debts', element: <DoctorDebtsPage /> },
    ],
  },

  // Lab
  {
    path: '/lab', element: <ProtectedRoute><RoleGuard allow={['LAB_MAIN_ADMIN']}><LabLayout /></RoleGuard></ProtectedRoute>,
    children: [
      { index: true, element: <LabDashboardPage /> },
      { path: 'profile', element: <LabProfilePage /> },
      { path: 'services', element: <LabServicesPage /> },
      { path: 'forms', element: <LabFormsPage /> },
      { path: 'forms/:formId', element: <LabFormEditorPage /> },
      { path: 'orders', element: <LabOrdersDashboardPage /> },
      { path: 'orders/:orderId', element: <LabOrderSheetPage /> },
      { path: 'invoices', element: <LabInvoicesPage /> },
      { path: 'debts', element: <LabDebtsPage /> },
      { path: 'platform-billing', element: <LabPlatformBillingPage /> },
    ],
  },

  // Platform Admin
  {
    path: '/admin', element: <ProtectedRoute><RoleGuard allow={['PLATFORM_ADMIN']}><AdminLayout /></RoleGuard></ProtectedRoute>,
    children: [
      { index: true, element: <AdminHomePage /> },
      { path: 'labs', element: <LabApprovalQueuePage /> },
      { path: 'labs/:labId', element: <LabReviewPage /> },
      { path: 'reviews', element: <ReviewModerationPage /> },
      { path: 'clinic-admins', element: <ClinicAdminsPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'billing/settings', element: <BillingSettingsPage /> },
      { path: 'billing/invoices', element: <BillingInvoicesPage /> },
      { path: 'stats', element: <BasicStatsPage /> },
    ],
  },

  // Clinic Admin
  {
    path: '/clinic', element: <ProtectedRoute><RoleGuard allow={['CLINIC_ADMIN']}><ClinicLayout /></RoleGuard></ProtectedRoute>,
    children: [
      { index: true, element: <ClinicAdminDashboardPage /> },
      { path: 'orders/:orderId', element: <ClinicAdminOrderPage /> },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
];

// RoleAwareRedirect: if no session → render <LandingPage />; otherwise <Navigate> to
// /doctor, /lab, /admin, or /clinic based on role. /welcome forces the landing page
// even when authenticated (useful for "About" link in the app shell).
```

## 6. State Management

- **Server state**: TanStack Query. One file per resource: `src/features/.../api.ts` exports `useFooQuery`, `useFooMutation` hooks.
- **Form state**: React Hook Form + Zod. Define schemas in `src/features/.../schema.ts`.
- **Session / role**: `AuthContext` only. Don't duplicate into Redux/Zustand.
- **Realtime**: custom hooks like `useRealtimeChat(orderId)` that subscribe to Supabase channels and write into the React Query cache via `queryClient.setQueryData`.
- **No Redux.** Server cache + form state + a tiny auth context is enough.

### Example data hook

```ts
// src/features/lab/orders-dashboard/api.ts
export function useLabOrders(filters: LabOrderFilters) {
  return useQuery({
    queryKey: ['lab-orders', filters],
    queryFn: async () => {
      let q = supabase.from('orders')
        .select('id, order_code, status, payment_status, final_total, debt_total, requested_due_date, created_at, ' +
                'patients(first_name, last_name), ' +
                'doctor_profiles!inner(users(first_name, last_name))')
        .order('created_at', { ascending: false });
      if (filters.status) q = q.in('status', filters.status);
      if (filters.dueDateFrom) q = q.gte('requested_due_date', filters.dueDateFrom);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}
```

## 7. Theme & Dark Mode

The theme is built as a function of `mode: 'light' | 'dark'` so the same component tokens are reused across both palettes.

```ts
// src/theme.ts
import { createTheme, type PaletteMode } from '@mui/material';

const tokens = (mode: PaletteMode) => ({
  palette: {
    mode,
    primary:   { main: mode === 'light' ? '#1769aa' : '#64b5f6' }, // medical blue, lifted on dark
    secondary: { main: mode === 'light' ? '#00897b' : '#4db6ac' },
    error:     { main: mode === 'light' ? '#c62828' : '#ef5350' },
    warning:   { main: mode === 'light' ? '#ef6c00' : '#ffa726' },
    success:   { main: mode === 'light' ? '#2e7d32' : '#66bb6a' },
    background: mode === 'light'
      ? { default: '#f5f7fa', paper: '#ffffff' }
      : { default: '#0f1419', paper: '#161b22' },
    divider: mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
  },
  typography: {
    fontFamily: 'Inter, "Noto Sans Georgian", -apple-system, system-ui, sans-serif',
    h1: { fontSize: '2rem', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiCard:   { defaultProps: { variant: 'outlined' } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } }, // kill MUI's default elevation tint on dark
  },
});

export const buildTheme = (mode: PaletteMode) => createTheme(tokens(mode));
```

### 7.1 ColorModeContext

```tsx
// src/theme/ColorModeProvider.tsx
type ColorModeContextValue = { mode: PaletteMode; toggle: () => void; set: (m: PaletteMode | 'system') => void };
const ColorModeContext = createContext<ColorModeContextValue | null>(null);
export const useColorMode = () => {
  const ctx = useContext(ColorModeContext);
  if (!ctx) throw new Error('useColorMode outside provider');
  return ctx;
};

const STORAGE_KEY = 'lab-order:color-mode'; // 'light' | 'dark' | 'system'

export function ColorModeProvider({ children }: PropsWithChildren) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [pref, setPref] = useState<'light' | 'dark' | 'system'>(
    () => (localStorage.getItem(STORAGE_KEY) as any) ?? 'system'
  );

  const mode: PaletteMode = pref === 'system' ? (prefersDark ? 'dark' : 'light') : pref;
  const theme = useMemo(() => buildTheme(mode), [mode]);

  const value = useMemo<ColorModeContextValue>(() => ({
    mode,
    toggle: () => setPref(mode === 'light' ? 'dark' : 'light'),
    set:    (m) => setPref(m),
  }), [mode]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, pref); }, [pref]);
  // Keep <meta name="theme-color"> in sync for mobile address bar
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', mode === 'light' ? '#ffffff' : '#0f1419');
  }, [mode]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
```

`<ColorModeProvider>` replaces the bare `<ThemeProvider>` in `main.tsx`. All other providers nest inside it unchanged.

### 7.2 `<ColorModeToggle>` component

```tsx
// src/components/ColorModeToggle.tsx
export function ColorModeToggle() {
  const { mode, toggle } = useColorMode();
  const { t } = useTranslation('common');
  return (
    <Tooltip title={t(mode === 'light' ? 'theme.switchToDark' : 'theme.switchToLight')}>
      <IconButton onClick={toggle} color="inherit" aria-label={t('theme.toggle')}>
        {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
      </IconButton>
    </Tooltip>
  );
}
```

Placed in:
- `<PublicHeader>` (right side, before language switcher)
- All authenticated layouts' AppBar (right side, before notification bell)

### 7.3 Dark-mode-specific gotchas

- **PDF invoices**: always render in light mode regardless of UI preference. Wrap the PDF preview in `<ThemeProvider theme={buildTheme('light')}>` locally.
- **MUI X DataGrid**: respects the active theme automatically; verify selected/hovered row contrast on dark.
- **Charts/illustrations on landing page**: ship two SVG variants or use `currentColor` strokes so they invert with the text color.
- **Tooth map**: use `theme.palette.text.primary` for the tooth strokes and `theme.palette.action.selected` for the selected fill — never hard-coded `#000`.
- **Lab logos** uploaded by labs may not look good on dark backgrounds. Display them on a `paper`-colored chip/card so they always sit on a near-white surface, even in dark mode.

## 7a. Internationalization (i18n)

### 7a.1 Languages

| Code | Name | Notes |
|---|---|---|
| `en` | English | Default fallback |
| `ka` | ქართული | Georgian, primary user language |
| `ru` | Русский | Common second language in the region |

Add more later by dropping a folder under `src/locales/` and a row in the `LANGUAGES` constant.

### 7a.2 What gets translated

- ✅ All UI chrome: buttons, labels, headings, error messages, status chips, system messages.
- ✅ Email subject lines and templates.
- ✅ Invoice PDF labels (line item headers, "Total", "Paid", payment instructions chrome).
- ✅ Validation messages (Zod error map).
- ✅ Date and number formats (via `dayjs.locale()` and `Intl.NumberFormat`).
- ❌ User-generated content: lab names, service names, form helper text, patient names, chat messages, review text, lab payment instructions (the *content* of "Payment instructions" — labs write this in their own language). Render as-is, no translation.
- ❌ Form configurations (`lab_form_versions.configuration_json`): field codes are translated (we ship a translation table for the platform template field codes), but lab-customized helper text is not.

### 7a.3 Library setup

```ts
// src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import dayjs from 'dayjs';
import 'dayjs/locale/ka';
import 'dayjs/locale/ru';

import enCommon  from '@/locales/en/common.json';
import enLanding from '@/locales/en/landing.json';
import enAuth    from '@/locales/en/auth.json';
import enDoctor  from '@/locales/en/doctor.json';
import enLab     from '@/locales/en/lab.json';
import enAdmin   from '@/locales/en/admin.json';
import enErrors  from '@/locales/en/errors.json';
// (repeat imports for ka, ru)

export const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ka', label: 'ქართული', flag: '🇬🇪' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
] as const;
export type LanguageCode = typeof LANGUAGES[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: LANGUAGES.map(l => l.code),
    ns: ['common', 'landing', 'auth', 'doctor', 'lab', 'admin', 'errors'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'lab-order:lang',
      caches: ['localStorage'],
    },
    resources: {
      en: { common: enCommon, landing: enLanding, auth: enAuth, doctor: enDoctor, lab: enLab, admin: enAdmin, errors: enErrors },
      ka: { /* ... */ },
      ru: { /* ... */ },
    },
  });

i18n.on('languageChanged', (lng) => {
  dayjs.locale(lng);
  document.documentElement.lang = lng;
});

export default i18n;
```

Import once in `main.tsx` (`import './i18n'`) before `ReactDOM.render`.

### 7a.4 Translation file layout

```
src/locales/
├── en/
│   ├── common.json         ← buttons, statuses, generic labels, theme.*
│   ├── landing.json        ← landing page copy
│   ├── auth.json           ← login, register, password reset
│   ├── doctor.json         ← doctor-only screens
│   ├── lab.json            ← lab-only screens
│   ├── admin.json          ← platform admin
│   └── errors.json         ← validation + API error messages
├── ka/   (same files)
└── ru/   (same files)
```

Example `en/common.json`:
```json
{
  "actions": { "save": "Save", "cancel": "Cancel", "submit": "Submit", "back": "Back" },
  "status": {
    "order": {
      "SUBMITTED": "Submitted",
      "RECEIVED": "Received",
      "IN_PROGRESS": "In progress",
      "READY_FOR_DELIVERY": "Ready for delivery",
      "COMPLETED": "Completed",
      "CANCELLED": "Cancelled"
    },
    "payment": { "UNPAID": "Unpaid", "PARTIALLY_PAID": "Partially paid", "PAID": "Paid" }
  },
  "theme": {
    "toggle": "Toggle theme",
    "switchToDark": "Switch to dark mode",
    "switchToLight": "Switch to light mode"
  },
  "language": { "label": "Language" }
}
```

### 7a.5 `<LanguageSwitcher>` component

```tsx
// src/components/LanguageSwitcher.tsx
export function LanguageSwitcher({ variant = 'icon' }: { variant?: 'icon' | 'text' }) {
  const { i18n, t } = useTranslation('common');
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = LANGUAGES.find(l => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0];

  return (
    <>
      <Tooltip title={t('language.label')}>
        <Button
          color="inherit"
          startIcon={variant === 'icon' ? <LanguageIcon /> : undefined}
          onClick={(e) => setAnchor(e.currentTarget)}
          size="small"
        >
          {variant === 'icon' ? current.code.toUpperCase() : `${current.flag} ${current.label}`}
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {LANGUAGES.map(({ code, label, flag }) => (
          <MenuItem key={code} selected={code === current.code}
                    onClick={() => { void i18n.changeLanguage(code); setAnchor(null); }}>
            <ListItemIcon>{flag}</ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
```

Placed in:
- `<PublicHeader>` (visible to anonymous visitors).
- Every authenticated layout's AppBar (next to `<ColorModeToggle>`).
- A user can also change language from `/doctor/profile` → preferences (writes to localStorage; not yet persisted server-side in MVP).

### 7a.6 Usage pattern in components

```tsx
const { t } = useTranslation('doctor');
<Button>{t('orders.createNew')}</Button>
<Typography>{t('orders.dueDate', { date: dayjs(order.requested_due_date).format('LL') })}</Typography>
```

### 7a.7 Status chip integration

```tsx
// src/components/StatusChip/OrderStatusChip.tsx
export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const { t } = useTranslation('common');
  return <Chip label={t(`status.order.${status}`)} color={ORDER_STATUS_COLOR[status]} size="small" />;
}
```

### 7a.8 Validation messages

Set a Zod global error map that pulls from `errors.json` so RHF error messages translate without per-form wiring:

```ts
// src/lib/zod-i18n.ts
import { z } from 'zod';
import i18n from '@/i18n';

z.setErrorMap((issue, ctx) => {
  const key = `zod.${issue.code}`;
  const msg = i18n.t(key, { defaultValue: ctx.defaultError, ns: 'errors' });
  return { message: msg };
});
```

### 7a.9 Date and currency formatting

```ts
// src/utils/format.ts
export const formatDate = (d: string | Date) => dayjs(d).format('LL');
export const formatCurrency = (amount: number, lang = i18n.resolvedLanguage ?? 'en') =>
  new Intl.NumberFormat(lang, { style: 'currency', currency: 'GEL' }).format(amount);
```

### 7a.10 Server-side considerations

- **Email language**: store the user's chosen language on `users.preferred_lang` (add column in Phase 1); Edge Functions read it when sending invoice emails and select the right template.
- **Invoice PDF**: rendered server-side via Edge Function — the function loads its own bundled translations (a small subset, only the labels needed for the PDF).
- **System messages in chat**: stored in `order_messages.message_text` already-translated to the *recipient's* language is a footgun (multiple participants, different languages). Instead, store a structured `message_key` + `params jsonb` for SYSTEM messages and translate at render time. Update the `order_messages` schema:
  ```sql
  alter table public.order_messages
    add column system_message_key text,
    add column system_message_params jsonb;
  -- message_text becomes optional / used only for USER messages
  ```
  System triggers write `system_message_key = 'STATUS_CHANGED'`, `system_message_params = {"from": "SUBMITTED", "to": "RECEIVED"}`. Frontend renders via `t(`system.${key}`, params)`.

### 7a.11 RTL and font loading

- None of the launch languages are RTL — skip RTL handling for now.
- Georgian needs a font that supports the script. Add `Noto Sans Georgian` to the typography fallback chain (already in `theme.ts` above). Load via `<link>` in `index.html` with `font-display: swap`.

### 7a.12 Translation workflow

- Source of truth is the `en` JSON files.
- A small CI script verifies every key in `en` exists in `ka` and `ru`; fails the build on mismatch.
- For pilot launch, machine-translate `ka` and `ru` then have a native speaker review. Add a "Help us translate" link in the footer for community fixes (out of MVP scope).

## 7b. Landing Page

Public, unauthenticated marketing page served at `/` (when anonymous) and `/welcome` (always). Single-page composition assembled from section components — no separate routing inside.

```tsx
// src/pages/public/LandingPage.tsx
export function LandingPage() {
  return (
    <Box sx={{ bgcolor: 'background.default' }}>
      <PublicHeader />
      <HeroSection />
      <LabsSection />
      <HowItWorksSection />
      <PublicFooter />
    </Box>
  );
}
```

### 7b.1 `<PublicHeader>`

- Sticky `<AppBar>` with transparent → solid on scroll (use `useScrollTrigger`). Solid surface adapts to dark mode automatically because tokens come from the theme.
- Left: logo + product name.
- Right (desktop): nav anchors (`#labs`, `#how-it-works`, `#contact`) → `<ColorModeToggle>` → `<LanguageSwitcher>` → `Log in` button (outlined) → `Get started` button (contained, primary). Hamburger menu on mobile collapses the nav anchors but keeps the toggle and switcher visible (icon variants only).
- "Get started" opens a small popover with two choices: **I'm a Doctor** → `/register/doctor`, **I run a Lab** → `/register/lab`. Both choices are translated.

### 7b.2 `<HeroSection>`

- Two-column on desktop, stacked on mobile.
- Left column: H1 headline, supporting paragraph, primary CTA (`Get started`), secondary CTA (`Browse labs` → scrolls to `#labs`).
- Right column: hero illustration / product screenshot (static asset in `/public/landing/`).
- MUI `<Container maxWidth="lg">` + `<Grid>` for the split, generous vertical padding.
- Headline copy is a placeholder — copywriter to provide; component takes `title`/`subtitle`/`ctas` as props so it's editable in one place.

### 7b.3 `<LabsSection>` — Featured Labs

Public showcase of approved labs. Reuses RLS policy `labs_marketplace_read` (only `APPROVED_ACTIVE`) so no special endpoint is needed.

```tsx
export function LabsSection() {
  const { data: labs = [] } = useQuery({
    queryKey: ['public-featured-labs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('labs')
        .select('id, public_name, city, logo_url, short_description')
        .eq('approval_status', 'APPROVED_ACTIVE')
        .eq('is_active', true)
        .limit(8);
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });

  return (
    <Box id="labs" component="section" sx={{ py: 10 }}>
      <Container maxWidth="lg">
        <Typography variant="h2">Approved laboratories</Typography>
        <Typography color="text.secondary" sx={{ mb: 6 }}>
          Browse vetted dental labs and send structured orders in minutes.
        </Typography>
        <Grid container spacing={3}>
          {labs.map((lab) => <Grid item xs={12} sm={6} md={3} key={lab.id}>
            <LabCard lab={lab} />
          </Grid>)}
        </Grid>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <Button component={RouterLink} to="/register/doctor" variant="contained" size="large">
            See all labs (sign up free)
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
```

`<LabCard>` is the same visual primitive that the doctor marketplace will use later — extract to `src/components/LabCard/` from day one so Phase 4 reuses it. Card click goes to `/register/doctor` (anonymous) — full lab profile is gated behind auth.

If <8 approved labs exist (early days), show a subtle skeleton/placeholder ("More labs joining soon") rather than a half-empty grid.

### 7b.4 `<HowItWorksSection>` — Static Info

Three-column feature strip. No data fetching; pure JSX.

| # | Title | Body |
|---|---|---|
| 1 | Pick a lab | Choose from approved laboratories and review services, turnaround, and reviews. |
| 2 | Send a structured order | Fill the lab's pre-built form, attach STL/photos, get an instant price estimate. |
| 3 | Track, pay, repeat | Chat with the lab, confirm receipt, and keep all invoices and debts in one place. |

Built with `<Grid container spacing={4}>` + a small `<FeatureCard icon, title, body>` primitive. Use MUI icons (`Search`, `Description`, `Receipt`) for visual anchoring. Background tint (`bgcolor: 'grey.50'`) to separate from the labs section.

### 7b.5 `<PublicFooter>`

- Dark `<Box component="footer" sx={{ bgcolor: 'grey.900', color: 'common.white', py: 6 }}>`.
- Three columns on desktop, single column on mobile:
  - **Product**: Features, For Doctors, For Labs, Pricing (placeholder).
  - **Company**: About, Contact, Privacy, Terms.
  - **Get in touch**: support email, phone, social icons.
- Bottom row: copyright + small "Made for dental labs" tagline.
- All links are anchors or placeholders for now (`#`); real Privacy/Terms pages are out of MVP scope unless legal requires them.

### 7b.6 SEO & Performance

- `<title>` and `<meta>` set via a tiny `<Helmet>`-style hook or directly in `index.html` (single page — no SPA SEO library needed for MVP).
- All hero/illustration images: `<img loading="lazy">` and an explicit `width`/`height` to avoid layout shift.
- Lab logos: same treatment; fallback to a generic icon when `logo_url` is null.
- The page is fully renderable to anonymous users — no auth fetch on mount, no flicker.

### 7b.7 Theme Notes

The landing page uses the same MUI theme as the app, but with looser vertical rhythm. Define a few section-level constants in `src/pages/public/sections/landing.theme.ts` (`SECTION_PY = { xs: 6, md: 10 }`) so each section stays consistent without re-deriving spacing.

## 8. Layout Shell

`DoctorLayout` / `LabLayout` / `AdminLayout` / `ClinicLayout` each render:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AppBar [logo] [search?]  [🌓 mode] [🌐 lang] [🔔 notifications] [avatar] │
├──────────┬───────────────────────────────────────────────────────────────┤
│          │                                                               │
│ Sidebar  │            <Outlet />                                         │
│ (Drawer) │                                                               │
│          │                                                               │
└──────────┴───────────────────────────────────────────────────────────────┘
```

AppBar right-cluster ordering (consistent across all four layouts):
1. `<ColorModeToggle>` (sun/moon icon button)
2. `<LanguageSwitcher variant="icon">` (compact 2-letter button)
3. `<NotificationBell>` (badged icon)
4. Avatar menu (profile, sign out, "Switch to dark/light", "Language", in case the toggles get hidden on small screens)

Mobile (≤900px): sidebar collapses to a swipeable temporary Drawer. The avatar menu duplicates the mode + language controls so they remain reachable when the icon-only buttons are pushed off-screen. Doctor flow must be fully usable on mobile (PRD §20.4).

## 9. Key Components

### 9.1 `<ToothMap>`

```tsx
type ToothMapProps = {
  selected: number[];               // FDI numbers e.g. [11, 12, 21]
  onChange?: (next: number[]) => void;
  readOnly?: boolean;
  variant?: 'adult' | 'child';      // MVP: adult only
};
```
- SVG of upper/lower jaws, FDI numbering 11-18 / 21-28 / 31-38 / 41-48.
- Click toggles selection.
- Read-only mode used in lab order sheet and invoice display.
- Stored in `order_answers.answer_json` as `{ teeth: number[] }`.

### 9.2 `<DynamicForm>`

Renders a `lab_form_version.configuration_json` against an answers object. Maps each `field_type` to a component:

| field_type | component |
|---|---|
| `text`, `textarea` | `<TextField>` |
| `number` | `<TextField type="number">` |
| `select` | `<Select>` |
| `multiselect` | `<Autocomplete multiple>` |
| `tooth_selection` | `<ToothMap>` |
| `shade_picker` | `<ShadeSelect>` (Vita Classical / 3D Master) |
| `material_select` | `<Select>` (lab-configured options with optional price modifier) |
| `date` | `<DatePicker>` |
| `file` | `<FileUploader>` |
| `checkbox` | `<Checkbox>` |
| `radio_group` | `<RadioGroup>` |

Form is wrapped in `useForm<Answers>()` + Zod schema generated from the configuration. Disabled/hidden fields per `enabled` and `visible_to_doctor`.

### 9.3 `<FileUploader>`

- `react-dropzone` accepting STL, ZIP, JPG/JPEG, PNG, PDF, MP4.
- Uploads directly to Supabase Storage with `supabase.storage.from('order-files').upload(path, file)`.
- On success, inserts `order_files` row.
- Shows progress per file.
- **No delete button** in MVP (PRD §13). Show "Upload corrected file" instead.

### 9.4 `<PriceBreakdown>`

```tsx
type Props = {
  pricing: PricingConfig;       // from lab_form_version
  answers: OrderAnswers;        // current form values
  rush: { type: RushType; value: number };
  finalTotal?: number | null;   // if lab confirmed
};
```
- Calls shared `calculatePrice(pricing, answers, rush)` from `src/utils/pricing.ts`.
- Shows: subtotal, rush surcharge, modifiers, generated total.
- If `pricing.model === 'MANUAL_QUOTE_REQUIRED'`, displays "Manual quote — lab will confirm" instead of a number.
- If `finalTotal` set and differs from generated, shows both with strikethrough on generated.

### 9.5 `<OrderStatusChip>`, `<PaymentStatusChip>`

Color-mapped MUI `<Chip>` for the order/payment status enums. Used in DataGrid and detail views.

### 9.6 `<DataTable>`

Wraps MUI `DataGrid` with our defaults (no row selection by default, custom toolbar with filter/refresh, pagination model). Used by:
- Lab order dashboard (PRD §17.1)
- Doctor portfolio (PRD §17.2)
- Admin lab approval queue
- Invoice lists, debt lists

### 9.7 `<OrderChat>`

```tsx
type Props = { orderId: string };
```
- Subscribes to `order_messages` realtime channel.
- Renders user vs system messages differently.
- File attachment support via `<FileUploader>` (uploads to `chat-attachments`).
- New message form at the bottom; send → insert into `order_messages`.
- Optimistic update via React Query.

### 9.8 `<NotificationBell>`

- Badge with unread count from `notifications` table.
- Dropdown shows last 20.
- Click → mark read (`update notifications set is_read=true, read_at=now()`) and navigate to `order_id` if present.
- Realtime subscription to `notifications:user_id=eq.{me}`.

## 10. Order Creation Wizard

5-step MUI Stepper:

```
1. Patient        → first/last/DOB → match modal: continue case / new
2. Lab & Service  → marketplace cards → select service
3. Order Form     → DynamicForm (lab's published version)
4. Files & Due    → FileUploader, DatePicker, Rush toggle
5. Review & Submit → InvoiceRecipient (doctor/clinic), PriceBreakdown, Submit
```

State held in a `useReducer` inside the wizard page. Drafts stored in `localStorage` keyed by `wizardDraft:{doctorId}` so a reload doesn't wipe progress.

On submit:
1. Validate Zod schemas across all steps.
2. Call Postgres function `submit_order(payload jsonb)` (security definer) which:
   - Creates `patients` row if new (or finds match).
   - Creates `orders` with `lab_form_version_id` from currently-published version.
   - Inserts `order_answers`.
   - Builds and stores all snapshots (work_location, lab, service, invoice_recipient, pricing).
   - Calls `calculate_order_price` to set `generated_total`.
   - Returns the new order id.
3. Frontend uploads files to Storage, then inserts `order_files` rows.
4. Redirect to `/doctor/orders/:orderId`.

## 11. Lab Order Sheet (Detail Page)

Most important read-only-ish screen for the lab. Layout:

```
┌─ Header: order_code, status chip, due date, doctor, patient ────────┐
├─ Tabs: [Order Details] [Files] [Chat] [Invoice] [History] ─────────┤
│                                                                     │
│ Order Details:                                                      │
│   Service / Form (from snapshot)                                    │
│   Tooth map (read-only)                                             │
│   Material / shade / design                                         │
│   Implant details                                                   │
│   Notes                                                             │
│   Price breakdown + [Confirm final price] button                    │
│   Due date confirmation [DatePicker + Save]                         │
│   Status actions: [Mark IN_PROGRESS] [Mark READY_FOR_DELIVERY]      │
│                  [Mark SENT_TO_CLINIC] [Mark COMPLETED] [Cancel]    │
│                                                                     │
│ Files: list with download (signed URLs)                             │
│ Chat: <OrderChat />                                                 │
│ Invoice: PDF preview, payment events list, [Add payment]            │
│ History: <OrderChangeLog />                                         │
└─────────────────────────────────────────────────────────────────────┘
```

Print/PDF view available via `@react-pdf/renderer` for an order summary.

## 12. Form Builder (Lab side)

Despite "no full custom builder" (PRD §8.1), there's still a configuration UI:

- Pick a service (or create one).
- Pick a template from the 8 platform templates.
- For each field defined by the template:
  - Toggle `enabled`
  - Toggle `required`
  - Edit `helper_text`
  - Set `default_value`
  - Mark `affects_price` (only on price-relevant fields)
  - Mark `visible_to_doctor`
- Pricing config:
  - Choose model (`UNIT_BASED` / `FIXED_PRICE` / `MATERIAL_MODIFIER` / `MANUAL_QUOTE_REQUIRED`)
  - Set unit_price or fixed_price
  - Add material modifiers `[{ material: 'Premium Zirconia', delta: 30 }]`
  - Rush: `{ type: 'PERCENTAGE' | 'FIXED_AMOUNT' | 'NONE', value }`
- **Preview**: opens `<DynamicForm>` in read-only mode with example data.
- Save → creates a new `lab_form_versions` row (incrementing `version_number`); **never edits an existing version**. Updates `lab_forms.current_version_id`.
- Publish → `status = 'PUBLISHED'` on form and version.

## 13. Pricing Math

```ts
// src/utils/pricing.ts
export type PricingConfig = {
  model: 'UNIT_BASED' | 'FIXED_PRICE' | 'MATERIAL_MODIFIER' | 'MANUAL_QUOTE_REQUIRED';
  unit_price?: number;
  fixed_price?: number;
  material_modifiers?: Array<{ key: string; delta_per_unit: number }>;
  rush: { type: 'NONE' | 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number };
};

export type PriceResult =
  | { kind: 'CALCULATED'; subtotal: number; rushAmount: number; total: number; lines: PriceLine[] }
  | { kind: 'MANUAL_QUOTE' };

export function calculatePrice(pricing: PricingConfig, answers: OrderAnswers): PriceResult {
  if (pricing.model === 'MANUAL_QUOTE_REQUIRED') return { kind: 'MANUAL_QUOTE' };
  // ...
}
```

Same logic mirrored in Postgres `calculate_order_price` (database.md §7).

## 14. Realtime Patterns

```ts
// src/hooks/useRealtimeChat.ts
export function useRealtimeChat(orderId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase.channel(`order-messages-${orderId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` },
        (payload) => {
          queryClient.setQueryData<OrderMessage[]>(['order-messages', orderId], (old = []) => [...old, payload.new]);
        })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [orderId, queryClient]);
}
```

Same pattern for notifications.

## 15. Forms & Validation Pattern

```ts
// src/features/doctor/work-locations/schema.ts
import { z } from 'zod';
export const workLocationSchema = z.object({
  clinic_name: z.string().min(2),
  branch_name: z.string().optional(),
  address: z.string().min(3),
  city: z.string().min(2),
  clinic_identification_code: z.string().optional(),
  clinic_invoice_email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  is_default: z.boolean().default(false),
});
export type WorkLocationInput = z.infer<typeof workLocationSchema>;
```

```tsx
// component
const form = useForm<WorkLocationInput>({ resolver: zodResolver(workLocationSchema) });
<TextField {...form.register('clinic_name')} error={!!form.formState.errors.clinic_name}
           helperText={form.formState.errors.clinic_name?.message} />
```

A small set of field components (`<RHFTextField>`, `<RHFSelect>`, etc.) in `src/components/FormFields/` removes boilerplate.

## 16. Error Handling

- Global `ErrorBoundary` per layout.
- `supabase.from(...).select(...)` errors are thrown by React Query and caught by the boundary OR handled inline with snackbars.
- `<ErrorSnackbar>` listens to a Zustand store `useErrorStore.set({ message })` for non-blocking errors (e.g. failed payment record).
- Form errors: shown inline.
- 403 errors from RLS: route to `/forbidden` page.

## 17. Environment / Build

`vite.config.ts`:
```ts
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': '/src' } },
  server: { port: 5173 },
});
```

`.env.example`:
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Never commit real keys. Anon key is meant to be public but should still be gitignored.

## 18. Testing

- **Unit (Vitest)**: `src/utils/pricing.ts`, snapshot helpers, schema validators.
- **Component (RTL)**: `<ToothMap>`, `<DynamicForm>`, `<PriceBreakdown>`.
- **E2E (Playwright)**: minimum suite —
  1. Doctor registers, adds work location, places order to a seeded approved lab.
  2. Lab confirms price, generates invoice, records payment.
  3. Doctor confirms receipt, submits review.
  4. Platform Admin approves a new lab.
  5. Platform billing: cron fires (manually invoked Edge Function), admin approves & sends.

Each E2E test uses a fresh seeded database (Supabase branch or test project).
