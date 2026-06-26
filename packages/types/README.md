# packages/types

**Zweck:** Geteilte DTOs und Typdefinitionen von ZeitVault als einzige Quelle der Wahrheit für die Verträge zwischen API, Web und Mobile (API↔Web↔Mobile). Stellt durchgängige Typsicherheit über alle Apps hinweg sicher und vermeidet divergierende Schnittstellen-Definitionen.

**Geplanter Tech-Stack:** reines TypeScript 5.x auf Node.js 24 LTS, eingebunden über Turborepo 2.x + pnpm 10. Typsichere Verträge passend zu REST + OpenAPI 3.1 (extern) und tRPC (intern Web↔API); Konsum durch `apps/api`, `apps/web`, `apps/mobile` und `apps/ledger`.

**Architektur-Hinweis:** Maximale Code-/Typ-Teilung in einem TypeScript-Monorepo ist eine gesetzte Stack-Entscheidung. DTOs spiegeln die Kern-Entitäten (u. a. `TimeEntry` mit `revision`/`previous_entry_id`, `AuditEvent`, `tenant_id`).

**Status:** Phase-0-Gerüst vorhanden (build/typecheck grün): Zod-Schemata und Typen in `src` für `common` (UUID, ISO-Zeitstempel, Bundesland), `tenant` (`TenantContext`, `DEFAULT_TENANT_ID`), `time-entry` (inkl. `correctTimeEntrySchema`), `audit-event` und `absence`. Weitere DTOs folgen mit den jeweiligen Modulen.

**Architektur:** siehe [Paragraf 5 – Technologie-Stack](../../docs/ARCHITEKTUR.md#5-technologie-stack) und [ADR-0002 (TypeScript-Monorepo und Stack)](../../docs/adr/0002-typescript-monorepo-und-stack.md).
