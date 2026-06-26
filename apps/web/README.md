# apps/web

**Zweck:** Web-Frontend von ZeitVault – ein Frontend mit zwei rollenabhängigen Erlebnissen: Admin-Konsole (Dashboards, Verwaltung, Freigaben, Reporting, Export) und Mitarbeiter-Self-Service (stempeln, Salden, Anträge). Rollenabhängige Sichtbarkeit; deutschsprachig, geführte Workflows, kontextsensitive Warnungen.

**Geplanter Tech-Stack:** Next.js 16 (Turbopack) + React 19.2 + Tailwind CSS v4 + shadcn/ui auf Node.js 24 LTS / TypeScript 5.x. Auth über Keycloak 26.6 (OIDC). Interne API-Calls typsicher via tRPC (Web↔API), geteilte DTOs/Typen aus `packages/types`, gemeinsames Designsystem aus `packages/ui`. Hell-/Dunkelmodus.

**Barrierefreiheit:** WCAG 2.1 AA (Tastaturbedienung, Kontraste, Screenreader) – auch wegen BFSG.

**Status:** Phase-1-Gerüst vorhanden: Next.js 16 (App Router) + React 19.2 + Tailwind v4, schlanke shadcn-artige UI-Komponenten (`src/components/ui`). Self-Service-Stempeloberfläche (`src/components/stamp-panel.tsx`): Kommen/Gehen/Pausen mit Statusanzeige (gearbeitete/pausierte Zeit) und Live-ArbZG-Hinweisen, angebunden an `apps/api` (`src/lib/api.ts`). Lokal: `pnpm --filter @zeitvault/web dev`; API-Basis-URL via `NEXT_PUBLIC_API_BASE_URL`.

Noch offen: Admin-Konsole, Salden/Anträge, OIDC-Login (aktuell Demo-Identität via `NEXT_PUBLIC_*`), Konsolidierung der UI-Komponenten nach `packages/ui`, Hell-/Dunkelmodus, WCAG-2.1-AA-Feinschliff.

**Architektur:** siehe [Paragraf 14 – UI/UX-Konzept](../../docs/ARCHITEKTUR.md#14-uiux-konzept).
