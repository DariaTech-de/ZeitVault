# Findings (Nebenbefunde außerhalb des aktuellen Schnitts)

Arbeitsregel: Kein Scope-Creep — was unterwegs auffällt, wird hier notiert und
im passenden Schnitt bearbeitet.

## Aus Schnitt 1 (2026-07-08)

1. **Implicit-Close bei vergessenem Ausstempeln — fachlich bestätigen.**
   Ein `clock_in` nach > 12 h Inaktivität schließt die hängende Schicht implizit
   an ihrem letzten Ereignis (`Shift.endedImplicitly`); das offene Segment zählt
   NICHT als Arbeitszeit, die Korrektur läuft über den Anpassungsantrag. Ohne
   diese Regel wären Mitarbeitende nach vergessenem `clock_out` dauerhaft
   blockiert (das alte UTC-Tagesfenster maskierte das Problem). Kein
   synthetisches Ereignis (ADR-0017/GoBD). Offen: Sichtbarkeit im Report/UI
   (gehört zu G-04 „Erfassungslücken"), und die 12-h-Grenze ist eine gesetzte
   Konvention — Produktentscheidung bestätigen.
2. **`time`-Modul (direkter `time_entries`-Schreibpfad) noch nicht konsolidiert.**
   Gemäß ADR-0017 wird `time_entries` zur deterministischen Projektion; die
   Umsetzung erfolgt mit der Zeitscheiben-Pipeline in Schnitt 4. Bis dahin
   bleibt das Doppelmodell (A-01 „teilweise").
3. **Alte Fold-API (`foldStampDay`/`computeStampStatus`/`evaluateStampDay`)**
   wird in der API nicht mehr genutzt, bleibt aber exportiert (Domain-Tests,
   Abwärtskompatibilität). Aufräumen, wenn Schnitt 4 die letzten Verbraucher
   (Vorschau-Endpunkte) migriert.
4. **Dashboard:** Chart-Achse läuft in der Fallback-Zeitzone (Europe/Berlin);
   `presentNow` ist jetzt schichtbasiert (offene Schicht zählt unabhängig vom
   Kalendertag). Mandanten mit Einsatzorten in mehreren Zeitzonen sehen die
   Tageszuordnung je Mitarbeiter-Zeitzone, Achse bleibt DE.
5. **GoBD-Rohdatenexport (`runGobd`) behält bewusst UTC-Periodengrenzen**
   (Rohdaten, reproduzierbare Prüfsumme; Kommentar im Code). Die fachliche
   Periodensemantik wird mit F-03/F-05 (Schnitt 5) formalisiert — Checksummen
   ändern sich dann kontrolliert.
6. **Reporting-Zeitzonenauflösung** je Mitarbeiter nutzt den Zeitraumbeginn;
   Einsatzort-Wechsel INNERHALB eines Berichtszeitraums werden erst mit der
   Zeitscheiben-Pipeline (Schnitt 4) tag-genau aufgelöst.
7. **Web-UI zeigt `lateEntry`/`endedImplicitly` noch nicht an** — die API
   liefert die Felder (DayListing) bereits; UI-Kennzeichnung nachziehen.
8. **B-03-Live-Ruhezeitprüfung** fiel als Nebeneffekt der gemeinsamen
   Tagessicht an (previousShiftEnd wird beim Stempeln verkettet). Die
   10-h-Ausnahme mit Ausgleich bleibt Schnitt 3.
