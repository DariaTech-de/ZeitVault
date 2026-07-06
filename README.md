# ZeitVault

ZeitVault ist eine Enterprise-Zeiterfassung fuer den deutschen Markt (Hersteller: DariaTech). Aus **einer einzigen Codebasis** wird die Loesung wahlweise **selbst gehostet (On-Premises / eigenes Rechenzentrum)** oder als **Cloud-/SaaS-Dienst** betrieben. ZeitVault erfuellt die deutschen arbeits-, steuer- und datenschutzrechtlichen Anforderungen (ArbZG, GoBD, DSGVO/BDSG), ist auf hoechstem Sicherheitsstandard gebaut, bietet Mitarbeitenden native Mobile-Apps und liefert Steuerberatern saubere Exporte (DATEV). Compliance und Revisionssicherheit sind im Datenmodell und in den Workflows verankert, nicht nachtraeglich aufgesetzt.

---

## Leitprinzipien

1. **Compliance by Design** - Arbeitszeitrecht, GoBD und DSGVO sind in Datenmodell und Workflows verankert.
2. **Revisionssicherheit** - erfasste Zeiten sind unveraenderbar; Korrekturen erzeugen versionierte, begruendete Datensaetze mit lueckenlosem Audit-Trail.
3. **Eine Codebasis, zwei Betriebsmodelle** - Mandantenfaehigkeit ist von Tag 1 im Modell; Self-Hosted ist eine Single-Tenant-Konfiguration desselben Codes.
4. **Datensparsamkeit** - jede Erfassung von Standort-/Verhaltensdaten ist optional, transparent und mitbestimmungspflichtig.
5. **Einfachheit vor Funktionsfuelle** - Mitarbeitende: ein Tap zum Ein-/Ausstempeln. Admins: klare Workflows statt Konfigurationsdschungel.
6. **Offene Schnittstellen** - alles, was die UI kann, kann auch die API (OpenAPI-dokumentiert).

---

## Betriebsmodelle

| Aspekt | Self-Hosted (On-Premises) | Cloud / SaaS |
|---|---|---|
| Zielkunde | Datensensible Betriebe, Behoerden, Kanzleien, Praxen | KMU, schnelle Inbetriebnahme |
| Mandanten | 1 Organisation pro Installation (`tenant_id = default`) | n Organisationen, mandantengetrennt via RLS |
| Auslieferung | Docker Compose (klein) / Helm-Chart auf Kubernetes (gross) | Kubernetes im DE/EU-Rechenzentrum |
| Datenhoheit | vollstaendig beim Kunden | Auftragsverarbeitung (AVV), DE/EU-Hosting |
| Updates | Kunde steuert Versionen (signierte Releases) | kontinuierlich durch DariaTech |
| Schluessel | Kunde (optional HSM) | KMS, optional kundenverwaltete Schluessel (BYOK) |

Beide Modelle nutzen **identische Container-Images**; Unterschiede werden ausschliesslich ueber Konfiguration (Env/Helm-Values) gesteuert, nie ueber getrennte Code-Branches. Details siehe `docs/ARCHITEKTUR.md` (Paragraf 2) und [ADR-0010](docs/adr/0010-eine-codebasis-zwei-betriebsmodelle.md).

---

## Technologie-Stack (Uebersicht)

Bewusst **TypeScript-zentriert in einem Monorepo** - maximale Code-/Typ-Teilung zwischen Backend, Web und Mobile. Versionen sind der neueste stabile Stand mit Langzeit-Support (Stand Juni 2026), nicht "bleeding edge". Vollstaendige Begruendungen in `docs/ARCHITEKTUR.md` (Paragraf 5) und den verlinkten ADRs.

