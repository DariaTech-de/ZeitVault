# packages/domain

**Zweck:** Geteilte Domänenlogik von ZeitVault – fachliche Regeln und Berechnungen, die von API, Web und Mobile gemeinsam genutzt werden. Kern ist die versionierte Compliance-/Regel-Engine (ArbZG-Höchst-/Ruhezeit/Pausen, Feiertage, Zuschläge, Arbeitszeitmodelle), damit Gesetzesänderungen ohne Code-Umbau und ohne Datenmigration über Regelpakete abbildbar sind.

**Geplanter Tech-Stack:** reines TypeScript 5.x (framework-frei, laufzeitunabhängig) auf Node.js 24 LTS, eingebunden über Turborepo 2.x + pnpm 10. Deklarative Regeln (Bedingung → Bewertung/Warnung), vollständig testbar (Property-/Snapshot-Tests). Bewertung läuft live (Warnung beim Stempeln) und im Stapellauf (Monatsabschluss, Verstoßreport).

**Architektur-Hinweis:** Dieses Paket entkoppelt die stabile Domänenlogik von schnelldrehenden Frameworks (Web/Mobile). Regeln liegen als versionierte Regelpakete mit Gültigkeitszeitraum vor.

**Status:** Phase-0-Gerüst vorhanden und verifiziert (19 Tests grün): ArbZG-Regel-Engine in `src/arbzg` – tägliche Höchstarbeitszeit (8 h/10 h), Ruhezeit (≥ 11 h) und Pflichtpausen (30/45 min) als deklarative Bewertung, versioniertes Regelpaket `ARBZG_2026_V1` und `selectRulePackage` (datierte Gültigkeit). Feiertagskalender und Zuschläge folgen (Phase 2).

**Architektur:** siehe [Paragraf 10 – Regel-/Compliance-Engine](../../docs/ARCHITEKTUR.md#10-regel-compliance-engine) und [ADR-0009 (Regel-Engine)](../../docs/adr/0009-compliance-regel-engine.md).

> Hinweis: fasst rechtliche Rahmenbedingungen für die technische Umsetzung zusammen und ersetzt keine Rechtsberatung.
