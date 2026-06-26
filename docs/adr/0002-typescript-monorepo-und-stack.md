# ADR-0002: TypeScript-Monorepo und Stack (Turborepo + pnpm)

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault ist eine Enterprise-Zeiterfassung mit drei Frontends/Backends, die eng zusammengehoeren: ein Backend (`api`), eine Web-Anwendung (`web`), eine Mobile-App (`mobile`) und ein getrennter Audit-Ledger-Dienst (`ledger`). Diese Komponenten teilen erhebliche Mengen an Logik und Vertraegen: DTOs/Typen zwischen API, Web und Mobile, Domaenenlogik (Regel-Engine, Berechnungen) sowie Konfigurations- und UI-Bausteine. Die Architektur ist bewusst **TypeScript-zentriert** angelegt, um diese Teilung verlustfrei und typsicher zu ermoeglichen und um eine exzellente Eignung fuer die Entwicklung mit Claude Code zu erreichen (Paragraf 5).

Daraus ergeben sich mehrere Kraefte und Spannungsfelder:

- **Code- und Typ-Teilung:** Vertraege (DTOs) und Domaenenlogik sollen einmal definiert und ueberall konsistent genutzt werden. Ein interner `tRPC`-Kanal (Web <-> API) und geteilte Regeln verlangen einen gemeinsamen Typ-Raum (Paragraf 5).
- **Update-Sicherheit und Kopplungsrisiko:** Die Versions- und Update-Strategie (Paragraf 5.1) verlangt, schnelldrehende Teile (Web-/Mobile-Frameworks) von der stabilen Domaenenlogik zu entkoppeln und die Kopplung an einzelne Framework-Majors gering zu halten. Ein Monorepo-Werkzeug, das selbst eng an Framework-Versionen gekoppelt ist, erhoeht das Upgrade-Risiko und widerspricht damit Paragraf 5.1.
- **Repo-Struktur:** Die Zielstruktur ist in Paragraf 17 vorgegeben (`apps/{api,web,mobile,ledger}`, `packages/{domain,types,ui,config}`).
- **Laufzeit/Sprache:** Node.js 24 LTS und TypeScript 5.x sind gesetzt (Paragraf 5).

Paragraf 5 nennt fuer das Monorepo-Werkzeug explizit eine Wahlmoeglichkeit (`Nx 21` *oder* `Turborepo 2.x` + `pnpm 10`). Diese ADR trifft die verbindliche Auswahl.

## Entscheidung

Wir bauen ZeitVault als **TypeScript-zentriertes Monorepo** mit **Turborepo 2.x** und **pnpm 10** als Paketmanager.

Das Monorepo enthaelt vier Anwendungen und geteilte Pakete gemaess Paragraf 17:

- `apps/api` - Backend als modularer Monolith (NestJS 11).
- `apps/web` - Web-Anwendung fuer Admin und Self-Service (Next.js 16).
- `apps/mobile` - Mobile-App fuer iOS und Android (Expo SDK 56).
- `apps/ledger` - getrennter Audit-Ledger-Dienst (NestJS 11), bewusst als eigener Dienst hinter einer Vertrauensgrenze.
- `packages/{domain,types,ui,config}` - geteilte Domaenenlogik, DTOs/Typen, UI-Bausteine und Konvention/Konfiguration.

Turborepo dient ausschliesslich als duenne Schicht fuer Task-Orchestrierung und Build-/Test-Caching; `pnpm`-Workspaces verwalten Abhaengigkeiten und die internen Paket-Verknuepfungen.

## Begruendung

- **Code- und Typ-Teilung als Kernanforderung:** Ein TypeScript-Monorepo erlaubt, DTOs/Typen (`packages/types`) und Domaenenlogik (`packages/domain`) einmal zu definieren und in `api`, `web`, `mobile` und `ledger` typsicher zu verwenden. Der interne `tRPC`-Kanal zwischen Web und API profitiert direkt vom gemeinsamen Typ-Raum (Paragraf 5).
- **Exzellente Eignung fuer Claude Code:** Eine einheitliche Sprache, eine Werkzeugkette und eine zusammenhaengende Codebasis erleichtern automatisierte Entwicklung, Navigation und Refactoring ueber Paketgrenzen hinweg (Paragraf 5).
- **Geringe Kopplung statt Framework-Bindung:** Turborepo ist bewusst eine **duenne Schicht** (Task-Runner plus Caching). Es kennt die Framework-Majors der Apps nicht und schreibt keine framework-spezifischen Plugin-Versionen vor. Damit ist es deutlich weniger an Framework-Majors gekoppelt als ein integriertes Build-System mit eigenen Framework-Plugins. Das senkt das Upgrade-Risiko und entspricht direkt dem Entkopplungsprinzip und der Update-Sicherheit aus Paragraf 5.1 (siehe auch [ADR-0003](0003-versions-und-update-strategie.md)).
- **Konsistenz mit gesetztem Stack:** `pnpm 10` ist als Paketmanager gesetzt (Paragraf 5); committete Lockfiles (`pnpm-lock.yaml`) sind zentraler Bestandteil der reproduzierbaren Builds aus Paragraf 5.1.