| Schicht | Festgelegte Entscheidung | Hinweis |
|---|---|---|
| **Monorepo** | Turborepo **2.x** + pnpm **10** | nicht Nx (gepruefte, abgelehnte Alternative); siehe [ADR-0002](docs/adr/0002-typescript-monorepo-und-stack.md) |
| **Laufzeit/Sprache** | Node.js **24 LTS**, TypeScript **5.x** | bewusst LTS statt Current; siehe [ADR-0003](docs/adr/0003-versions-und-update-strategie.md) |
| **Backend/API** | NestJS **11** (modularer Monolith) | DI, enterprise-tauglich; Audit-Ledger als getrennter Service |
| **ORM/Migrations** | **Drizzle** | nicht Prisma; Postgres-native Features (RLS, Partitionierung, append-only Trigger, eingeschraenkte Grants); siehe [ADR-0005](docs/adr/0005-orm-drizzle.md) |
| **Datenbank** | PostgreSQL **18** | Row-Level Security (RLS) + Partitionierung; siehe [ADR-0004](docs/adr/0004-mandantenfaehigkeit-postgres-rls.md) |
| **Auth/IdM** | Keycloak **26.6** | OIDC + SAML, MFA-Pflicht fuer Admins; siehe [ADR-0008](docs/adr/0008-auth-keycloak-oidc-saml.md) |
| **Web** | Next.js **16** + React **19.2** + Tailwind CSS **v4** + shadcn/ui | Admin + Self-Service, rollenabhaengige Bereiche |
| **Mobile** | Expo SDK **56** (React Native **0.85**) | iOS + Android aus einer Codebasis, Offline-First |
| **API-Stil** | REST + OpenAPI **3.1** (extern), tRPC (intern Web<->API) | breite Kompatibilitaet + typsichere interne Calls |
| **Cache/Queues** | **Valkey 9.x** + BullMQ | statt Redis; lizenzsicher (BSD); siehe [ADR-0007](docs/adr/0007-osi-permissive-bausteine.md) |
| **Objektspeicher** | EU-Provider-S3 (Cloud) bzw. SeaweedFS/MinIO (Self-Host) | WORM-Ablage fuer das Ledger |
| **Audit-Ledger** | getrennter NestJS-Service (append-only, hash-verkettet) | Vertrauensgrenze; siehe [ADR-0006](docs/adr/0006-audit-ledger-append-only.md) |
| **Container** | Docker + Compose (klein) / Helm + Kubernetes (gross) | identische Images fuer beide Betriebsmodelle |
| **IaC** | **OpenTofu 1.12** | statt Terraform (OSI-Lizenz); siehe [ADR-0007](docs/adr/0007-osi-permissive-bausteine.md) |
| **Secrets** | **OpenBao** / SOPS | statt HashiCorp Vault; Rotation, keine Klartext-Secrets |
| **Observability** | OpenTelemetry + Prometheus + Grafana/Loki | als getrennte Ops-Tools betrieben |
| **Compliance-Engine** | versionierte Regelpakete (ArbZG-Modelle) | siehe [ADR-0009](docs/adr/0009-compliance-regel-engine.md) |
| **CI/CD** | GitHub Actions | Lint -> Test -> Security-Scans -> SBOM -> Build -> Cosign-Signatur -> Release |

### Kern-Invarianten (harte MUSS-Regeln)

- **`TimeEntry` wird niemals ueberschrieben oder geloescht.** Korrektur = neuer Datensatz mit erhoehter `revision`, `previous_entry_id` und Pflicht-`correction_reason` (GoBD).
- **Jede lohn-/sicherheitsrelevante Aktion** (Erfassung, Korrektur, Genehmigung, Export, Rechteaenderung) erzeugt ein unveraenderliches `AuditEvent` im getrennten, append-only, hash-verketteten Audit-Ledger.
- **Jede Tabelle fuehrt `tenant_id`**; RLS erzwingt Mandantentrennung auf DB-Ebene. Kein Request ohne gueltigen Tenant-Kontext (aus Auth-Token). Self-Hosted = `tenant_id = default`, RLS bleibt aktiv.
- **Aufbewahrungspflichtige Daten** werden nicht hart geloescht, sondern gesperrt/pseudonymisiert bis Fristablauf.
- **Datensparsamkeit:** GPS/Geofencing standardmaessig deaktiviert, nur per Betriebsvereinbarung aktivierbar (Mitbestimmung BetrVG Paragraf 87).

---

## Monorepo-Layout

Gemaess `docs/ARCHITEKTUR.md` (Paragraf 17):

```text
zeitvault/
|- apps/
|  |- api/                 # NestJS Backend (modularer Monolith)
|  |- web/                 # Next.js (Admin + Self-Service)
|  |- mobile/              # React Native (Expo)
|  +- ledger/              # Audit-Ledger-Service (append-only)
|- packages/
|  |- domain/              # geteilte Domaenenlogik (Regeln, Berechnungen)
|  |- types/               # geteilte DTOs/Typen (API <-> Web <-> Mobile)
|  |- ui/                  # geteilte UI-Komponenten / Designsystem
|  +- config/              # ESLint, TS-Config, Konventionen
|- infra/
|  |- docker/              # Compose fuer Self-Hosted
|  |- helm/                # Helm-Chart fuer Kubernetes
|  +- tofu/                # Cloud-Provisionierung (OpenTofu)
|- docs/
|  |- ARCHITEKTUR.md       # verbindliche Architektur-Grundlage
|  |- adr/                 # Architecture Decision Records
|  |- compliance/          # GoBD, DSGVO (VVT, AVV, DSFA), DATEV-Referenz
|  +- api/                 # generierte OpenAPI-Spezifikation
|- CLAUDE.md               # Konventionen & Leitplanken fuer Claude Code
|- SECURITY.md
|- CONTRIBUTING.md
+- README.md
```

---

## Projektstatus

**Stand 2026-06-26:** Architektur-/Dokumentationsfundament **und** Phase-0-Backend-Geruest vorhanden:

- **Vorhanden (verifiziert: `pnpm lint`, `typecheck`, `test`, `build` gruen):**
  - Monorepo-Spine (Turborepo + pnpm, geteilte TS-/ESLint-/Prettier-Konfiguration).
  - `packages/types` (DTOs/Zod-Schemata), `packages/domain` (versionierte ArbZG-Regel-Engine **mit Tests**).
  - `apps/api` (NestJS 11): RLS-Tenant-Kontext (`SET LOCAL`), Drizzle-Schema + Migration mit RLS-Policies und GoBD-Unveraenderbarkeits-Trigger, unveraenderliche `TimeEntry`-Korrektur (neue Revision), Audit-Anbindung, Health/OpenAPI.
  - `apps/ledger` (NestJS 11): append-only, hash-verketteter Audit-Trail mit Ketten-Verifikation (**mit Tests**).
  - `infra/docker` (Compose-Stack inkl. Postgres 18, Valkey, Keycloak, OpenBao, SeaweedFS) und GitHub-Actions-CI (Lint/Typecheck/Test/Build, CodeQL, Dependency-Review, SBOM).
- **Noch offen:** `apps/web` (Next.js) und `apps/mobile` (Expo) sind **Phase 1**; Keycloak-Token-Verifikation, DATEV-Export und eAU folgen in spaeteren Phasen (siehe Roadmap).

Aktiver Entwicklungs-Branch: `claude/zeitvault-architecture-ppqs2u`; `main` ist geschuetzt.

> Hinweis: Ziellaufzeit ist Node.js **24 LTS**. Lokale Builds laufen auch auf aelteren LTS-Linien (kein harter Engine-Abbruch).

---

## Erste Schritte

```bash
corepack enable           # pnpm 10 aktivieren
pnpm install              # Abhaengigkeiten installieren
pnpm lint                 # ESLint
pnpm typecheck            # TypeScript
pnpm test                 # Vitest (Regel-Engine, Korrektur-Logik, Hash-Kette)
pnpm build                # alle Pakete bauen

# Lokaler Stack (Postgres, Valkey, Keycloak, OpenBao, SeaweedFS, api, ledger):
docker compose -f infra/docker/docker-compose.yml up -d --build
pnpm --filter @zeitvault/api    db:migrate
pnpm --filter @zeitvault/ledger db:migrate
```

---

## Dokumentation

- [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) - verbindliche Architektur-Grundlage (das Was und Warum)
- [`docs/BEDIENUNGSHANDBUCH.md`](docs/BEDIENUNGSHANDBUCH.md) - Bedienungshandbuch fuer Administratoren und Vorgesetzte (auch als In-App-Hilfe unter `/hilfe`)
- [`CLAUDE.md`](CLAUDE.md) - Konventionen & Leitplanken fuer die Entwicklung mit Claude Code
- [`docs/adr/`](docs/adr/) - Architecture Decision Records (Entscheidungen mit Kontext und Begruendung)
- [`docs/compliance/`](docs/compliance/) - GoBD, DSGVO (VVT/RoPA, AVV, DSFA) und DATEV-Referenz
- [`SECURITY.md`](SECURITY.md) - Sicherheitsrichtlinie und Meldewege
- [`CONTRIBUTING.md`](CONTRIBUTING.md) - Beitragsrichtlinien (Conventional Commits, PR-/Branch-Regeln)

---

## Roadmap (Kurzfassung)

| Phase | Inhalt | Ergebnis |
|---|---|---|
| **0 - Fundament** | Monorepo, CI/CD, Auth (Keycloak), Mandanten/RLS, Kern-Datenmodell, Audit-Ledger, Compose-Setup | lauffaehiges Geruest, sicher & mandantenfaehig |
| **1 - MVP Zeiterfassung** | Kommen/Gehen Web + Mobile, Pausen, Korrektur-Workflow, ArbZG-Live-Pruefung, Basis-Admin | rechtssicheres Stempeln, demonstrierbar |
| **2 - Abwesenheit & Konten** | Urlaub/Krankheit, Genehmigungen, Arbeitszeitkonten, Feiertagskalender | vollstaendiger Arbeitsalltag abgedeckt |
| **3 - Export & Reporting** | DATEV LODAS/Lohn und Gehalt, Mapping-Engine, GoBD-Pruefexport, Stundenzettel, Auswertungen | Steuerberater-Anbindung produktiv |
| **4 - Cloud-Haertung** | Multi-Tenant-SaaS, Helm/K8s, Billing, BYOK, C5-/ISO-Vorbereitung | SaaS-Angebot startklar |
| **5 - Zertifizierung & Ausbau** | Penetrationstest, eAU, Dienstplan/Projektzeit, Zertifizierungen | Enterprise-Reife |

Details siehe `docs/ARCHITEKTUR.md` (Paragraf 18).

---

## Lizenz

Das Lizenzmodell des Codes (proprietaer vs. teils offen) ist eine **offene Produktentscheidung von DariaTech** und noch nicht festgelegt (siehe `docs/ARCHITEKTUR.md`, Paragraf 19). Dieses Repository enthaelt daher (noch) **keine** `LICENSE`-Datei. Bis zur Festlegung gelten alle Rechte als vorbehalten.

---

*Hinweis: Dieses Dokument und die verlinkte Architektur-/Compliance-Dokumentation fassen rechtliche Rahmenbedingungen (ArbZG, GoBD, DSGVO) fuer die technische Planung zusammen und ersetzen keine Rechtsberatung. Fuer die verbindliche Auslegung sowie fuer DATEV-Formate sind die offiziellen Quellen bzw. fachkundige Beratung massgeblich.*
