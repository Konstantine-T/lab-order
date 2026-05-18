const TEMPLATE_IMAGE_FILES: Record<string, string> = {
  CROWN_AND_BRIDGE:          'crown-and-bridge.jpeg',
  SURGICAL_GUIDE:            'surgical-guide.jpeg',
  EVIDENT_SMILE:             'evident-smile.jpeg',
  CONSTRUCTIONS_ON_IMPLANTS: 'constructions-on-implants.jpeg',
  GINGIVAL_REDUCTION_GUIDE:  'gingival-reduction-guide.jpeg',
  MODEL:                     'model.jpeg',
  ZIRCONIA_CROWN:            'zirconia-crown.jpeg',
};

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
