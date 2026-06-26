# ADR-0005: ORM-Wahl: Drizzle

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault braucht ein Werkzeug fuer Datenbankzugriff (ORM/Query-Builder) und Schema-Migrationen. PostgreSQL 18 ist als Datenbank gesetzt (Paragraf 5), und die Architektur nutzt bewusst eine Reihe **Postgres-nativer Faehigkeiten**, die ueber reinen CRUD-Zugriff hinausgehen. Paragraf 5 nennt fuer das ORM/Migrations-Werkzeug explizit eine Wahlmoeglichkeit (`Prisma 6` *oder* `Drizzle`); diese ADR trifft die verbindliche Auswahl.

Daraus ergeben sich mehrere Kraefte und Spannungsfelder:

- **Row-Level Security (RLS) als tragende Saeule:** Die Mandantentrennung wird auf DB-Ebene ueber RLS-Policies erzwungen, der Tenant-Kontext je Request via `SET LOCAL` auf die Transaktion gesetzt ([ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md), Paragraf 7). Das Werkzeug muss RLS-Policies und transaktionsgebundenen Kontext erstklassig abbilden koennen - nicht als Fremdkoerper neben dem Schema.
- **Postgres-Features im Audit-Ledger:** Der Audit-Ledger ist append-only, hash-verkettet und arbeitet mit Partitionierung, append-only Triggern und bewusst **eingeschraenkten Grants** (der Anwendungs-DB-User darf nur einfuegen, nicht aendern/loeschen). Diese Konstrukte sind Postgres-spezifisch und Kern der Revisionssicherheit (Paragraf 9, [ADR-0006](0006-audit-ledger-append-only.md)).
- **Partitionierung der Kern-Daten:** PostgreSQL 18 wird auch wegen Partitionierung gewaehlt (Paragraf 5); zeitreihennahe Tabellen (z. B. `TimeEntry`) profitieren davon. Das Werkzeug darf Partitionierung nicht verstecken oder erschweren.
- **SQL-Transparenz und Kontrolle:** Die genannten Konstrukte (RLS-Policies, Trigger, Partitionierung, Grants) sind kein Randthema, sondern bilden harte Compliance-Invarianten ab (GoBD-Revisionssicherheit, Mandantentrennung). Sie muessen im Schema-Code sichtbar, versioniert und in Migrationen nachvollziehbar sein.
- **Update- und Lock-in-Risiko:** Die Versions- und Update-Strategie verlangt, die Kopplung an einzelne Werkzeuge gering zu halten und Volatiles zu entkoppeln (Paragraf 5.1, [ADR-0003](0003-versions-und-update-strategie.md)). Ein ORM mit eigener Engine/eigenem Query-Layer erhoeht die Bindung; ein duenneres, SQL-nahes Werkzeug senkt sie.
- **TypeScript-Monorepo:** Schemata und Typen sollen typsicher und im geteilten Code (`packages/`) nutzbar sein (Paragraf 5, [ADR-0002](0002-typescript-monorepo-und-stack.md)).

## Entscheidung

Wir verwenden **Drizzle** als ORM- und Migrations-Werkzeug fuer ZeitVault.

Konkret gilt:

- **Schema in TypeScript, SQL-transparent:** Tabellen, Indizes und Beziehungen werden mit Drizzle in TypeScript definiert; das erzeugte SQL bleibt nachvollziehbar und nah an dem, was tatsaechlich in der Datenbank ausgefuehrt wird.
- **RLS als erstklassiger Schema-Bestandteil:** RLS-Policies werden ueber Drizzles `pgPolicy` (bzw. `pgTable` mit aktivierter RLS) im Schema selbst definiert und mit den Migrationen ausgerollt - nicht als separates, manuell gepflegtes SQL-Beiwerk (passend zu [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).
- **Tenant-Kontext pro Transaktion:** Der Tenant-Kontext wird je Request transaktionsgebunden via `SET LOCAL app.tenant_id = ...` gesetzt, worauf sich die RLS-Policies beziehen. Drizzle erlaubt diese pro-Transaktion-Steuerung direkt.
- **Volle Kontrolle ueber Postgres-Konstrukte:** Partitionierung, append-only Trigger und eingeschraenkte Grants (insbesondere fuer den Audit-Ledger, [ADR-0006](0006-audit-ledger-append-only.md)) werden ueber Drizzle-Migrationen verwaltet; wo noetig kommt explizites SQL in der Migration zum Einsatz, das jedoch versioniert und reviewbar bleibt.
- **Migrations-Werkzeug:** `drizzle-kit` erzeugt und verwaltet die Migrationen; diese werden committet und sind reproduzierbar (passend zu Paragraf 5.1).

Diese Entscheidung gilt fuer beide Backend-Dienste, die direkt auf PostgreSQL zugreifen: `apps/api` (modularer Monolith) und den getrennten `apps/ledger` (Audit-Ledger).

## Begruendung

- **Postgres-Naehe als Leitkriterium (ausschlaggebend):** Die tragenden Compliance- und Sicherheitsmechanismen von ZeitVault sind Postgres-native Features - RLS fuer die Mandantentrennung (Paragraf 7), Partitionierung, append-only Trigger und eingeschraenkte Grants fuer die Revisionssicherheit (Paragraf 9). Drizzle ist bewusst SQL-transparent und arbeitet mit diesen Features, statt sie hinter einer Abstraktion zu verstecken. Das macht sicherheits- und compliance-kritisches SQL im Schema-Code sichtbar, versionierbar und reviewbar.
- **Erstklassige RLS-Unterstuetzung:** RLS-Policies lassen sich ueber `pgPolicy` direkt im Drizzle-Schema deklarieren und werden mit den Migrationen ausgerollt. Damit liegt die in [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md) verbindlich gemachte Mandantentrennung im selben, typsicheren Quelltext wie die Tabellen - nicht in einem davon getrennten, manuell synchronisierten SQL-Anhang.
- **Einfache pro-Transaktion-Steuerung:** Das je Request transaktionsgebundene Setzen von `SET LOCAL app.tenant_id` (Grundlage der RLS-Auswertung) ist mit Drizzle direkt und ohne Umweg moeglich; das passt exakt zum Tenant-Kontext-Mechanismus aus [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md).
- **Volle Kontrolle fuer das Audit-Ledger:** Partitionierung, append-only Trigger und eingeschraenkte Grants - die Bausteine, die das Manipulationsverbot des Ledgers technisch durchsetzen ([ADR-0006](0006-audit-ledger-append-only.md), Kern-Invariante 2) - lassen sich ueber Drizzle-Migrationen vollstaendig und nachvollziehbar verwalten.
- **Geringe Lock-in- und Update-Kopplung:** Drizzle ist eine duenne, SQL-nahe Schicht ohne eigene Query-Engine oder separaten Generierungsschritt mit grosser Laufzeitbindung. Das senkt die Werkzeug-Bindung und das Major-Upgrade-Risiko und entspricht damit dem Entkopplungs- und Update-Sicherheitsprinzip aus Paragraf 5.1 (siehe [ADR-0003](0003-versions-und-update-strategie.md)).
- **Typsicherheit im Monorepo:** Aus dem Drizzle-Schema abgeleitete Typen lassen sich typsicher im geteilten Code nutzen und passen zur durchgaengigen Typ-Teilung des Monorepos (Paragraf 5, [ADR-0002](0002-typescript-monorepo-und-stack.md)).

## Konsequenzen

### Positiv

- RLS-Policies, Partitionierung, append-only Trigger und Grants liegen als sichtbarer, versionierter Schema-/Migrations-Code vor; sicherheits- und compliance-kritisches SQL ist reviewbar statt versteckt.
- Die Mandantentrennung aus [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md) (RLS + `SET LOCAL app.tenant_id` je Transaktion) wird direkt und idiomatisch abgebildet.
- Der Audit-Ledger ([ADR-0006](0006-audit-ledger-append-only.md)) kann seine harten Garantien (append-only, eingeschraenkte Grants, Partitionierung) ueber dasselbe Migrations-Werkzeug durchsetzen.
- Geringe Werkzeug-Bindung und SQL-Naehe senken das Major-Upgrade-Risiko (passt zu Paragraf 5.1 und [ADR-0003](0003-versions-und-update-strategie.md)).
- Aus dem Schema abgeleitete Typen unterstuetzen die durchgaengige Typ-Teilung im Monorepo (Paragraf 5, [ADR-0002](0002-typescript-monorepo-und-stack.md)).

### Negativ

- **Explizitere SQL-Naehe:** Mehr Verantwortung und Detailtiefe auf SQL-Ebene als bei einem stark abstrahierenden ORM; Entwicklerinnen und Entwickler muessen Postgres-Konzepte (RLS, Partitionierung, Trigger, Grants) verstehen, statt sie an eine Abstraktion zu delegieren.
- **Einarbeitung:** Drizzle ist weniger verbreitet und hat ein kleineres Oekosystem als der Marktfuehrer; Team-Einarbeitung und der Aufbau interner Konventionen (z. B. in `packages/config`) sind einzuplanen.
- Komfortfunktionen, die ein voll abstrahierendes ORM mitbringt (z. B. umfangreiche generierte Helfer), muessen teils selbst etabliert werden.

### Neutral

- Komplexere Migrationen (Partitionierung, Trigger, Policy-Definitionen) enthalten bewusst explizites SQL; das ist gewollt und wird wie regulaerer Code versioniert und reviewt.
- Die Korrektheit der RLS-Policies bleibt eine eigene Test-Verpflichtung (vgl. [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)); das Werkzeug erleichtert das Ausrollen, ersetzt aber die Policy-Tests nicht.
- Konkrete Patch-Staende von Drizzle und `drizzle-kit` werden per Lockfile fixiert und ueber Renovate gepflegt (Paragraf 5.1, [ADR-0003](0003-versions-und-update-strategie.md)).
- Die Entscheidung ist **vor Phase 0** guenstig revidierbar (Paragraf 18); ab dem Aufbau des Schemas/der Migrationen steigen die Wechselkosten.

## Betrachtete Alternativen

- **Prisma 6** - Geprueft und abgelehnt. Prisma bietet eine ausgereiftere Developer Experience, eine groessere Verbreitung und ein breiteres Oekosystem - klare Pluspunkte. Fuer ZeitVault entscheidend ist jedoch die Postgres-Naehe: RLS laeuft bei Prisma spuerbar "gegen den Strich" des Modell-getriebenen Ansatzes, und die fuer den Audit-Ledger zentralen Konstrukte (Partitionierung, append-only Trigger, eingeschraenkte Grants) sind nur ueber Raw-SQL bzw. manuell gepflegte Migrationen abbildbar - also genau jene Mechanismen, die hier compliance-tragend sind ([ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md), [ADR-0006](0006-audit-ledger-append-only.md), Paragraf 7/Paragraf 9). Prisma 6 bleibt eine **valide Alternative**; da die Wahl vor Phase 0 (Paragraf 18) guenstig revidierbar ist, ist die Ablehnung bewusst eine abwaegende, keine prinzipielle.
- **Kysely** - Abgelehnt (kurz). Ein reiner, typsicherer SQL-Query-Builder mit hoher Postgres-Naehe waere fuer die genannten Features grundsaetzlich geeignet, bringt aber keine integrierte, schema-nahe Migrations- und Policy-Verwaltung mit dem von Drizzle gebotenen Komfort; der Mehrwert gegenueber Drizzle ist fuer ZeitVault gering.
- **TypeORM** - Abgelehnt (kurz). Klassisches, decorator-basiertes ORM mit traegerer Update-/Wartungsdynamik und ohne erstklassige Abbildung der hier gebrauchten Postgres-Konstrukte; passt schlechter zur SQL-Transparenz und zur geringen Update-Kopplung aus Paragraf 5.1.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 5 - Technologie-Stack (ORM/Migrations: `Prisma 6` *oder* `Drizzle`; PostgreSQL 18 mit RLS, Partitionierung, JSONB).
- `../ARCHITEKTUR.md` Paragraf 7 - Mandantenfaehigkeit (RLS, Tenant-Kontext je Request).
- `../ARCHITEKTUR.md` Paragraf 8 - Datenmodell (Kern-Entitaeten mit `tenant_id`, `TimeEntry`-Korrekturprinzip).
- `../ARCHITEKTUR.md` Paragraf 9 - Revisionssicherheit & Audit (append-only, Hash-Verkettung, getrennte Schreibrechte/eingeschraenkte Grants).
- `../ARCHITEKTUR.md` Paragraf 5.1 - Versionsstrategie & Update-Sicherheit (geringe Werkzeug-Kopplung, Entkopplung von Volatiles).
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md) - RLS-Policies und `SET LOCAL app.tenant_id` je Transaktion.
- [ADR-0006: Audit-Ledger - append-only, hash-verkettet](0006-audit-ledger-append-only.md) - Partitionierung, append-only Trigger, eingeschraenkte Grants.
- [ADR-0002: TypeScript-Monorepo und Stack](0002-typescript-monorepo-und-stack.md) - typsichere Schemata im Monorepo.
- [ADR-0003: Versions- und Update-Strategie](0003-versions-und-update-strategie.md) - Pinning, Renovate, geringe Update-Kopplung.
