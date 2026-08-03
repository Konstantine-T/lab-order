const TEMPLATE_IMAGE_FILES: Record<string, string> = {
  CROWN_AND_BRIDGE:          'crown-and-bridge.jpeg',
  TEMPORARY_CROWN:           'crown-and-bridge.jpeg',
  SURGICAL_GUIDE:            'surgical-guide.jpeg',
  EVIDENT_SMILE:             'evident-smile.jpeg',
  CONSTRUCTIONS_ON_IMPLANTS: 'constructions-on-implants.jpeg',
  GINGIVAL_REDUCTION_GUIDE:  'gingival-reduction-guide.jpeg',
  MODEL:                     'model.jpeg',
  ZIRCONIA_CROWN:            'zirconia-crown.jpeg',
};

/**
 * Per-template icon and accent colour from the Lab Services mockup. Unmapped
 * codes fall back to a brand-neutral pair, so a new template still renders.
 */
const TEMPLATE_LOOK: Record<string, { icon: string; color: string }> = {
  CROWN_AND_BRIDGE: { icon: 'dentistry', color: '#6366F1' },
  TEMPORARY_CROWN: { icon: 'dentistry', color: '#6366F1' },
  ZIRCONIA_CROWN: { icon: 'diamond', color: '#0284C7' },
  SURGICAL_GUIDE: { icon: 'biotech', color: '#0EA5E9' },
  CONSTRUCTIONS_ON_IMPLANTS: { icon: 'construction', color: '#10B981' },
  MODEL: { icon: 'deployed_code', color: '#F59E0B' },
  EVIDENT_SMILE: { icon: 'auto_awesome', color: '#EC4899' },
  GINGIVAL_REDUCTION_GUIDE: { icon: 'content_cut', color: '#8A5CF6' },
};

export const templateLook = (code: string | null | undefined) =>
  (code && TEMPLATE_LOOK[code]) || { icon: 'category', color: '#6E6EE8' };

const BUCKET = 'service-defaults';

/** Public URL of the default image for a template code, or null if none mapped. */
export function templateDefaultImageUrl(templateCode: string | undefined | null): string | null {
  if (!templateCode) return null;
  const filename = TEMPLATE_IMAGE_FILES[templateCode];
  if (!filename) return null;
  const base = (import.meta.env.VITE_SUPABASE_URL as string) ?? '';
  if (!base) return null;
  return `${base}/storage/v1/object/public/${BUCKET}/${filename}`;
}

/** Effective image URL: lab's own cover image, else the template default. */
export function serviceImageUrl(
  coverImageUrl: string | null | undefined,
  templateCode: string | undefined | null,
): string | null {
  return coverImageUrl || templateDefaultImageUrl(templateCode);
}
