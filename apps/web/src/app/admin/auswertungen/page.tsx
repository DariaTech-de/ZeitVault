import { ReportsPanel } from '@/components/reports-panel';

export default function ReportsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Auswertungen</h1>
        <p className="text-sm text-slate-600">
          Saldenliste und Verstoßreport (ArbZG) für den Mandanten. Auswertungen sind ausschließlich
          für Vorgesetzte und die Administration zugänglich.
        </p>
      </header>
      <ReportsPanel />
      <footer className="text-xs text-slate-400">
        Demo-Gerüst (Phase 3). Die Anmeldung erfolgt später über OIDC/Keycloak (ADR-0008).
      </footer>
    </main>
  );
}