## Konsequenzen

### Positiv

- Geteilte Typen und Domaenenlogik verhindern Vertragsdrift zwischen API, Web und Mobile; Aenderungen an DTOs werden zur Compile-Zeit ueber alle Konsumenten sichtbar.
- Turborepo-Caching beschleunigt CI-Laeufe (Lint/Test/Build), ohne die Pipeline-Struktur aus Paragraf 5 zu veraendern.
- Die duenne Werkzeugschicht reduziert Major-Upgrade-Schmerz: Apps koennen ihre Framework-Majors weitgehend unabhaengig vom Monorepo-Werkzeug aktualisieren (passend zu Paragraf 5.1 und [ADR-0003](0003-versions-und-update-strategie.md)).
- Eine einzige, kohaerente Codebasis verbessert die Eignung fuer Claude Code und vereinfacht Onboarding.

### Negativ

- Ein Monorepo erfordert Disziplin bei Paketgrenzen und Abhaengigkeitsrichtungen (z. B. `domain`/`types` duerfen nicht auf App-Code zeigen), sonst entstehen Zyklen.
- `pnpm`-Workspaces und Turborepo-Pipelines (`turbo.json`, Task-Graphen) muessen initial korrekt aufgesetzt und gepflegt werden.
- Turborepo bietet bewusst weniger eingebaute Generatoren/Plugins als integrierte Build-Systeme; entsprechende Konventionen muessen selbst etabliert werden (z. B. in `packages/config`).

### Neutral

- Der `ledger` bleibt ein **getrennter** Dienst innerhalb desselben Repos; die Trennung als Vertrauensgrenze (Paragraf 9) ist eine Laufzeit-/Deployment-Eigenschaft, kein Argument fuer ein eigenes Repo.
- Die konkreten Patch-Staende von Turborepo, pnpm und den Frameworks werden per Lockfile fixiert und ueber Renovate gepflegt (Paragraf 5.1, [ADR-0003](0003-versions-und-update-strategie.md)).
- Die Wahl des Monorepo-Werkzeugs ist unabhaengig von der ORM-/Migrations-Wahl; diese ist in [ADR-0005](0005-orm-drizzle.md) (Drizzle) getroffen.

## Betrachtete Alternativen

- **Nx 21** - Geprueft und abgelehnt. Nx ist als integriertes Build-System leistungsfaehig (Generatoren, Graph, Plugins), bindet das Monorepo aber ueber framework-spezifische Plugins enger an die jeweiligen Framework-Majors. Daraus folgen zusaetzliche Plugin-Migrationen bei Major-Upgrades, mehr Kopplung und ein hoeheres Upgrade-Risiko - das widerspricht der Update-Sicherheit aus Paragraf 5.1 und dem dortigen Entkopplungsprinzip. Turborepo + pnpm decken den benoetigten Funktionsumfang (Task-Orchestrierung, Caching) bei geringerer Kopplung ab.
- **Polyrepo (getrennte Repositories pro App)** - Abgelehnt. Getrennte Repositories machen das geteilte, typsichere Nutzen von DTOs und Domaenenlogik schwerfaellig (Veroeffentlichung interner Pakete, Versionsabgleich, atomare Cross-Cutting-Aenderungen). Das laeuft der Kernanforderung Code-/Typ-Teilung (Paragraf 5) zuwider.
- **Nicht-TypeScript-Backend (.NET / Spring Boot)** - Abgelehnt im Sinne der Stack-Setzung. Die Architektur bliebe mit einem .NET-/Java-Backend grundsaetzlich gueltig (vgl. Paragraf 5 und Paragraf 19), TypeScript ist jedoch fuer ZeitVault gesetzt - wegen durchgaengiger Typ-Teilung mit Web/Mobile und bester Eignung fuer Claude Code. Ein Nicht-TS-Backend wuerde die geteilten `packages/` fuer das Backend aufgeben.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 5 - Technologie-Stack (Monorepo, Laufzeit, Backend, Web, Mobile, API-Stil)
- `../ARCHITEKTUR.md` Paragraf 5.1 - Versionsstrategie & Update-Sicherheit (Entkopplung, geringe Framework-Kopplung)
- `../ARCHITEKTUR.md` Paragraf 17 - Repository-Struktur (`apps/`, `packages/`)
- [ADR-0003: Versions- und Update-Strategie](0003-versions-und-update-strategie.md) - LTS, Pinning, Renovate, EOL, CRA
- [ADR-0005: ORM-Wahl: Drizzle](0005-orm-drizzle.md) - typsichere Schemata und Migrationen im Monorepo
