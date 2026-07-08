# Anforderungskatalog: Payroll-Compliance Zeitwirtschaft (DE)

Zweck: Referenzdokument für Gap-Analyse und Implementierung.
Ablage: `docs/requirements/payroll-compliance.md`
Perspektive: Entgeltabrechnung. Die Zeitwirtschaft ist Vorsystem der Payroll.
Jeder Fehler hier wird zur Rückrechnung, Beitragsnachforderung oder Ordnungswidrigkeit.
Stand: Juli 2026. Kein Rechtsrat — Rechtsstände sind vor Release fachlich zu verifizieren.

## Legende

| Feld | Bedeutung |
|---|---|
| M | Muss. Ohne dieses Feature ist das Produkt nicht verkaufbar. |
| S | Soll. Enterprise-Erwartung, aber nicht release-blockierend. |
| K | Kann. Differenzierung. |

Jede Anforderung hat ein Akzeptanzkriterium (AK). Eine Anforderung gilt erst als
implementiert, wenn ein automatisierter Test das AK abdeckt.

## A — Erfassung (Capture)

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| A-01 | M | Erfassung von Beginn, Ende und Dauer der täglichen Arbeitszeit — nicht nur der Überstunden. | Datenmodell speichert Start-/End-Zeitstempel je Zeitscheibe; Dauer ist abgeleitet, nicht gespeichert. |
| A-02 | M | Erfassung unabhängig vom Arbeitsort (Büro, Homeoffice, Baustelle, Außendienst). | Ein Zeiteintrag ist ohne Ortsangabe gültig. Ort ist optionales Attribut. |
| A-03 | M | Erfassung am Tag der Arbeitsleistung; Nacherfassung nur mit Begründung. | Nacherfassung > 24 h erfordert Pflichtfeld `reason`; Eintrag wird als `late_entry` markiert. |
| A-04 | M | Manipulationssicherheit: kein UPDATE auf bestätigte Zeiteinträge. Nur Storno + Neuerfassung. | DB-Constraint oder Append-only-Tabelle. Test: UPDATE auf `status=approved` schlägt fehl. |
| A-05 | M | Multi-Channel: Web, Mobile, Terminal (RFID/NFC), alle über dieselbe Bewertungslogik. | Ein Terminal-Eintrag und ein Web-Eintrag mit identischen Zeiten erzeugen identische Bewertung. |
| A-06 | S | Offline-Fähigkeit mobil mit konfliktfreier Synchronisation. | Offline erfasster Eintrag synchronisiert nach Reconnect; Doppelerfassung wird erkannt. |
| A-07 | M | Vertrauensarbeitszeit bleibt als Modell möglich — mit Dokumentation und Verstoßerkennung. | Zeitmodell `trust_based`: keine Sollzeit-Prüfung, aber ArbZG-Prüfung (B-01..B-06) läuft. |
| A-08 | S | Geofencing/Standorterfassung ist optional und pro Mandant abschaltbar. | Feature-Flag; bei `false` wird kein Geodatum persistiert (nicht nur ausgeblendet). |

## B — Regelwerk-Engine (ArbZG / JArbSchG)

