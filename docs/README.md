# ZeitVault - Dokumentation

Dieses Verzeichnis buendelt die technische und regulatorische Dokumentation von **ZeitVault**, der Enterprise-Zeiterfassung von DariaTech fuer den deutschen Markt. ZeitVault wird aus **einer Codebasis** in **zwei Betriebsmodellen** ausgeliefert (Self-Hosted On-Premises und Cloud/SaaS).

Verbindliche Grundlage ist die Architektur in [`ARCHITEKTUR.md`](ARCHITEKTUR.md). Alle Paragraf-Verweise in den hier abgelegten Dokumenten (z. B. "Paragraf 17") beziehen sich auf dieses Dokument.

Die Struktur dieses Verzeichnisses folgt der Repository-Struktur aus Architektur Paragraf 17: `docs/{ARCHITEKTUR.md, adr, compliance, api}`.

## Inhalt

| Eintrag | Beschreibung |
|---|---|
| [`ARCHITEKTUR.md`](ARCHITEKTUR.md) | **Verbindliche Architektur-Grundlage.** Vollstaendige Systemarchitektur, Technologie-Stack (Stand Juni 2026), Datenmodell, Sicherheits- und Compliance-Konzept, Repository-Struktur und Roadmap. Quelle aller Paragraf-Verweise. |
| [`adr/`](adr/README.md) | **Architecture Decision Records.** Die einzeln nummerierten, unveraenderlichen Entscheidungs-Datensaetze (Kontext, Entscheidung, Begruendung, Konsequenzen, Alternativen). Einstieg ueber den [ADR-Index](adr/README.md). |
| [`compliance/`](compliance/) | **Regulatorische Referenzen.** Zusammenfassungen und Arbeitsgrundlagen zu **GoBD**, **DSGVO**, **ArbZG** sowie die **DATEV-Referenz** und ein **Glossar** der Fachbegriffe. |
| [`api/`](api/README.md) | **Generierte OpenAPI-Spezifikation.** Ablageort der aus der NestJS-API generierten **OpenAPI-3.1**-Spezifikation fuer die externe REST-Schnittstelle (siehe [Status](api/README.md)). |

## Architecture Decision Records (`adr/`)

Jede nicht-triviale Architektur- oder Technologieentscheidung ist als ADR im Nygard-Stil festgehalten und wird gemeinsam mit dem Code versioniert (Paragraf 17). ADRs sind unveraenderlich: Aendert sich eine Entscheidung, wird eine neue ADR angelegt, die die alte ersetzt.

Der vollstaendige, gepflegte Index liegt unter [`adr/README.md`](adr/README.md). Zentrale, bereits akzeptierte Entscheidungen:

- [ADR-0001](adr/0001-adrs-verwenden.md) - Wir nutzen ADRs
- [ADR-0002](adr/0002-typescript-monorepo-und-stack.md) - TypeScript-Monorepo und Stack (Turborepo + pnpm)
- [ADR-0003](adr/0003-versions-und-update-strategie.md) - Versions- und Update-Strategie (LTS, Pinning, Renovate, EOL, CRA)
- [ADR-0004](adr/0004-mandantenfaehigkeit-postgres-rls.md) - Mandantenfaehigkeit via Postgres RLS
- [ADR-0005](adr/0005-orm-drizzle.md) - ORM-Wahl: Drizzle
- [ADR-0006](adr/0006-audit-ledger-append-only.md) - Audit-Ledger: append-only, hash-verkettet
- [ADR-0007](adr/0007-osi-permissive-bausteine.md) - OSI-/permissive Bausteine (Valkey/OpenTofu/OpenBao)
- [ADR-0008](adr/0008-auth-keycloak-oidc-saml.md) - Auth via Keycloak (OIDC/SAML)
- [ADR-0009](adr/0009-compliance-regel-engine.md) - Versionierte Compliance-/Regel-Engine
- [ADR-0010](adr/0010-eine-codebasis-zwei-betriebsmodelle.md) - Eine Codebasis, zwei Betriebsmodelle

Die [ADR-Vorlage](adr/0000-adr-vorlage.md) und der Anlege-Prozess sind im [ADR-Index](adr/README.md) beschrieben.

## Compliance-Referenzen (`compliance/`)

Das Verzeichnis `compliance/` sammelt die regulatorischen Grundlagen, die das Produkt erfuellen muss, sowie das gemeinsame Fachvokabular:

- **GoBD** - Grundsaetze ordnungsmaessiger Buchfuehrung: Unveraenderbarkeit, Nachvollziehbarkeit und Aufbewahrung der lohn- und buchungsrelevanten Datensaetze.
- **DSGVO** - Datenschutz-Dokumentation (u. a. Verzeichnis von Verarbeitungstaetigkeiten, Auftragsverarbeitungsvertrag, Datenschutz-Folgenabschaetzung), Datensparsamkeit und Loeschen-vs.-Aufbewahren.
- **ArbZG** - Arbeitszeitgesetz: Grundlage der versionierten Compliance-/Regel-Engine (Hoechstarbeitszeiten, Ruhezeiten, Pausen).
- **DATEV-Referenz** - Ablage der **offiziellen DATEV-Schnittstellenbeschreibung** als maßgebliche Grundlage des Export-Moduls (LODAS / Lohn und Gehalt, Lohnimport-Datenservice). Feldlayouts und Datensatzformate stammen ausschliesslich aus der offiziellen Beschreibung; es werden keine Layouts erfunden.
- **Glossar** - Einheitliche Definition der wiederkehrenden Fach- und Compliance-Begriffe.

> Hinweis: Die Inhalte unter `compliance/` fassen rechtliche Anforderungen fuer die Umsetzung zusammen und ersetzen keine Rechtsberatung.

## OpenAPI-Spezifikation (`api/`)

Unter `api/` wird die aus der NestJS-API generierte **OpenAPI-3.1**-Spezifikation abgelegt. Sie dokumentiert die **externe REST-API**; die interne Kommunikation zwischen Web und API laeuft typsicher ueber tRPC (Paragraf 5, Paragraf 6).

Die Generierung wird in Phase 0+ eingerichtet (siehe [`api/README.md`](api/README.md)).

---

Aenderungen an der Architektur erfolgen ueber `ARCHITEKTUR.md` und werden bei nicht-trivialen Entscheidungen zusaetzlich als ADR dokumentiert.
