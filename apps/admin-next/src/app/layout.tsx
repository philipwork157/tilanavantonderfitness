import '@fontsource-variable/montserrat';
import '@fontsource-variable/playfair-display';
import '@fontsource-variable/playfair-display/wght-italic.css';
import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { themeScript } from '@/lib/theme-script';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Tilana admin' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        {/* Applies the saved light/dark choice before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
