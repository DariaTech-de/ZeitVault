# apps/web

**Zweck:** Web-Frontend von ZeitVault – ein Frontend mit zwei rollenabhängigen Erlebnissen: Admin-Konsole (Dashboards, Verwaltung, Freigaben, Reporting, Export) und Mitarbeiter-Self-Service (stempeln, Salden, Anträge). Rollenabhängige Sichtbarkeit; deutschsprachig, geführte Workflows, kontextsensitive Warnungen.

**Geplanter Tech-Stack:** Next.js 16 (Turbopack) + React 19.2 + Tailwind CSS v4 + shadcn/ui auf Node.js 24 LTS / TypeScript 5.x. Auth über Keycloak 26.6 (OIDC). Interne API-Calls typsicher via tRPC (Web↔API), geteilte DTOs/Typen aus `packages/types`, gemeinsames Designsystem aus `packages/ui`. Hell-/Dunkelmodus.

**Barrierefreiheit:** WCAG 2.1 AA (Tastaturbedienung, Kontraste, Screenreader) – auch wegen BFSG.

**Status:** Platzhalter – Implementierung folgt in Phase 1 gemäß Paragraf 18.

**Architektur:** siehe [Paragraf 14 – UI/UX-Konzept](../../docs/ARCHITEKTUR.md#14-uiux-konzept).