> Architekturkritisch. Regeln dürfen nicht hartcodiert sein. Sie brauchen
> Gültigkeitszeiträume und müssen rückwirkend neu bewerten können.

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| B-01 | M | § 3 ArbZG: werktäglich 8 h, Verlängerung auf 10 h nur bei Ausgleich auf 8 h im Durchschnitt innerhalb 6 Kalendermonaten oder 24 Wochen. | Ausgleichszeitraum ist konfigurierbar (Monate ODER Wochen). Test: 10-h-Tage ohne Ausgleich → Verstoß. |
| B-02 | M | § 4 ArbZG: ≥ 30 min Pause bei > 6 bis 9 h, ≥ 45 min bei > 9 h. Aufteilung in Abschnitte von je ≥ 15 min. Nie länger als 6 h ohne Pause. | Test-Matrix: 6:00 h → 0 min, 6:01 h → 30 min, 9:00 h → 30 min, 9:01 h → 45 min. Pause von 3× 10 min zählt nicht. |
| B-03 | M | § 5 ArbZG: ≥ 11 h ununterbrochene Ruhezeit. Verkürzung auf 10 h nur in Ausnahmebranchen mit Ausgleich innerhalb eines Kalendermonats / vier Wochen. | Ruhezeit wird schichtübergreifend über Kalendertagsgrenze geprüft. |
| B-04 | M | § 6 Abs. 2 ArbZG: Nachtarbeitnehmer — 8 h werktäglich, 10 h nur bei Ausgleich innerhalb eines Kalendermonats / vier Wochen (kürzerer Zeitraum als B-01!). | Eigene Ausgleichsperiode für Nachtarbeitnehmer. Test deckt die Abweichung zu B-01 ab. |
| B-05 | M | Nachtzeit ≠ Nachtarbeitszuschlag. ArbZG § 2 Abs. 3: 23–6 Uhr (Bäckereien/Konditoreien 22–5 Uhr). § 3b EStG: 20–6 Uhr. Zwei verschiedene Definitionen. | Zwei getrennte Konstanten/Regelsätze. Test beweist, dass 20:30 Uhr `tax_night_bonus=true`, aber `arbzg_night_work=false` ergibt. |
| B-06 | M | §§ 9–11 ArbZG: Sonn-/Feiertagsruhe 0–24 Uhr; mind. 15 beschäftigungsfreie Sonntage/Jahr; Ersatzruhetag innerhalb 2 Wochen (Sonntag) bzw. 8 Wochen (Feiertag). | Ersatzruhetag-Tracking mit Fristüberwachung und Warnung vor Fristablauf. |
| B-07 | M | JArbSchG für Beschäftigte unter 18: eigenes, strengeres Regelwerk (8 h/Tag, 40 h/Woche; Pausen 30 min bei 4,5–6 h, 60 min bei > 6 h; 12 h Freizeit; Nachtruhe). | Regelsatz wird über Geburtsdatum automatisch aktiviert und am 18. Geburtstag automatisch umgeschaltet. |
| B-08 | M | § 7 ArbZG: Abweichungen sind nur durch Tarifvertrag bzw. aufgrund TV durch Betriebsvereinbarung zulässig. | Abweichender Regelsatz erfordert Referenz auf ein `collective_agreement`-Objekt. Ohne Referenz nicht aktivierbar. |
| B-09 | M | Regel-Layering: Gesetz → Tarifvertrag → Betriebsvereinbarung → individuelle Vereinbarung. Günstigkeitsprinzip. | Auflösungsreihenfolge ist getestet und dokumentiert. Konflikte werfen einen expliziten Fehler, keine stille Priorisierung. |
| B-10 | M | Versionierung mit Gültigkeitszeitraum. Ein Tarifabschluss im Juni gilt ab Januar → rückwirkende Neubewertung aller betroffenen Perioden. | `valid_from`/`valid_to` auf jedem Regelsatz. Reprocessing-Job bewertet abgeschlossene Perioden neu und erzeugt Differenzen (F-04). |
| B-11 | M | Parallele Berechnung täglicher und wöchentlicher Höchstarbeitszeit, pro Mitarbeitergruppe umschaltbar. | Siehe Abschnitt „Rechtsstand". Feature-Flag `max_working_time_mode: daily \| weekly`. |
| B-12 | M | Rundungsregeln konfigurierbar und dokumentiert; keine systematische Rundung zu Lasten der Beschäftigten. | Rundungsmodus (kaufmännisch / zugunsten AN) ist pro Mandant gesetzt und im Audit-Trail sichtbar. |
| B-13 | M | Verstoßwarnung präventiv, nicht als Monatsbericht. | Prüfung läuft beim Erfassen/Planen, nicht nur im Nachtjob. Warnung erreicht Mitarbeiter und Führungskraft. |

## C — Zuschläge und Lohnarten (§ 3b EStG)

