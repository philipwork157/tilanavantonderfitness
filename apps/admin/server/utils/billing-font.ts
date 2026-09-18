import fontkit from '@pdf-lib/fontkit';

/** Reject unsupported billing text before immutable documents or editions are committed. */
export async function assertBillingTextSupported(values: Array<string | null | undefined>) {
  const bytes = await useStorage('assets:server').getItemRaw<Uint8Array>('fonts/NotoSans-Regular.ttf');
  if (!bytes) throw createError({ statusCode: 503, statusMessage: 'Billing font is unavailable.' });
  const glyphs = new Set(fontkit.create(bytes).characterSet);
  if (values.some(value => [...(value || '')].some(character => character.codePointAt(0)! >= 32
    && character.codePointAt(0) !== 127 && !glyphs.has(character.codePointAt(0)!)))) {
    throw createError({ statusCode: 400, statusMessage: 'Billing text includes characters the PDF font cannot display.' });
  }
}
