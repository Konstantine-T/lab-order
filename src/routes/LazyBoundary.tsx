import { Component, Suspense, type ReactNode } from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/design';
import { FullPageSpinner } from '@/components/FullPageSpinner';
import { PublicAuthLayout } from '@/layouts/PublicAuthLayout';
import { ChunkLoadError } from './lazyRoute';

type Variant = 'page' | 'inline';

/**
 * Suspense plus a chunk-error boundary around one lazy route.
 *
 * The fallback is the same `FullPageSpinner` the auth guards show while the
 * session resolves, so a signed-in cold load reads as one wait, not two
 * different loaders in a row.
 *
 * `variant` picks the error screen: `page` stands alone (a whole area failed,
 * so there is no layout around it); `inline` sits inside a shell that did
 * load — the guest wizard inside the public catalogue's top bar.
 */
export function LazyBoundary({ children, variant = 'page' }: { children: ReactNode; variant?: Variant }) {
  return (
    <ChunkErrorBoundary variant={variant}>
      <Suspense fallback={<FullPageSpinner />}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}

type BoundaryState = { failed: boolean; error: unknown };

/**
 * Catches a `ChunkLoadError` and offers a reload instead of a blank page.
 * Every other error is rethrown untouched: the app has no general error
 * boundary, and this one must not start describing a code bug as a lost
 * connection.
 */
class ChunkErrorBoundary extends Component<{ children: ReactNode; variant: Variant }, BoundaryState> {
  state: BoundaryState = { failed: false, error: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, error };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (!(this.state.error instanceof ChunkLoadError)) throw this.state.error;
    return <ChunkErrorNotice variant={this.props.variant} />;
  }
}

function ChunkErrorNotice({ variant }: { variant: Variant }) {
  const { t } = useTranslation('common');
  const body = (
    <Stack
      spacing={1.5}
      alignItems="center"
      sx={{ textAlign: 'center', maxWidth: 480, mx: 'auto', py: variant === 'page' ? 2 : 6 }}
    >
      <Icon name="cloud_off" size={44} sx={{ color: 'primary.main' }} />
      <Typography variant="h5" component="h1">
        {t('chunkError.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary">
        {t('chunkError.body')}
      </Typography>
      <Button
        variant="contained"
        startIcon={<Icon name="restart_alt" />}
        onClick={() => window.location.reload()}
        sx={{ mt: 1 }}
      >
        {t('chunkError.reload')}
      </Button>
    </Stack>
  );
  return variant === 'page' ? <PublicAuthLayout maxWidth="xs">{body}</PublicAuthLayout> : body;
}
