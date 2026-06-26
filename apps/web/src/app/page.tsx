import { StampPanel } from '@/components/stamp-panel';

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">ZeitVault</h1>
        <p className="text-sm text-slate-600">
          Self-Service-Zeiterfassung - Kommen, Gehen und Pausen mit Live-Prüfung nach ArbZG.
        </p>
      </header>
      <StampPanel />
      <footer className="text-xs text-slate-400">
        Demo-Gerüst (Phase 1). Die Anmeldung erfolgt später über OIDC/Keycloak (ADR-0008);
        aktuell wird eine Demo-Identität aus der Konfiguration verwendet.
      </footer>
    </main>
  );
}
