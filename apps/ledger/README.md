# apps/ledger

**Zweck:** Getrennter Audit-Ledger-Service von ZeitVault – der Vertrauensanker des Systems. Er ist von Anfang an als eigener Dienst getrennt, weil Revisionssicherheit eine harte Vertrauensgrenze braucht. Jede lohn-/sicherheitsrelevante Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteänderung) schreibt hier ein unveränderliches `AuditEvent`.

**Geplanter Tech-Stack:** eigener NestJS-Service auf Node.js 24 LTS / TypeScript 5.x (optional Go für hohen Durchsatz), PostgreSQL 18 mit append-only Triggern und eingeschränkten Grants via Drizzle, WORM-Ablage der periodischen Versiegelung in S3 (EU-Provider bzw. SeaweedFS/MinIO).

**Harte MUSS-Invarianten:** append-only (kein Update/Delete), Hash-Verkettung über `prev_hash` (manipulationsevidente Kette), periodische signierte Versiegelung in WORM-S3, getrennte Schreibrechte (Anwendungs-DB-User darf nur einfügen). Jeder Eintrag führt `tenant_id`; RLS bleibt aktiv.

**Status:** Platzhalter – Implementierung folgt in Phase 0 gemäß Paragraf 18.

**Architektur:** siehe [Paragraf 9 – Revisionssicherheit & Audit](../../docs/ARCHITEKTUR.md#9-revisionssicherheit--audit-gobd-kern) und [ADR-0006 (Audit-Ledger)](../../docs/adr/0006-audit-ledger-append-only.md).
