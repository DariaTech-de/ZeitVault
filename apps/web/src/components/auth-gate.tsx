'use client';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

/**
 * Schützt die Inhalte: Im OIDC-Modus wird ohne Anmeldung ein Login angeboten;
 * während der Initialisierung ein Ladezustand. Im Dev-Modus ist der Zugang über
 * die Demo-Identität direkt gegeben.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, login } = useAuth();

  if (status === 'loading') {
    return <p className="mx-auto max-w-[1200px] px-5 py-10 text-sm text-ink-faint">Wird geladen &hellip;</p>;
  }

  if (status === 'unauthenticated') {
    return (
      <main className="mx-auto flex max-w-md flex-col items-start gap-4 px-5 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Anmeldung erforderlich</h1>
        <p className="text-sm text-ink-muted">
          Bitte melden Sie sich über Ihren Unternehmens-Login (Keycloak/OIDC) an.
        </p>
        <Button onClick={login}>Anmelden</Button>
      </main>
    );
  }

  return <>{children}</>;
}
