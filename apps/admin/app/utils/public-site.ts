/** Keep links to the public catalogue on the configured local, dev, or live website. */
export function getPublicProgramsUrl(siteUrl: string): string {
  return new URL('/program', siteUrl).href;
}
