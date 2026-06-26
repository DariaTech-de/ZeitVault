import { AdminConsole } from '@/components/admin-console';

export default function AdminPage() {
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Verwaltung</h1>
        <p className="text-sm text-slate-600">
          Mitarbeitende, Stempelungen, Verstoßreport und Korrekturen (nur Administration).
        </p>
      </header>
      <AdminConsole />
    </main>
  );
}
