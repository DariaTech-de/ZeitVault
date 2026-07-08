# ADR-0017: stamp_events als einzige Ereignisquelle, time_entries als deterministische Projektion

**Status:** Akzeptiert – 2026-07-08

## Kontext

Es existieren zwei parallele Zeitmodelle: `stamp_events` (append-only
Rohereignisse, reale Erfassung über Web/Mobile/Terminal) und `time_entries`
(Start/Ende-Einträge mit eigenem Schreibpfad). Zwei Schreibpfade bedeuten:
der Append-only-Schutz und der Audit-Trail sichern nur je einen Pfad, und die
Zuschlags-/Bewertungspipeline hätte zwei Quellen (Gap-Analyse, A-01/A-05/F-05).

## Entscheidung

- `stamp_events` ist die **einzige Wahrheit** (append-only, DB-Trigger).
  ALLE Erfassungsarten werden Ereignisse in diesem Strom: Stempeln,
  Nacherfassung (mit `late_entry`-Kennzeichen und Pflicht-Begründung, A-03),
  Korrekturen (bestehendes `corrects_event_id`-Muster) und
  Vertrauensarbeitszeit-Einträge (A-07).
- `time_entries` wird zur **abgeleiteten Projektion** (Zeitscheiben mit
  Start/Ende): nie direkt beschreibbar, sondern aus `stamp_events` erzeugt.
- Auflage (verbindlich): Die Projektion ist **deterministisch rekonstruierbar**
  aus (`stamp_events`, Regelsatz-Version, Einsatzort-Snapshot). Jede
  materialisierte Zeitscheibe trägt die Referenzen ihrer Erzeugung.

## Begründung

- Ein Schreibpfad → ein Trigger-Schutz, ein Audit-Trail, keine Divergenz.
- Determinismus macht Reproduzierbarkeit (F-05) und Retro-Neubewertung
  (B-10/F-04) zu einer Ableitungsfrage statt zu einem Migrationsproblem.
- Terminal und Offline-Sync sind naturgemäß Ereignisströme; ein
  Intervall-Primärmodell müsste sie verlustbehaftet umformen.

## Konsequenzen

### Positiv

- F-05 „gleicher Datenstand → identisches Ergebnis" folgt aus der Ableitung.
- A-03/A-07 laufen durch denselben geschützten Pfad wie alle Stempel.

### Negativ

- Das bestehende `time`-Modul (direkter `time_entries`-Schreibpfad) muss
  umgebaut werden; Bestandsdaten sind einmalig zu überführen (als importierte
  Ereignisse) oder einzufrieren — Entscheidung im Schnitt 1 dokumentieren.
- Projektionserzeugung braucht Versionierung und Lauf-Protokollierung.

### Neutral

- Die Faltungslogik (`foldStampDay`) wird von Tages- auf Schichtsicht
  umgestellt (Gap-Analyse BL-2) — unabhängig von dieser Entscheidung nötig.

## Betrachtete Alternativen

- **Beide Modelle parallel** – Verworfen: zwei Schreibpfade, doppelte
  Schutz-/Auditpflicht, Divergenzrisiko.
- **`time_entries` als Wahrheit, Stempel nur als UI-Eingabe** – Verworfen:
  Terminal-/Offline-Ströme sind Ereignisse; Korrektur-Nachvollziehbarkeit
  (GoBD) ist im Ereignismodell bereits gelöst.

## Verweise

- [`../requirements/payroll-compliance.md`](../requirements/payroll-compliance.md) – A-01, A-03, A-05, A-07, F-05
- [`../gap-analysis.md`](../gap-analysis.md) – Blocker BL-2, BL-7
- [ADR-0006: Audit-Ledger append-only](0006-audit-ledger-append-only.md)
- [ADR-0016: Einsatzort](0016-einsatzort-work-location.md)
