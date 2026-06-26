import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppNav } from '@/components/app-nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'ZeitVault - Zeiterfassung',
  description: 'Self-Service-Zeiterfassung (Kommen, Gehen, Pausen).',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <AppNav />
        {children}
      </body>
    </html>
  );
}
