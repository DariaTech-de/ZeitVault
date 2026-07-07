import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppChrome } from '@/components/app-chrome';
import { ThemeScript } from '@/components/fiori/theme-script';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZeitVault - Zeitwirtschaft',
  description: 'Enterprise-Zeiterfassung: Stempeln, Abwesenheit, Konten, Auswertungen.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <AuthProvider>
          <AppChrome>{children}</AppChrome>
        </AuthProvider>
      </body>
    </html>
  );
}
