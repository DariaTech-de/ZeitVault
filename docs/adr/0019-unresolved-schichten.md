# ADR-0019: Unresolved-Zustandsmodell für nicht beendete Schichten
**Status:** Akzeptiert – 2026-07-08

## Kontext

Vergessenes Ausstempeln ist ein Regelfall, kein Sonderfall. Schnitt 1 hatte
dafür eine Implicit-Close-Regel eingeführt: Ein `clock_in` nach mehr als 12 h
Inaktivität schloss die hängende Schicht implizit an ihrem letzten Ereignis.
Diese Regel wurde vom Product Owner verworfen, weil sie in beide Richtungen
falsch ist:

- Eine 11,5-h-Schicht mit erfasster Pause **blockierte** das nächste
  Einstempeln (Grenze nicht erreicht), obwohl die Person real vor der Uhr
  steht.
- Eine 16-h-Schicht ohne Pause wurde am letzten Ereignis „beendet" — die
  Faltung **erklärte den letzten Beweis zur Wahrheit** und definierte damit
  reale Verstöße gegen § 4/§ 5 ArbZG weg, statt sie zu melden.

Grundsatz: Ein unbekanntes Schichtende ist ein **Datenzustand**, keine
Rechenregel. Das System darf ein Ende weder erfinden (synthetisches Ereignis,
verboten nach [ADR-0017](0017-stamp-events-als-ereignisquelle.md)/GoBD) noch
erraten (Implicit-Close), noch die Erfassung neuer Arbeit blockieren.

> Hinweis: Zusammenfassungen rechtlicher Rahmenbedingungen (ArbZG, MiLoG,
> BetrVG) ersetzen keine Rechtsberatung.

## Entscheidung

Eine Schicht hat genau einen der Zustände
**`open` / `unresolved` / `closed` / `closed_by_correction`**:

1. **`open`** — läuft; letztes Ereignis liegt innerhalb der Kulanzfrist.
2. **`unresolved`** — Ende unbekannt. Eintritt auf zwei Wegen:
   ein nachfolgendes `clock_in` trifft auf eine offene Schicht (das `clock_in`
   ist **immer erfolgreich**, die Vorschicht wird sofort `unresolved`), oder
   die Kulanzfrist einer offenen Schicht läuft ohne weiteres Ereignis ab.
   Die Kulanzfrist ist zunächst eine Konstante und wandert mit B-08 als
   konfigurierbare Regel in das Tarif-/Regelwerk (`collective_agreement`).
3. **`closed`** — regulär durch `clock_out` beendet.
4. **`closed_by_correction`** — durch ein korrigierendes/nachgetragenes
   `clock_out` über den Korrekturweg beendet (append-only, Kern-Invariante 1).

Für `unresolved` gilt:

- Das Schichtende bleibt **NULL**. Es wird **kein synthetisches Ereignis**
  erzeugt (ADR-0017).
- `worked_at_least_until` = Zeitpunkt des letzten bekannten Ereignisses der
  Schicht. Das ist **ausdrücklich eine Untergrenze, nie ein Ende** — im UI
  entsprechend beschriftet („mindestens bis"), nie als Endezeit dargestellt.
  Das offene Segment nach `worked_at_least_until` wird nicht materialisiert.

**Bewertung von `unresolved`:**

- **Payroll/Export:** exportiert nicht; eine Periode mit unaufgelösten
  Schichten **blockiert den Perioden-Freeze** (F-03).
- **ArbZG-Engine:** bewertet gegen die Untergrenze. Was schon aus der
  Untergrenze folgt, ist ein sicherer Verstoß und wird gemeldet; was vom
  unbekannten Ende abhängt (z. B. Ruhezeit zur Folgeschicht), erhält den
  Befund **„nicht prüfbar"** — niemals „eingehalten".
- **G-04 Erfassungslücken:** die 7-Tage-Frist (§ 17 MiLoG,
  Aufzeichnungspflicht) ist der Anker für die Sichtbarkeit im Report.
- **E-09:** unaufgelöste Schichten eskalieren an die Führungskraft.

**Auflösung — immer durch Menschen, niemals automatisch, kein Default:**

- Regelweg: Anpassungsantrag des Mitarbeitenden, Freigabe durch die
  Führungskraft (bestehender Korrektur-Workflow).
- Ersatzweg: Die Führungskraft trägt das Ende mit **Pflichtbegründung** nach;
  das Audit hält fest, **wer** entschieden hat und **dass** der Mitarbeitende
  nicht bestätigt hat.

## Begründung

- Erfassung geht vor Bequemlichkeit: `clock_in` darf nie an einem Datenproblem
  der Vorschicht scheitern (A-01: reale Arbeit muss erfassbar sein).
- Eine Untergrenze ist ehrlich: Sie trägt die Beweislage (vgl. BAG,
  5 AZR 359/21 zur Darlegung von Arbeitszeiten), statt Vollständigkeit
  vorzutäuschen; „nicht prüfbar" ist ein ehrlicher Befund, „eingehalten" auf
  Basis geratener Enden wäre eine falsche Compliance-Aussage.
- Automatische Enden wären zudem eine verhaltensbewertende technische Regel
  (Mitbestimmung, § 87 Abs. 1 Nr. 2 BetrVG) und GoBD-widrig (erfundene
  Belege).

## Konsequenzen

- Positiv: Keine Blockade beim Einstempeln; keine weggerechneten Verstöße;
  Lohn zahlt nie auf geratene Zeiten; Auflösung ist auditierbar.
- Negativ: `unresolved` ist ein zusätzlicher Zustand in UI, Reports, Export
  und Freeze-Logik; Perioden können bis zur menschlichen Auflösung nicht
  eingefroren werden (gewollt).
- Neutral: Die Kulanzfrist-Konstante ist eine Übergangslösung bis B-08
  (Schnitt 2); G-04-Report und E-09-Eskalation binden in späteren Schnitten
  an diesen Zustand an.

## Betrachtete Alternativen

- **Implicit-Close nach 12 h Inaktivität** (Schnitt-1-Zwischenstand):
  verworfen — blockiert reale Erfassung unterhalb der Grenze und definiert
  Verstöße oberhalb weg (siehe Kontext).
- **Synthetisches `clock_out`:** verworfen — erfundener Beleg, verstößt gegen
  ADR-0017 und GoBD-Unveränderbarkeit.
- **`clock_in` blockieren bis zur Korrektur (409):** verworfen — verhindert
  die Erfassung realer Arbeitszeit und bestraft Mitarbeitende für ein
  Datenproblem.

## Verweise

- [ADR-0017](0017-stamp-events-als-ereignisquelle.md) – stamp_events als
  einzige Ereignisquelle (kein synthetisches Ereignis)
- [ADR-0018](0018-abrechnungstag-vs-zeitscheiben.md) – Abrechnungstag der
  Schicht
- [ADR-0016](0016-einsatzort-work-location.md) – Einsatzort/Bewertungskontext
- `../requirements/payroll-compliance.md` – A-01, A-04, B-08, E-09, F-03, G-04
- ARCHITEKTUR.md Paragraf 8 (Unveränderbarkeit), Paragraf 10 (Regel-Engine)
