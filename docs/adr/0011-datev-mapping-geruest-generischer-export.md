# ADR-0011: DATEV-Mapping-Gerüst mit generischem Export

**Status:** Akzeptiert - 2026-06-26

## Kontext

Der Lohnexport nach DATEV ist in Roadmap-Phase 3 vorgesehen (Paragraf 18). Die konkreten DATEV-Feldlayouts, Satzarten und Datensatzformate (LODAS, Lohn und Gehalt, Lohnimport-Datenservice) dürfen jedoch nicht erfunden oder geraten werden; maßgeblich ist ausschließlich die offizielle DATEV-Schnittstellenbeschreibung (Paragraf 15.1, CLAUDE.md §9, [`../compliance/DATEV-REFERENZ.md`](../compliance/DATEV-REFERENZ.md)). Diese Beschreibung sowie die organisatorischen Voraussetzungen (Registrierung, Berater-/Mandantennummer, API-Zugang) sind ein **organisatorischer Blocker** (Paragraf 19) und lagen zum Umsetzungszeitpunkt nicht vor.

Gleichzeitig ist die Aggregations- und Zuordnungslogik (interne Kategorie -> Lohnart/Kostenstelle/Ausfallschlüssel) unabhängig vom konkreten Zielformat baubar und testbar. Es besteht das Spannungsfeld, die Phase-3-Wertschöpfung (auswertbarer, protokollierter Lohnexport) bereitzustellen, ohne die blockierte Formatentscheidung vorwegzunehmen.

## Entscheidung

Wir bauen ein **DATEV-Mapping-Gerüst mit generischem, neutralem CSV-Export** und verschieben das konkrete DATEV-Datensatzformat, bis die offizielle Schnittstellenbeschreibung vorliegt.

Verbindliche Regeln:

- **Konfigurierbare Mapping-Tabelle:** Die Zuordnung interne Kategorie (`work_time`, `vacation`, `sick`, `special`) -> Abrechnungsschlüssel (`lohnart`, optional `kostenstelle`, `ausfallschluessel`) ist mandantenseitig gepflegte Konfiguration, kein Code. Die Schlüsselwerte sind opake, vom Mandanten gepflegte Codes - ZeitVault gibt keine DATEV-Lohnart-Nummern vor.
- **Keine erfundenen Layouts:** Es wird kein DATEV-Datensatzformat, keine Satzart und keine Feldlänge implementiert. Die Ausgabe ist ein **generisches, neutrales CSV** mit fester, dokumentierter Spaltenstruktur (`personnel_number, category, lohnart, kostenstelle, ausfallschluessel, value, unit`).
- **Sichtbare Lücken:** Kategorien ohne Mapping-Eintrag werden nicht stillschweigend weggelassen, sondern als `unmapped` zurückgegeben, damit fehlende Zuordnungen erkennbar bleiben.
- **Protokolliert wie der GoBD-Export:** Jeder Lohnexport ist ein unveränderlicher `ExportJob` mit Prüfsumme (append-only) und erzeugt ein `AuditEvent` `export.run` ([ADR-0006](0006-audit-ledger-append-only.md), Kern-Invariante 2). Gleicher Datenstand + Zeitraum erzeugt dieselbe Prüfsumme (reproduzierbar).
- **Reine, getestete Domänenlogik:** Mapping und Serialisierung liegen in `packages/domain` und sind durch Unit-Tests abgesichert; die Aggregation (Arbeitszeit aus Stempelungen, genehmigte Abwesenheiten als Arbeitstage) erfolgt im API-Modul über RLS-konforme Queries.

## Begründung

