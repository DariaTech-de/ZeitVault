# Findings (Nebenbefunde außerhalb des aktuellen Schnitts)

Arbeitsregel: Kein Scope-Creep — was unterwegs auffällt, wird hier notiert und
im passenden Schnitt bearbeitet.

## Aus Schnitt 1 (2026-07-08)

1. **Implicit-Close bei vergessenem Ausstempeln — VERWORFEN (PO-Entscheidung
   2026-07-08).** Die 12-h-Regel definierte reale §-5-/§-4-Verstöße weg
   (16-h-Schicht ohne Pause „endet" nach Faltung am letzten Ereignis) und
   blockierte legitime lange Schichten mit erfasster Pause. Ersatz ist das
   **unresolved-Zustandsmodell** ([ADR-0019](adr/0019-unresolved-schichten.md)):
   `clock_in` ist immer erfolgreich, die nicht beendete Vorschicht wird
   `unresolved` (Ende bleibt unbekannt, `workedAtLeastUntil` ist ausdrücklich
   eine Untergrenze), Auflösung ausschließlich durch Menschen.
2. **`time`-Modul (direkter `time_entries`-Schreibpfad) noch nicht konsolidiert.**
   Gemäß ADR-0017 wird `time_entries` zur deterministischen Projektion; die
   Umsetzung erfolgt mit der Zeitscheiben-Pipeline in Schnitt 4. Bis dahin
   bleibt das Doppelmodell (A-01 „teilweise").
3. **Alte Fold-API (`foldStampDay`/`computeStampStatus`/`evaluateStampDay`)**
   wird in der API nicht mehr genutzt, bleibt aber exportiert (Domain-Tests,
   Abwärtskompatibilität). Aufräumen, wenn Schnitt 4 die letzten Verbraucher
   (Vorschau-Endpunkte) migriert.
4. **Dashboard:** Chart-Achse läuft in der Zeitzone des
   Mandanten-Default-Einsatzortes (der Europe/Berlin-Fallback wurde entfernt,
   der Default ist Pflicht-Stammdatum); `presentNow` ist schichtbasiert
   (offene Schicht zählt unabhängig vom Kalendertag). Mandanten mit
   Einsatzorten in mehreren Zeitzonen sehen die Tageszuordnung je
   Mitarbeiter-Zeitzone, die Achse bleibt die des Default-Einsatzortes.
5. **GoBD-Rohdatenexport (`runGobd`) behält bewusst UTC-Periodengrenzen**
   (Rohdaten, reproduzierbare Prüfsumme; Kommentar im Code). Die fachliche
   Periodensemantik wird mit F-03/F-05 (Schnitt 5) formalisiert — Checksummen
   ändern sich dann kontrolliert.
6. **Reporting-Zeitzonenauflösung** je Mitarbeiter nutzt den Zeitraumbeginn;
   Einsatzort-Wechsel INNERHALB eines Berichtszeitraums werden erst mit der
   Zeitscheiben-Pipeline (Schnitt 4) tag-genau aufgelöst.
7. **Web-UI zeigt `lateEntry` und unaufgelöste Schichten noch nicht an** — die
   API liefert die Felder (DayListing) bereits; UI-Kennzeichnung nachziehen
   (Beschriftung „mindestens bis" für `workedAtLeastUntil`, ADR-0019).
8. **B-03-Live-Ruhezeitprüfung** fiel als Nebeneffekt der gemeinsamen
   Tagessicht an (previousShiftEnd wird beim Stempeln verkettet). Die
   10-h-Ausnahme mit Ausgleich bleibt Schnitt 3.

## Aus dem adversarialen Review zu Schnitt 1 (2026-07-08)

9. **Mandanten-Default und `active` von Einsatzorten haben keine
   Gültigkeitshistorie** (anders als `employee_work_locations`): Ein
   Default-Wechsel oder `deactivate()` ändert rückwirkend die Auflösung —
   und damit Abrechnungstag/Zeitzone — bereits bewerteter, nicht
   eingefrorener Tage. Endgültige Antwort ist der persistierte
   **Bewertungs-Snapshot** (ADR-0016), der mit der Zeitscheiben-Pipeline
   (Schnitt 4) und dem Perioden-Freeze (F-03/F-05, Schnitt 5) kommt; bis
   dahin ist das GoBD-Spannungsfeld hier dokumentiert. Bei Bedarf zusätzlich
   Gültigkeitshistorie für den Default (`valid_from`/`valid_to`) erwägen.
10. **AuditEvents werden nach dem DB-Commit an den Ledger gesendet** (alle
    Schreibpfade, nicht nur Schnitt 1): Ist der Ledger-Dienst nicht
    erreichbar, existiert die Änderung dauerhaft ohne Ledger-Event
    (Kern-Invariante 2 verletzt sich im Fehlerfall leise). Benötigt eine
    Architekturentscheidung (transaktionale Outbox oder Kompensation) —
    spätestens mit dem Perioden-Freeze (Schnitt 5), der auf
    Ledger-Vollständigkeit angewiesen ist.

## Aus Schnitt 4 (2026-07-09)

11. **Spec-AK C-08 nennt Hessen irrig als Land ohne Fronleichnam** („kein
    Fronleichnam in ganz HE"): Fronleichnam ist in Hessen LANDESWEIT
    gesetzlicher Feiertag (Hessisches Feiertagsgesetz). Der Kalender und der
    AK-Test bilden die echte Rechtslage ab (Unterscheidung stattdessen über
    BY vs. SN ohne Gemeinde-Schlüssel demonstriert); Spec-Korrektur
    empfohlen. Hinweis: ersetzt keine Rechtsberatung.
12. **`time_entries`-Konsolidierung und persistierter Bewertungs-Snapshot
    (F-05/ADR-0016) sind bewusst NICHT Teil von Schnitt 4** — die
    Zuschlags-Pipeline bewertet ad hoc gegen den aktuell aufgelösten
    Einsatzort. Der Snapshot (samt Antwort auf Nr. 9) kommt
    schnittplan-konform mit dem Perioden-Freeze in Schnitt 5 (F-03/F-05).
13. **Web-/Mobile-Erfassung bietet die Bewertungsart (C-09) noch nicht zur
    Auswahl an** — API, Offline-Sync und Korrektur-Vererbung tragen
    `workKind` bereits; UI-Auswahl (Kommen als Bereitschaftsdienst/
    Rufbereitschaft/Reisezeit) nachziehen, zusammen mit den offenen
    UI-Kennzeichnungen aus Nr. 7.
14. **Zuschlagsbeträge im Report sind eine Vorschau, kein Zahllauf**: Die
    §-3b-Klassifikation liefert Minuten und (bei gesetztem Grundlohn)
    Cent-Beträge mit den zwei Freistellungs-Anteilen; die Übergabe an die
    Lohnabrechnung läuft weiterhin über den generischen Export (F-01 bleibt
    durch die fehlende DATEV-Schnittstellenbeschreibung blockiert).