> Der eigentliche Payroll-Kern. Hier scheitern die meisten internationalen Tools.

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| C-01 | M | Nachtarbeit 20:00–06:00 Uhr: 25 % steuerfrei. | Minutengenaue Splittung der Zeitscheibe an der 20:00-Grenze. |
| C-02 | M | Nachtarbeit 00:00–04:00 Uhr: 40 %, aber nur wenn die Arbeit vor 00:00 Uhr aufgenommen wurde. | Test: Schicht 22:00–06:00 → 40 % für 0–4 Uhr. Schicht 01:00–06:00 → nur 25 %. |
| C-03 | M | Sonntagsarbeit: 50 %. | — |
| C-03a | M | § 3b Abs. 3 Nr. 2 EStG: Der Sonntagszuschlag gilt auch für die Zeit von 0 bis 4 Uhr des FOLGENDEN Tages, wenn die Arbeit vor 0 Uhr aufgenommen wurde. | Test: Schicht So 22:00 – Mo 06:00 → 50 % bis Mo 04:00 Uhr, danach nicht mehr. Schicht Mo 01:00–06:00 → kein Sonntagszuschlag. |
| C-04 | M | Gesetzliche Feiertage sowie 31.12. ab 14:00 Uhr: 125 %. | — |
| C-04a | M | § 3b Abs. 3 Nr. 2 EStG: Der Feiertagszuschlag gilt auch für die Zeit von 0 bis 4 Uhr des FOLGENDEN Tages, wenn die Arbeit vor 0 Uhr aufgenommen wurde. | Test: Schicht Feiertag 22:00 – Folgetag 06:00 → 125 % bis 04:00 Uhr des Folgetags, danach nicht mehr. |
| C-05 | M | 24.12. ab 14:00 Uhr, 25.12., 26.12., 01.05.: 150 %. | — |
| C-06 | M | Zwei getrennte Grenzen: steuerfrei bis Grundlohn 50 €/h. Sozialversicherungsfrei nur bis Grundlohn 25 €/h (SvEV). | Test mit Grundlohn 40 €/h: Zuschlag ist steuerfrei, aber beitragspflichtig. Zwei separate Ausgabefelder. |
| C-07 | M | Zuschlagskonkurrenz korrekt auflösen (z. B. Nachtarbeit am Feiertag). | Explizit dokumentierte Kumulationsregeln, testabgedeckt. |
| C-08 | M | Feiertagskalender pro Bundesland und pro Einsatzort — nicht pro Mandant. | Mitarbeiter mit Einsatzort Bayern am Fronleichnam → Feiertag. Derselbe Mandant, Einsatzort Hessen (kein Fronleichnam in ganz HE) → korrekt unterschieden. |
| C-09 | M | Getrennte Bewertungsarten: Vollarbeit, Bereitschaftsdienst, Rufbereitschaft, Reisezeit. | Jede Art hat eigene Lohnart, eigenen Faktor, eigene ArbZG-Behandlung (Bereitschaftsdienst = Arbeitszeit, Rufbereitschaft = Ruhezeit). |
| C-10 | M | Abgrenzung Mehrarbeit vs. Überstunden — davon hängt die Zuschlagspflicht ab. | Zwei getrennte Zähler; Definition pro Tarifvertrag konfigurierbar. |
| C-11 | M | Mandantenspezifisches Lohnartenmapping, in der Oberfläche pflegbar (keine Code-Änderung). | Admin-UI: Bewertungsart → Lohnartennummer. Änderung ohne Deployment wirksam. |

## D — Zeitkonten

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| D-01 | M | Gleitzeitkonto mit Kernzeit/Rahmenzeit, Kappungsgrenze, Verfallsregel. | Kappung erzeugt protokollierten Buchungssatz, kein stiller Verlust. |
| D-02 | S | Jahresarbeitszeitkonto. | — |
| D-03 | S | Langzeit-/Wertguthabenkonto nach § 7b SGB IV inkl. Insolvenzsicherung (§ 7d). | Separates Konto mit eigener Bewertung und SV-Behandlung. |
| D-04 | M | Kontoauszug im Mitarbeiter-Self-Service, nachvollziehbar bis auf den einzelnen Buchungssatz. | Jede Kontobewegung ist auf ihren Ursprungs-Zeiteintrag rückverfolgbar. |