- **Wertschöpfung ohne Vorwegnahme der blockierten Entscheidung:** Aggregation, Mapping und ein prüfbarer, protokollierter Export sind sofort nutzbar; das konkrete Format wird ergänzt, sobald die offizielle Beschreibung vorliegt - ohne die hier gebaute Engine umzuwerfen.
- **Einhaltung von CLAUDE.md §9 / Paragraf 15.1:** Indem nur ein generisches Format erzeugt und die Schlüssel als Konfiguration behandelt werden, wird kein DATEV-Layout erfunden oder geraten.
- **Konsistenz mit dem GoBD-Export (D2):** Derselbe `ExportJob`-Mechanismus mit Prüfsumme und Audit-Ereignis stellt Reproduzierbarkeit und Revisionssicherheit auch für den Lohnexport sicher (Paragraf 9, Paragraf 15.1).
- **Testbarkeit:** Die reine Mapping-/Serialisierungslogik ist deterministisch und vollständig unit-testbar; die Append-only- und RLS-Eigenschaften des `ExportJob` sind integrationsgetestet.

## Konsequenzen

### Positiv

- Phase-3-Lohnexport ist funktionsfähig, auswertbar und revisionssicher protokolliert, ohne auf die blockierte DATEV-Beschreibung zu warten.
- Die spätere Ergänzung des konkreten DATEV-Formats ist ein additiver Serialisierer auf denselben Aggregaten und Mappings - kein Umbau.
- Fehlende Mappings werden sichtbar gemacht statt stillschweigend übergangen.

### Negativ

- Das generische CSV ist nicht direkt in DATEV importierbar; bis zum Vorliegen der offiziellen Beschreibung bleibt ein manueller bzw. nachgelagerter Schritt nötig.
- Die Aggregation der Abwesenheiten zählt im Gerüst Arbeitstage (Mo-Fr) ohne Feiertagsabzug, solange kein Standort-/Bundeslandbezug am Export hängt; dies ist bei Anschluss der Standortdaten zu verfeinern.

### Neutral

- Die Liste der internen Kategorien kann erweitert werden (z. B. Zuschläge), sobald die Aggregation dafür angebunden wird.
- Ob der konkrete DATEV-Export als Dateiweg (LODAS, Lohn und Gehalt) oder über den Lohnimport-Datenservice (API) realisiert wird, bleibt offen und folgt der offiziellen Beschreibung ([`../compliance/DATEV-REFERENZ.md`](../compliance/DATEV-REFERENZ.md)).

## Betrachtete Alternativen

- **Konkretes DATEV-Format sofort implementieren** - Abgelehnt. Verstößt gegen CLAUDE.md §9 / Paragraf 15.1 (keine erfundenen Feldlayouts) und ist ohne offizielle Beschreibung nicht spezifizierbar.
- **Phase 3 vollständig auf den DATEV-Blocker warten lassen** - Abgelehnt. Die aggregierbare, mandantenkonfigurierbare Mapping-Logik ist unabhängig vom Zielformat wertvoll; ein Warten verschenkt diese Wertschöpfung ohne Compliance-Gewinn.
- **Mapping fest im Code statt als Konfiguration** - Abgelehnt. Widerspricht dem datengetriebenen Ansatz der DATEV-Referenz (mandanten-/personaltypspezifische Profile) und verhinderte Änderungen ohne Release.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 15.1 - DATEV (Mapping-Engine, Monatslauf, keine erfundenen Layouts)
- `../ARCHITEKTUR.md` Paragraf 18 - Roadmap (Phase 3: Export & Reporting)
- `../ARCHITEKTUR.md` Paragraf 19 - offene Entscheidungen (DATEV-Registrierung blockiert Phase 3)
- [`../compliance/DATEV-REFERENZ.md`](../compliance/DATEV-REFERENZ.md) - Ablage der offiziellen Beschreibung, Mapping-Grundlage, organisatorischer Blocker
- [ADR-0006: Audit-Ledger: append-only, hash-verkettet](0006-audit-ledger-append-only.md) - Export erzeugt ein `AuditEvent`
- [ADR-0009: Versionierte Compliance-/Regel-Engine](0009-compliance-regel-engine.md) - datengetriebene, versionierte Regel-/Mappinglogik
