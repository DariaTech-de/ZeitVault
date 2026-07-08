# ADR-0018: Abrechnungstag (accounting_day) getrennt von minutengenauer Zeitscheiben-Splittung

**Status:** Akzeptiert – 2026-07-08

## Kontext

Nachtschichten überschreiten Kalendertags- und Monatsgrenzen (Anforderung
K-02): Schicht 31.01. 22:00 – 01.02. 06:00. Die Frage „welchem Tag/Monat
gehört diese Zeit?" hat zwei verschiedene, gleichzeitig gültige Antworten —
eine abrechnungsorganisatorische (Zeitkonten, Sollzeit, Payroll-Periode) und
eine gesetzliche (§ 3b Abs. 2 Satz 3 EStG: Sonntag/Feiertag sind 0–24 Uhr des
jeweiligen Tages; ArbZG-Prüfungen laufen über tatsächliche Uhrzeiten). Ein
Modell mit nur einem Wert wäre falsch.

## Entscheidung

Zwei orthogonale Konzepte, beide am Datenmodell sichtbar:

1. **`accounting_day`** := lokaler Kalendertag des **Schichtbeginns** (im
   Sinne von ADR-0016 aufgelöster Zeitzone). Er bestimmt Sollzeit-Vergleich,
   Zeitkonten-Buchung, Monats-/Payroll-Periodenzuordnung. Die Zuordnungsregel
   ist je Mandant konfigurierbar (Gegenstand der Betriebsvereinbarung); die
   Wahl ist dokumentiert und auditiert. Der Standard „Tag des Schichtbeginns"
   ist damit ein EXPLIZIT beschlossener Default (dieses ADR), kein impliziter.
2. **Minutengenaue Zeitscheiben-Splittung** nach tatsächlicher lokaler Uhrzeit
   für ALLE gesetzlichen Bewertungen: § 3b-Zuschläge (Sonntag/Feiertag 0–24 Uhr
   des jeweiligen Tages, Fortwirkung 0–4 Uhr nach § 3b Abs. 3 Nr. 2) und
   ArbZG-Prüfungen. Diese Splittung ist NICHT konfigurierbar — sie folgt dem
   Gesetz, nicht der Betriebsvereinbarung.

Beispiel: Die Schicht 31.01. 22:00 – 01.02. 06:00 gehört zum Abrechnungsmonat
Januar (accounting_day 31.01.) UND liefert sechs Stunden Februar-Zeitscheiben
für die Zuschlags-/ArbZG-Bewertung. Beides gleichzeitig.

## Begründung

- § 3b Abs. 2 Satz 3 EStG definiert Sonn-/Feiertagszeit kalendertagsscharf —
  unabhängig davon, wie der Betrieb den Abrechnungstag legt.
- Die Monatszuordnung ist dagegen eine organisatorische Festlegung
  (Betriebsvereinbarung) und muss deshalb konfigurierbar und auditierbar sein.
- Die Trennung verhindert, dass eine Konfigurationsänderung stillschweigend
  gesetzliche Bewertungen verändert.

## Konsequenzen

### Positiv

- K-02 ist ohne Widerspruch abbildbar; Zuschläge und Konten sind unabhängig
  korrekt.
- Konfiguration wirkt nur auf die organisatorische Achse.

### Negativ

- Jede Schicht trägt zwei Sichten (Abrechnungstag + Zeitscheiben) — mehr
  Modell- und Erklärkomplexität in UI/Reports.

### Neutral

- Alternativen zur Schichtbeginn-Regel (z. B. minutengenaue Kontensplittung)
  bleiben als Mandantenkonfiguration derselben Achse möglich.

## Betrachtete Alternativen

- **Eine Pflichtwahl „Schichtbeginn ODER Splittung" für alles** – Verworfen:
  vermischt eine organisatorische mit einer gesetzlichen Frage; § 3b wäre je
  nach Wahl falsch.
- **Impliziter Default ohne ADR** – Verworfen: Anforderung K-02 verlangt
  „kein impliziter Default"; dieser Beschluss macht den Default explizit.

## Verweise

- [`../requirements/payroll-compliance.md`](../requirements/payroll-compliance.md) – K-02, K-04, C-01..C-05, B-01..B-03
- [`../gap-analysis.md`](../gap-analysis.md) – Blocker BL-1, BL-2, BL-7
- [ADR-0016: Einsatzort](0016-einsatzort-work-location.md)
- [ADR-0017: Ereignisquelle und Projektion](0017-stamp-events-als-ereignisquelle.md)
