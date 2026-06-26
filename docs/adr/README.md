# Architecture Decision Records (ADRs)

Dieses Verzeichnis enthaelt die **Architecture Decision Records** von ZeitVault im Nygard-Stil. Eine ADR haelt eine einzelne nicht-triviale Architektur- oder Technologieentscheidung fest: ihren Kontext, die Entscheidung selbst, die Begruendung, die Konsequenzen und die betrachteten Alternativen. ADRs werden gemeinsam mit dem Code versioniert und im selben Pull-Request reviewt.

Grundlage und verbindliche Quelle ist die Architektur in [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md); alle Paragraf-Verweise in den ADRs beziehen sich darauf. Dass ADRs ueberhaupt gefuehrt werden, ist selbst in [ADR-0001](0001-adrs-verwenden.md) festgehalten (siehe Architektur Paragraf 17).

## Index

| Nummer | Titel | Status |
|---|---|---|
| [0000](0000-adr-vorlage.md) | ADR-Vorlage | Vorlage |
| [0001](0001-adrs-verwenden.md) | Wir nutzen ADRs | Akzeptiert |
| [0002](0002-typescript-monorepo-und-stack.md) | TypeScript-Monorepo und Stack (Turborepo + pnpm) | Akzeptiert |
| [0003](0003-versions-und-update-strategie.md) | Versions- und Update-Strategie (LTS, Pinning, Renovate, EOL, CRA) | Akzeptiert |
| [0004](0004-mandantenfaehigkeit-postgres-rls.md) | Mandantenfaehigkeit via Postgres RLS | Akzeptiert |
| [0005](0005-orm-drizzle.md) | ORM-Wahl: Drizzle | Akzeptiert |
| [0006](0006-audit-ledger-append-only.md) | Audit-Ledger: append-only, hash-verkettet | Akzeptiert |
| [0007](0007-osi-permissive-bausteine.md) | OSI-/permissive Bausteine (Valkey/OpenTofu/OpenBao) | Akzeptiert |
| [0008](0008-auth-keycloak-oidc-saml.md) | Auth via Keycloak (OIDC/SAML) | Akzeptiert |
| [0009](0009-compliance-regel-engine.md) | Versionierte Compliance-/Regel-Engine | Akzeptiert |
| [0010](0010-eine-codebasis-zwei-betriebsmodelle.md) | Eine Codebasis, zwei Betriebsmodelle | Akzeptiert |

## ADR-Prozess

Eine neue ADR entsteht in wenigen Schritten:

1. **Naechste Nummer ermitteln.** ADRs sind durchgaengig vierstellig nummeriert. Die naechste Nummer ist die hoechste in der Index-Tabelle plus eins.
2. **Vorlage kopieren.** Aus [`0000-adr-vorlage.md`](0000-adr-vorlage.md) eine neue Datei `NNNN-kurz-beschreibender-titel.md` erstellen (Kleinbuchstaben, Bindestriche, keine Umlaute).
3. **Ausfuellen.** Alle Platzhalter ersetzen; Abschnitte und Reihenfolge des einheitlichen Formats beibehalten (`Kontext`, `Entscheidung`, `Begruendung`, `Konsequenzen` mit Positiv/Negativ/Neutral, `Betrachtete Alternativen`, `Verweise`).
4. **Status setzen.** Erlaubte Werte mit Datum (`JJJJ-MM-TT`):
   - **Vorgeschlagen** - in Diskussion, noch nicht verbindlich.
   - **Akzeptiert** - beschlossen und verbindlich.
   - **Abgeloest** - durch eine neuere ADR ersetzt (ersetzende ADR im Status verlinken).
   - **Verworfen** - geprueft und bewusst nicht weiterverfolgt.
5. **Index pflegen.** Die neue ADR hier in der Tabelle mit Nummer, Titel und Status eintragen.

ADRs sind **unveraenderlich**: Eine getroffene Entscheidung wird nicht umgeschrieben. Aendert sich eine Entscheidung, wird eine neue ADR angelegt, die die alte auf **Abgeloest** setzt. So bleibt der Entscheidungsverlauf vollstaendig nachvollziehbar.

Die vollstaendige Anlege-Anleitung steht in der Vorlage: [`0000-adr-vorlage.md`](0000-adr-vorlage.md).
