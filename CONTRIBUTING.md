# Mitwirken an ZeitVault

> Diese Richtlinie beschreibt, wie an ZeitVault mitgearbeitet wird: Voraussetzungen, Branch- und Commit-Konventionen, der Pull-Request-Prozess sowie Code-Stil, Tests und der ADR-Prozess. Verbindliche Grundlagen sind die Architektur in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md) (alle „Paragraf"-Verweise beziehen sich darauf), die operativen Leitplanken in [`CLAUDE.md`](CLAUDE.md) und die Sicherheitsrichtlinie in [`SECURITY.md`](SECURITY.md). Bei Konflikten ist die Architektur maßgeblich.

> **Status (2026-06-26):** Aktuell besteht das **Dokumentations- und Architekturfundament**. Das **lauffähige Code-Gerüst folgt in Phase 0** (Monorepo-Setup, Apps/Packages, CI/CD, Auth, Datenmodell, Audit-Ledger, Compose-Setup; ARCHITEKTUR Paragraf 18). Befehle und Skripte in diesem Dokument beschreiben daher die **Zielkonventionen** und werden mit dem Aufbau des Gerüsts wirksam.

---

## 1. Voraussetzungen

Für die lokale Entwicklung werden folgende Werkzeuge erwartet (Versionen sind der festgelegte, langzeitunterstützte Stand; ARCHITEKTUR Paragraf 5, [`docs/adr/0003-versions-und-update-strategie.md`](docs/adr/0003-versions-und-update-strategie.md)):

- **Node.js 24 LTS** – verbindliche Laufzeit. Keine Current-/ungeraden Linien in Produktion. Eine `.nvmrc`/`.node-version` pinnt die Linie, sobald das Gerüst steht; nutze nach Möglichkeit einen Version-Manager (`nvm`, `fnm`, `volta`).
- **pnpm 10** – verbindlicher Paketmanager (`corepack enable pnpm` aktiviert die im Repo gepinnte Version). `npm`/`yarn` werden **nicht** verwendet; die `pnpm-lock.yaml` ist die einzige gültige Lockfile und wird committet.
- **Docker + Docker Compose** – für die lokalen Abhängigkeiten (PostgreSQL 18, Valkey, Keycloak, OpenBao, Objektspeicher) und das Self-Hosted-Setup (`infra/docker`, ARCHITEKTUR Paragraf 16).

Empfohlen, sobald relevant: ein Git-Client mit aktivierten Pre-Commit-Hooks (Lint/Format), Zugriff auf die geteilten Konfigurationen aus [`packages/config`](packages/config).

> **Hinweis:** Solange das Code-Gerüst noch nicht vorliegt, betrifft die Mitarbeit primär die Dokumentation (`docs/`, ADRs, Root-Dokumente). Die obigen Laufzeit-Voraussetzungen werden für die anschließende Implementierung benötigt.

---

## 2. Monorepo-Layout (kurz)

ZeitVault ist ein **Turborepo 2.x + pnpm 10**-Monorepo (nicht Nx; [`docs/adr/0002-typescript-monorepo-und-stack.md`](docs/adr/0002-typescript-monorepo-und-stack.md)). Die maßgebliche Struktur steht in ARCHITEKTUR Paragraf 17 und im [`README.md`](README.md):

```text
apps/{api,web,mobile,ledger}        # NestJS-API, Next.js-Web, Expo-Mobile, Audit-Ledger-Service
packages/{domain,types,ui,config}   # geteilte Domänenlogik, DTOs/Typen, UI/Designsystem, zentrale Konfiguration
infra/{docker,helm,tofu}            # Compose (Self-Host), Helm-Chart (K8s), OpenTofu (Cloud)
docs/{ARCHITEKTUR.md,adr,compliance,api}  # Architektur, ADRs, GoBD/DSGVO/DATEV, generierte OpenAPI
Root: CLAUDE.md, SECURITY.md, CONTRIBUTING.md, README.md
```

Schnelldrehende Frameworks (Web/Mobile) sind über `packages/` von der stabilen Domänenlogik entkoppelt (ARCHITEKTUR Paragraf 5.1). Geteilte Typen/DTOs liegen in `packages/types`, geteilte Regel-/Berechnungslogik in `packages/domain`.

---

## 3. Branch-Strategie

- **Feature-Branches:** Jede Änderung entsteht auf einem eigenen Branch, nicht direkt auf `main`. Sprechende Präfixe sind erwünscht (z. B. `feat/`, `fix/`, `docs/`, `chore/`), gefolgt von einer kurzen Beschreibung.
- **`main` ist geschützt:** keine direkten Pushes, keine Force-Pushes; Integration ausschließlich über Pull Requests (siehe Abschnitt 5).
- **Aktiver Entwicklungs-Branch:** `claude/zeitvault-architecture-ppqs2u`. Hier wird derzeit gearbeitet; daraus werden bei Bedarf weitere Feature-Branches abgezweigt.
- Branches werden klein und fokussiert gehalten; regelmäßiges Aktualisieren gegen den Zielbranch hält die History sauber und vermeidet große Konflikte. **Major-Upgrades** erhalten stets eigene Branches/PRs und werden nie mit Feature-Arbeit gemischt (ARCHITEKTUR Paragraf 5.1).

---

## 4. Conventional Commits

Commits folgen den [Conventional Commits](https://www.conventionalcommits.org/). **Commit-Subjects werden auf Englisch** geschrieben (Dokumentation bleibt deutsch; CLAUDE.md Abschnitt 8). Format:

```text
type(scope): subject
```

- **`type`** – einer der erlaubten Typen (siehe unten).
- **`scope`** – App- oder Package-Name, z. B. `api`, `web`, `mobile`, `ledger`, `domain`, `types`, `ui`, `config`, `infra`, `docs`. Bei übergreifenden Änderungen kann der Scope entfallen.
- **`subject`** – knappe, imperative Beschreibung in englischer Sprache (klein beginnend, ohne abschließenden Punkt).

Erlaubte Typen und Beispiele:

| Typ | Bedeutung | Beispiel |
|---|---|---|
| `feat` | neue Funktionalität | `feat(api): add time entry correction workflow` |
| `fix` | Fehlerbehebung | `fix(ledger): enforce prev_hash continuity on append` |
| `docs` | Dokumentation | `docs(adr): add ADR-0006 audit ledger append-only` |
| `chore` | Wartung ohne Produktcode-Wirkung | `chore(config): bump pnpm to 10.x via corepack` |
| `refactor` | Umbau ohne Verhaltensänderung | `refactor(domain): extract rest-period rule evaluator` |
| `test` | Tests | `test(api): cover cross-tenant RLS isolation` |

Weitere zulässige Typen für die CI/Build-Pipeline: `ci`, `build`, `perf`, `style`. **Breaking Changes** werden mit `!` nach dem Scope (`feat(api)!: ...`) und/oder einem `BREAKING CHANGE:`-Footer gekennzeichnet.

Beispiel mit Body und Footer:

```text
feat(domain): add weekly working-time limit rule package

Adds a versioned rule package supporting a weekly maximum (48h)
with a configurable balancing period, in addition to the daily limit.

Refs: docs/adr/0009-compliance-regel-engine.md
```

---

## 5. Pull-Request-Prozess

Jede Änderung wird über einen **Pull Request** auf `main` integriert (PR-Pflicht, ARCHITEKTUR Paragraf 16). Branch-Protection erzwingt die Gates:

- **Grüne CI ist verpflichtend.** Die Pipeline (Lint → Test → Security-Scans → SBOM → Build → Cosign-Signatur → Release) ist das Merge-Gate; eine rote CI blockiert den Merge ausnahmslos – auch für Renovate-Update-PRs (ARCHITEKTUR Paragraf 5.1, Paragraf 16; CLAUDE.md Abschnitt 6).
- **Mindestens ein Review.** Ein PR wird erst nach mindestens einer fachlichen Freigabe gemergt. Reviews prüfen insbesondere die Einhaltung der Kern-Invarianten (Abschnitt 9).
- **Security-Scans und SBOM laufen** als Teil der Pipeline: SAST/DAST, Dependency- und Container-Scanning sowie die SBOM-Erzeugung je Release. Befunde werden vor dem Merge adressiert (Details: [`SECURITY.md`](SECURITY.md), ARCHITEKTUR Paragraf 11).
- **PR-Hygiene:** ein Thema pro PR, aussagekräftige Beschreibung (Was/Warum, betroffene Apps/Packages), Verweis auf einschlägige ADRs und – bei nicht-trivialen Entscheidungen – ein begleitender ADR (Abschnitt 8). Bei Verhaltens- oder Schema-Änderungen sind Tests Teil desselben PR (Abschnitt 7).

---

## 6. Code-Stil

- **Zentrale Konfiguration:** ESLint und Prettier werden zentral aus [`packages/config`](packages/config) bezogen; einzelne Apps/Packages erweitern diese Basis, weichen aber nicht eigenmächtig davon ab. Damit bleiben Lint-Regeln und Formatierung repoweit einheitlich.
- **TypeScript `strict`:** Die geteilte `tsconfig` aktiviert den Strict-Modus. Kein `any` als Abkürzung; öffentliche Schnittstellen sind typisiert. Geteilte DTOs/Typen liegen in `packages/types`.
- **Identifier auf Englisch:** Variablen, Funktionen, Typen sowie Tabellen-/Spaltennamen sind englisch; deutschsprachig bleiben UI-Texte und die Dokumentation (CLAUDE.md Abschnitt 8). Pfade, Befehle und Identifier werden in der Dokumentation in `Backticks` gesetzt.
- **Formatierung ist automatisiert:** Lint und Format laufen lokal (Pre-Commit) und erneut in der CI; manuelle Stildiskussionen entfallen dadurch weitgehend.

---

## 7. Tests

Tests sind **Pflicht für neuen Code** – Verhaltens- und Schema-Änderungen kommen ohne begleitende Tests nicht durch das Review (CLAUDE.md Abschnitt 6).

- **Drei Ebenen:** Unit-Tests (Logik/Funktionen), Integrationstests (DB, RLS-Policies, Service-Grenzen, Ledger-Schreibrechte) und End-to-End-Tests für kritische Workflows (Stempeln, Korrektur, Genehmigung, Export).
- **Domänen-/Regel-Logik:** Die Compliance-/Regel-Engine (ARCHITEKTUR Paragraf 10, [`docs/adr/0009-compliance-regel-engine.md`](docs/adr/0009-compliance-regel-engine.md)) wird zusätzlich mit **Property-basierten Tests** und **Snapshot-Tests** gegen reale Szenarien abgesichert (Höchst-/Ruhezeit, Pausen, Feiertage, Zuschläge). Die Engine ist deklarativ und vollständig testbar.
- **Invarianten-Tests sind Pflicht:** Der Versuch, ein `TimeEntry` zu überschreiben/löschen oder ein `AuditEvent` zu ändern, MUSS in einem Test fehlschlagen (auf DB-Ebene erzwungen). Für jede neue Tabelle/Query weist ein Test nach, dass Cross-Tenant-Zugriff über RLS verhindert wird.
- **CI als Gate:** Tests laufen in der Pipeline; rote Tests blockieren den Merge (Abschnitt 5).

---

## 8. ADR-Prozess

Nicht-triviale Architektur- und Technologieentscheidungen werden als **Architecture Decision Record (ADR)** in [`docs/adr/`](docs/adr/) festgehalten ([`docs/adr/0001-adrs-verwenden.md`](docs/adr/0001-adrs-verwenden.md)).

- **Wann ein ADR nötig ist:** bei jeder Entscheidung mit struktureller Tragweite – z. B. Wahl/Wechsel einer Technologie oder Bibliothek, Schnittstellen-/Datenmodell-Festlegungen, übergreifende Muster, Abweichungen von festgelegten Entscheidungen (Stack, OSI-/permissive Bausteine) oder Auswirkungen auf die Kern-Invarianten. Reine Umsetzungsdetails ohne Tragweite brauchen keinen ADR.
- **Nummerierung:** fortlaufend, vierstellig (`NNNN`), Dateiname in Kleinbuchstaben mit Bindestrichen (z. B. `docs/adr/0011-<kurztitel>.md`). Die nächste Nummer ergibt sich aus dem höchsten vorhandenen Index. Der ADR-Index wird in [`CLAUDE.md`](CLAUDE.md) (Abschnitt 10) gepflegt.
- **Vorlage:** [`docs/adr/0000-adr-vorlage.md`](docs/adr/0000-adr-vorlage.md). Verbindliches Format (Überschriften exakt):

```markdown
# ADR-NNNN: <Titel>
**Status:** Akzeptiert – 2026-06-26
## Kontext
## Entscheidung
## Begründung
## Konsequenzen
(Unterpunkte Positiv / Negativ / Neutral)
## Betrachtete Alternativen
## Verweise
(Paragrafen in ../ARCHITEKTUR.md sowie verwandte ADRs als relative Links)
```

Cross-References zwischen ADRs und zur Architektur erfolgen über **relative Pfade**. Ein neuer ADR wird gemeinsam mit der zugehörigen Änderung als PR eingereicht.

---

## 9. Compliance- und Sicherheits-Leitplanken

Verbindliche Detailregeln stehen in [`CLAUDE.md`](CLAUDE.md) und [`SECURITY.md`](SECURITY.md). Folgende **fünf Kern-Invarianten** sind nicht verhandelbar und werden in jedem Review geprüft:

1. **`TimeEntry` wird niemals überschrieben oder gelöscht.** Korrektur = neuer Datensatz mit erhöhter `revision`, `previous_entry_id` und Pflicht-`correction_reason` (GoBD).
2. **Jede lohn-/sicherheitsrelevante Aktion** (Erfassung, Korrektur, Genehmigung, Export, Rechteänderung) erzeugt ein unveränderliches `AuditEvent` im getrennten, append-only, hash-verketteten Audit-Ledger.
3. **Jede Tabelle führt `tenant_id`;** RLS erzwingt Mandantentrennung auf DB-Ebene. Kein Request ohne gültigen Tenant-Kontext (aus dem Auth-Token); Self-Hosted = `tenant_id = 'default'`, RLS bleibt aktiv.
4. **Aufbewahrungspflichtige Daten** werden nicht hart gelöscht, sondern gesperrt/pseudonymisiert bis Fristablauf (Löschen vs. Aufbewahren).
5. **Datensparsamkeit:** GPS/Geofencing standardmäßig **deaktiviert**, nur per Betriebsvereinbarung aktivierbar (Mitbestimmung BetrVG Paragraf 87).

Ergänzend gilt: keine Secrets im Repo (Verwaltung über OpenBao/SOPS), Least Privilege (RBAC + ABAC), MFA-Pflicht für Admins. Konkrete DATEV-Feldlayouts werden **nicht erfunden oder geraten** – maßgeblich ist ausschließlich die offizielle DATEV-Schnittstellenbeschreibung (ARCHITEKTUR Paragraf 15.1).

> Hinweis: Diese Zusammenfassung rechtlicher Rahmenbedingungen ersetzt keine Rechtsberatung; maßgeblich sind die offiziellen Quellen.

---

## 10. Lizenz und CLA/DCO

Das **Lizenzmodell des Codes** (proprietär vs. teils offen) ist eine **offene Produktentscheidung von DariaTech** und noch nicht festgelegt (ARCHITEKTUR Paragraf 19). Dieses Repository enthält daher (noch) **keine** `LICENSE`-Datei; bis zur Festlegung gelten alle Rechte als vorbehalten.

Ob Beiträge ein **Contributor License Agreement (CLA)** oder einen **Developer Certificate of Origin (DCO)** erfordern, ist **noch zu klären** und an die Lizenzentscheidung gekoppelt. Sobald entschieden, wird das Verfahren hier ergänzt und im PR-Prozess (Abschnitt 5) verankert.