## E — Abwesenheiten

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| E-01 | M | BUrlG § 3: 24 Werktage Mindesturlaub (Werktage = Mo–Sa). Umrechnung auf die individuelle Verteilung der Wochenarbeitstage. | 5-Tage-Woche → 20 Tage. Test für 3-Tage-Woche und für Wechsel der Verteilung mitten im Jahr (anteilige Neuberechnung). |
| E-02 | M | Anteilige Berechnung bei Ein-/Austritt, Teilzeitwechsel, unbezahlter Freistellung. | Testfälle für Eintritt 15.07. und Austritt 15.07. |
| E-03 | M | Übertrag bis 31.03. (§ 7 Abs. 3 BUrlG). | Konfigurierbarer Übertragsstichtag. |
| E-04 | M | Verfall und Verjährung nur nach erfüllter Mitwirkungsobliegenheit (Hinweis- und Aufforderungspflicht des Arbeitgebers, BAG/EuGH). Das System muss den Hinweis erzeugen und beweisbar protokollieren. | Hinweis wird automatisiert versandt; Versandnachweis (Zeitstempel, Empfänger, Inhalt) ist revisionssicher gespeichert. Ohne Nachweis kein Verfall. |
| E-05 | M | § 9 BUrlG: Krankheit während des Urlaubs → Nachgewährung der betroffenen Tage. | Krankmeldung im Urlaubszeitraum bucht Urlaubstage automatisch zurück (mit AU-Nachweis). |
| E-06 | S | eAU-Abruf bei der Krankenkasse (§ 109 SGB IV). | Schnittstelle vorhanden; Abruf protokolliert. |
| E-07 | M | Mutterschutz, Elternzeit, Pflegezeit, Beschäftigungsverbot als eigene Abwesenheitsarten mit korrekter Auswirkung auf Urlaubsanspruch und Entgeltfortzahlung. | Jede Art hat konfigurierbare Flags: `reduces_vacation`, `paid`, `sv_relevant`. |
| E-08 | S | Kurzarbeit: Soll-/Ist-Stunden-Nachweis je Mitarbeiter und Abrechnungszeitraum für den Kug-Antrag. | Exportierbarer Nachweis pro Monat. |
| E-09 | M | Genehmigungsworkflow mit Vertretungsregelung und Eskalation vor Cut-off. | Offene Anträge blockieren den Monatsabschluss oder erzwingen eine dokumentierte Entscheidung. |

## F — Payroll-Schnittstelle

> Der Teil, den Hersteller regelmäßig unterschätzen.

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| F-01 | M | DATEV Lohn und Gehalt / LODAS — Bewegungsdatenexport im nativen Format, keine CSV-Bastelei. | Exportdatei wird vom DATEV-Import fehlerfrei eingelesen (Testmandant). |
| F-02 | S | Weitere Ziele: SAP, Personio, Sage, Lexware. Adapter-Pattern, nicht n× Sonderlogik. | Neuer Adapter erfordert keine Änderung an der Bewertungsschicht. |
| F-03 | M | Harter Cut-off / Monatsfreeze mit Freigabekette: Mitarbeiter → Führungskraft → HR/Payroll. | Nach Freeze sind Zeiteinträge des Zeitraums nicht mehr änderbar (DB-Ebene, nicht UI-Ebene). |
| F-04 | M | Retro-Logik: Änderung nach abgeschlossenem Monat erzeugt eine Differenzbuchung im Folgemonat. Der Ursprungsmonat bleibt unangetastet. | Test: Korrektur eines Januar-Eintrags im März → Differenz-Lohnart im März-Export, Januar-Export unverändert reproduzierbar. |
| F-05 | M | Jeder Export ist reproduzierbar: gleicher Zeitraum + gleicher Datenstand → byte-identisches Ergebnis. | Snapshot-Test. |

