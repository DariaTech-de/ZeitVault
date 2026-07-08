# ADR-0016: Einsatzort als eigene Entität (work_location) mit Übersteuerung je Zeiteintrag

**Status:** Akzeptiert – 2026-07-08

## Kontext

Die Payroll-Compliance-Anforderungen ([C-08, K-01, K-06, F-05](../requirements/payroll-compliance.md))
verlangen die Bewertung gegen den Ort der Arbeitsstätte: Feiertage bestimmen
sich nach § 3b Abs. 2 Satz 4 EStG durch die dort geltenden Vorschriften, und
die Zeitrechnung (Tagesgrenzen, DST) braucht eine lokale Zeitzone. Heute
existiert kein Ortsbegriff im Datenmodell; bewertet wird nach UTC-Kalendertag
(Gap-Analyse, Blocker BL-1). Feiertage sind teils gemeindeabhängig
(z. B. Fronleichnam in Teilen Sachsens und Thüringens). Bau, Montage und
Außendienst wechseln den Einsatzort auch innerhalb eines Tages.

## Entscheidung

- Neue Entität `work_location` je Mandant: Land, Bundesland, optional
  Gemeindeschlüssel (AGS), IANA-Zeitzone. Das Schema lässt die
  Gemeindeauflösung zu; die gemeindescharfe Feiertagslogik darf später kommen.
- `employee.default_work_location_id` mit Gültigkeitshistorie
  (`valid_from`/`valid_to`): der Standard-Einsatzort des Mitarbeitenden.
- `work_location_id` am Zeiteintrag, nullable: übersteuert den Default für
  genau diesen Eintrag (Baustellen-/Montagefall).
- Bei jeder Bewertung wird der AUFGELÖSTE Einsatzort (inkl. Bundesland,
  Gemeindeschlüssel, Zeitzone) als **Snapshot an der Bewertung gespeichert**,
  nicht nur als Fremdschlüssel.

## Begründung

- § 3b Abs. 2 Satz 4 EStG bindet den Feiertagszuschlag an den Ort der
  Arbeitsstätte — der Monteur mit Stammsitz Bayern hat auf der Baustelle in
  Hessen an Fronleichnam keinen Feiertag. Ohne Übersteuerung je Eintrag ist
  das nicht abbildbar.
- Ein Bundesland-Enum am Mandanten oder Mitarbeitenden reicht nicht: Feiertage
  sind teils gemeindeabhängig, und Mitarbeitende wechseln Orte.
- Der Snapshot sichert Reproduzierbarkeit (F-05): eine spätere
  Stammdatenkorrektur darf abgeschlossene Bewertungen nicht still umschreiben.

## Konsequenzen

### Positiv

- Feiertags- und Zeitzonenbewertung werden ortsrichtig und rückwirkend
  nachvollziehbar; Bau/Montage/Außendienst sind abbildbar.
- Die Abstraktion „lokaler Arbeitstag" bekommt eine eindeutige Quelle.

### Negativ

- Migration: bestehende Mitarbeitende brauchen einen Default-Einsatzort;
  bestehende Bewertungen tragen noch keinen Snapshot.
- Mehr Pflegeaufwand in der Verwaltung (Einsatzorte als Stammdaten).

### Neutral

- Die Gemeindeauflösung der Feiertage ist zunächst nicht implementiert; das
  Schema (AGS-Feld) hält den Weg offen.

## Betrachtete Alternativen

- **Bundesland am Mandanten** – Verworfen: ein Mandant hat mehrere Standorte.
- **Bundesland am Mitarbeitenden ohne Historie/Übersteuerung** – Verworfen:
  Ortswechsel und § 3b Abs. 2 Satz 4 EStG (Arbeitsstätte, nicht Person).
- **Nur Fremdschlüssel ohne Bewertungs-Snapshot** – Verworfen: verletzt F-05
  (Reproduzierbarkeit), Stammdatenänderungen würden Abrechnungen umdeuten.

## Verweise

- [`../requirements/payroll-compliance.md`](../requirements/payroll-compliance.md) – C-08, K-01, K-06, F-05
- [`../gap-analysis.md`](../gap-analysis.md) – Blocker BL-1
- [ADR-0017: Ereignisquelle und Projektion](0017-stamp-events-als-ereignisquelle.md)
- [ADR-0018: Abrechnungstag vs. Zeitscheiben-Splittung](0018-abrechnungstag-vs-zeitscheiben.md)
