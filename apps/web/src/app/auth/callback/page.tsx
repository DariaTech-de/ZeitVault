'use client';

import { useEffect, useState } from 'react';
import { getUserManager } from '@/lib/oidc';

/**
 * OIDC-Redirect-Ziel: tauscht den Authorization Code gegen Tokens (PKCE) und
 * leitet anschließend in die App. Nur im OIDC-Modus relevant.
 */
export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUserManager()
      .signinRedirectCallback()
      .then(() => {
        window.location.replace('/');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.');
      });
  }, []);

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : (
        <p className="text-sm text-slate-500">Anmeldung wird abgeschlossen &hellip;</p>
      )}
    </main>
  );
}
