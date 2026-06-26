# Datenbank-Migrationen (apps/api)

Migrationen werden in **Dateinamen-Reihenfolge** (`0000_…`, `0001_…`) angewendet.

Ausführen:

```bash
pnpm --filter @zeitvault/api db:migrate
```

## Hand-gepflegt vs. generiert

Das Schema ist in [`../schema.ts`](../schema.ts) (Drizzle) definiert. `drizzle-kit generate`
kann reine Tabellenänderungen erzeugen. **RLS-Policies, `FORCE ROW LEVEL SECURITY`
und die GoBD-Unveränderbarkeits-Trigger werden jedoch hand-gepflegt**, da Drizzle
sie nicht vollständig generiert (siehe ADR-0005 und ADR-0004).

- `0000_init.sql` — Kern-Tabellen (`tenants`, `employees`, `time_entries`),
  RLS-Mandantentrennung und der Append-only-Trigger für `time_entries`.

> Der Tenant-Kontext wird pro Transaktion über
> `select set_config('app.tenant_id', '<tenant>', true)` gesetzt; die RLS-Policies
> vergleichen `tenant_id` damit. Kein Datenzugriff ohne gesetzten Kontext
> (Kern-Invariante 3).