## G — GoBD, Revisionssicherheit, Aufbewahrung

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| G-01 | M | Lückenloser Audit-Trail: wer, wann, was (alt → neu), warum. Auch für Regeländerungen und Stammdaten. | Kein Schreibvorgang ohne Trail-Eintrag. Trail ist selbst nicht änderbar. |
| G-02 | M | Unveränderbarkeit + Nachvollziehbarkeit. Kein DELETE, nur Storno. | Soft-Delete mit `voided_at`, `voided_by`, `void_reason`. |
| G-03 | M | Aufbewahrungsfristen konfigurierbar abbildbar: 2 Jahre MiLoG-Aufzeichnungen (§ 17 MiLoG), 6 Jahre Lohnkonto (§ 41 EStG), längere Fristen aus AO/HGB. | Retention-Policy pro Datenart; Löschjob respektiert die längste zutreffende Frist. |
| G-04 | M | § 16 Abs. 2 ArbZG / § 17 MiLoG: Aufzeichnung spätestens 7 Tage nach der Arbeitsleistung. | Report „Erfassungslücken > 7 Tage". |
| G-05 | M | Read-only-Prüferzugang und Exportformate für Zoll/FKS sowie DRV-Betriebsprüfung (§ 28p SGB IV, mind. alle 4 Jahre). | Eigene Rolle `auditor`; Export für einen frei wählbaren Zeitraum. |
| G-06 | S | Verfahrensdokumentation als generierbares Artefakt. | Systemseitig erzeugte Beschreibung der aktiven Regelsätze pro Stichtag. |

## H — Datenschutz und Mitbestimmung

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| H-01 | M | § 87 Abs. 1 Nr. 6 BetrVG: Das System ist mitbestimmungspflichtig. Ohne konfigurierbares Auswertungsverbot unterschreibt kein Betriebsrat. | Feature-Flag: individuelle Leistungsauswertung deaktivierbar; Reports dann nur aggregiert/anonymisiert (k-Anonymität, k ≥ 5). |
| H-02 | M | Rollen- und Berechtigungskonzept mit Datenminimierung. Führungskraft sieht nicht die Lohndaten. | Berechtigungsmatrix ist getestet, nicht nur dokumentiert. |
| H-03 | S | Betriebsrats-Rolle mit Leserecht auf Verstoßberichte, ohne Einzelleistungsdaten. | — |
| H-04 | M | Löschkonzept mit Fristen (siehe G-03), DSGVO-Auskunftsersuchen als Export. | Art.-15-Export je Betroffenem auf Knopfdruck. |
| H-05 | M | Hosting DE/EU, Verschlüsselung at rest und in transit, AVV-Vorlage, TOM-Dokumentation. | — |

## I — Auswertungen für HR und Finance

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| I-01 | M | Bewertungsbasis für Urlaubs- und Überstundenrückstellungen zum Bilanzstichtag (§ 249 HGB). | Stichtagsbezogener Export: offene Urlaubstage × Tagessatz, Überstundensaldo × Stundensatz. |
| I-02 | M | ArbZG-Verstoßreport pro Zeitraum, Organisationseinheit, Verstoßart. | — |
| I-03 | S | Kostenstellen-/Kostenträger-/Projektzuordnung der Arbeitszeit. | — |
| I-04 | K | Nachweise für die Forschungszulage (FuE-Stunden). | — |

## J — Enterprise-Basics

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| J-01 | M | Mandantenfähigkeit mit sauberer Datentrennung. | Cross-Tenant-Zugriff ist auf Query-Ebene unmöglich (RLS o. ä.), nicht nur auf Service-Ebene. |
| J-02 | M | SSO (SAML 2.0 / OIDC). | — |
| J-03 | S | SCIM-Provisioning aus Entra ID / AD. | — |
| J-04 | M | Offene, versionierte API. | — |
| J-05 | S | Barrierefreiheit (BFSG-Kontext). | WCAG 2.1 AA für die Mitarbeiter-Oberflächen. |
| J-06 | S | On-Premise-/Self-Hosted-Option. | — |

