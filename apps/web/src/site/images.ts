// Pre-sized WebP images in /public/images/site (name-width.webp).
export const images = {
  'tilana-home': { w: 1023, h: 1261, widths: [480, 768, 1023] },
  'tilana-portrait': { w: 944, h: 1104, widths: [480, 944] },
  'tilana-training': { w: 1400, h: 771, widths: [640, 1000, 1400] },
  'tilana-strength': { w: 1327, h: 1185, widths: [480, 800, 1200] },
} as const;

export type ImageName = keyof typeof images;

export function srcset(name: ImageName) {
  const img = images[name];
  return {
    src: `/images/site/${name}-${img.widths[img.widths.length - 1]}.webp`,
    srcSet: img.widths.map((x) => `/images/site/${name}-${x}.webp ${x}w`).join(', '),
    width: img.w,
    height: img.h,
  };
}