## K — Zeitrechnung: die klassischen Fehlerquellen

> Diese Punkte sind keine „Features". Es sind die Bugs, die jedes Zeitwirtschaftssystem
> in den ersten zwei Betriebsjahren produziert. Sie gehören von Anfang an in die Testsuite.

| ID | Prio | Anforderung | Akzeptanzkriterium |
|---|---|---|---|
| K-01 | M | Sommerzeitumstellung. Ein Tag im Jahr hat 23 Stunden, einer 25. Eine Nachtschicht über die Umstellung muss die tatsächlich geleistete Zeit ergeben. | Test: Schicht 22:00–06:00 in der Nacht der Umstellung ergibt 7 h bzw. 9 h, nicht 8 h. Speicherung in UTC, Bewertung in lokaler Zeitzone. |
| K-02 | M | Nachtschicht über die Monatsgrenze. Schicht 31.01. 22:00 – 01.02. 06:00: Welchem Abrechnungsmonat werden welche Stunden zugeordnet? | Regel ist konfigurierbar (Schichtbeginn vs. minutengenaue Splittung) und dokumentiert. Kein impliziter Default. |
| K-03 | M | Nachtschicht über die Kalendertagsgrenze bei der Ruhezeitprüfung (B-03) und bei der 8-h-Prüfung (B-01). | § 3 ArbZG rechnet werktäglich, nicht kalendertäglich. Test deckt beide Lesarten ab. |
| K-04 | M | Nachtschicht über die Sonntagsgrenze — Zuschlagssplittung Samstag 22:00 → Sonntag 06:00. | Nur die Stunden ab 00:00 Uhr sind Sonntagsarbeit. |
| K-05 | S | Schaltjahr, Wochen-53, ISO-Wochennummern über den Jahreswechsel. | — |
| K-06 | M | Alle Zeitstempel als `timestamptz`, niemals als naive Zeit. Bewertung immer gegen die Zeitzone des Einsatzortes. | Schema-Review. |

## Rechtsstand (Juli 2026) — Auswirkung auf die Architektur

Die Pflicht zur Arbeitszeiterfassung gilt bereits heute (EuGH C-55/18 vom 14.05.2019;
BAG 1 ABR 22/21 vom 13.09.2022 über § 3 Abs. 2 Nr. 1 ArbSchG). Die kursierenden
Jahreszahlen „2025/2026" betreffen nur die gesetzliche Konkretisierung.
Ein Referentenentwurf des BMAS verknüpft die ausdrückliche, elektronische
Aufzeichnungspflicht mit einer Flexibilisierung: Tarifvertragsparteien sollen künftig
eine wöchentliche statt einer täglichen Höchstarbeitszeit vereinbaren können
(Diskussionsstand: bis zu 48 h/Woche, einzelne Tage länger).
Der Tarifvorbehalt ist zwischen den Koalitionspartnern und den Arbeitgeberverbänden
umstritten. Ein verabschiedetes Gesetz lag zuletzt nicht vor. Bis dahin gilt das
heutige ArbZG uneingeschränkt.

Konsequenz für den Bau: Die Regel-Engine muss tägliche und wöchentliche
Höchstarbeitszeit parallel rechnen können, umschaltbar pro Mitarbeitergruppe und
gebunden an ein Tarifvertragsobjekt (B-08, B-11). Wer das jetzt als Konstante baut,
refactored das Kernmodul.

## Was ausdrücklich nicht gebaut werden soll

- Keine heimliche Aktivitäts- oder Screenshot-Überwachung. Killt jede Betriebsvereinbarung.
- Keine Zuschlagsberechnung in Float. Nur Integer-Minuten und Dezimal-Beträge.
- Kein „Feiertagskalender Deutschland" als eine Liste. Feiertage sind bundeslandspezifisch,
  teilweise sogar gemeindespezifisch (z. B. Fronleichnam in Teilen Sachsens und Thüringens,
  Mariä Himmelfahrt in Bayern).
- Keine Rundung vor der Zuschlagsermittlung. Erst bewerten, dann runden.
