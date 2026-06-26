# DATEV-Referenz - Schnittstellenbeschreibung und Mapping-Grundlage

Dieses Dokument ist die **Ablage- und Referenzstelle** fuer die DATEV-Anbindung von ZeitVault. Es legt fest, **was** an verbindlicher DATEV-Dokumentation hier abzulegen ist, **bevor** das Export-Modul gebaut wird, und auf welcher Grundlage die Mapping-Tabellen abgeleitet werden. Verbindliche Architektur-Grundlage ist [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md); alle Paragraf-Verweise beziehen sich darauf (insbesondere Paragraf 15.1 DATEV, Paragraf 19 offene Entscheidungen).

> **Verbot - keine erfundenen Feldlayouts.** Dieses Dokument enthaelt **bewusst keine konkreten DATEV-Feldlayouts, Datensatzformate, Satzarten, Feldlaengen oder Beispielzeilen.** Die exakten Formate stammen ausschließlich aus der **offiziellen DATEV-Schnittstellenbeschreibung** (ueber DATEV zu beziehen). Diese ist hier als verbindliche Referenz zu hinterlegen; die Mapping-Tabellen werden **daraus abgeleitet - kein Raten** (Paragraf 15.1).

---

## 1. Zweck

Hier wird die offizielle **DATEV-Schnittstellenbeschreibung als verbindliche Referenz** abgelegt, **bevor** das Export-Modul (Roadmap-Phase 3, Paragraf 18) entwickelt wird. Ziel ist, dass jede Zeile des Lohn-Exports auf eine dokumentierte, von DATEV vorgegebene Feld- und Satzdefinition zurueckfuehrbar ist.

- Die **Mapping-Tabellen** (interne Kategorie -> DATEV-Lohnart/Ausfallschluessel/Kostenstelle) werden **aus der offiziellen Beschreibung abgeleitet**. Es wird nichts geschaetzt oder rekonstruiert.
- Solange die offizielle Beschreibung nicht beschafft und hier abgelegt ist, gilt das Export-Modul als **fachlich nicht spezifiziert** - die Implementierung der konkreten Formatausgabe darf nicht beginnen (siehe Abschnitt 6, Blocker).
- Dieses Dokument beschreibt damit den **Rahmen und die Engine**, nicht das Format selbst. Das Format liefert DATEV.

---

## 2. Unterstuetzte Ziele (Paragraf 15.1)

DATEV ist in deutschen Kanzleien Quasi-Standard. ZeitVault unterstuetzt die folgenden Uebergabewege; die konkreten Formate sind jeweils der offiziellen DATEV-Dokumentation zu entnehmen.

| Ziel | Art der Uebergabe | Voraussetzung |
|---|---|---|
| **DATEV LODAS** | Datei-Export (ASCII), zum manuellen Import in der Kanzlei | Format laut offizieller DATEV-Schnittstellenbeschreibung |
| **DATEV Lohn und Gehalt** | Datei-Export (ASCII), zum manuellen Import in der Kanzlei | Format laut offizieller DATEV-Schnittstellenbeschreibung |
| **DATEV Lohnimport-Datenservice (API)** | direkte, automatisierte Uebergabe ueber Schnittstelle | DATEV-Registrierung, Berater-/Mandantennummer, API-Zugang (siehe Abschnitt 6) |

Erlaeuterungen:

- **DATEV LODAS** und **DATEV Lohn und Gehalt** werden als **Datei-Export (ASCII)** bereitgestellt - Bewegungsdaten und bei Bedarf Stammdaten -, der in der Kanzlei manuell importiert wird. Welche Satzarten, Zeichenkodierung und Feldstruktur dabei gelten, ergibt sich aus der jeweiligen offiziellen DATEV-Schnittstellenbeschreibung und ist **nicht** Gegenstand dieses Dokuments.
- Der **DATEV Lohnimport-Datenservice (API)** ermoeglicht die direkte, automatisierte Uebergabe ohne manuellen Dateiimport. Er erfordert eine Registrierung bei DATEV sowie eine Berater- und Mandantennummer (Paragraf 15.1, Paragraf 19).
- Welche Felder, Inhalte und Validierungsregeln der jeweilige Weg verlangt, wird erst nach Vorliegen der offiziellen Beschreibung (Abschnitt 5) festgelegt.

---

## 3. Mapping-Engine-Ansatz

Die **Mapping-Engine** uebersetzt die internen, fachlich gefuehrten Kategorien von ZeitVault in die von DATEV erwarteten Schluessel. Die internen Kategorien sind systemseitig stabil; die Zielschluessel kommen aus der offiziellen DATEV-Beschreibung und werden je Mandant konfiguriert.

**Interne Kategorien (Quelle):**

- Arbeitszeit
- Ueberstunden
- Zuschlaege
- Urlaub
- Krankheit

**Zielschluessel (laut offizieller DATEV-Beschreibung):**

- **DATEV-Lohnarten**
- **Ausfallschluessel**
- **Kostenstellen**

Diese Zuordnung ist im Datenmodell als **`WageTypeMapping`** hinterlegt - "Zuordnung interne Kategorie -> DATEV-Lohnart / Ausfallschluessel / Kostenstelle" (Paragraf 8). Eigenschaften der Engine:

- **Pro Mandant und pro Personaltyp** eigene Profile: dieselbe interne Kategorie kann je Mandant und je Beschaeftigtengruppe auf unterschiedliche DATEV-Lohnarten oder Kostenstellen abgebildet werden (Paragraf 15.1).
- **Datengetrieben, nicht hartcodiert:** Die konkreten Lohnart-/Ausfallschluessel-/Kostenstellenwerte sind Konfiguration (`WageTypeMapping`), nicht Code. So bleiben Aenderungen ohne Release moeglich und jede Zuordnung ist nachvollziehbar.
- **Ableitung aus der Referenz:** Die zulaessigen Zielwerte und ihre Semantik stammen aus der offiziellen DATEV-Schnittstellenbeschreibung (Abschnitt 5). Es werden keine Lohnart-Nummern oder Ausfallschluessel erfunden.
- **Mandantentrennung:** `WageTypeMapping` fuehrt wie jede Tabelle `tenant_id`; RLS erzwingt die Mandantentrennung auf DB-Ebene (Paragraf 7, Kern-Invariante 3).

---

## 4. Monatslauf und `ExportJob` (GoBD)

Aus **geprueften, freigegebenen** Zeiten entstehen je Abrechnungszeitraum die fertigen Buchungssaetze fuer DATEV (Paragraf 15.1). Der Monatslauf ist reproduzierbar und protokolliert:

- Jeder Export wird als **`ExportJob`** erfasst - mit Zeitraum, Format, **Pruefsumme**, Ergebnisdatei in S3 und Status (Paragraf 8). Die Pruefsumme belegt die Integritaet der ausgelieferten Datei.
- Der Export ist damit **reproduzierbar und nachvollziehbar** (GoBD, Paragraf 3.3, Paragraf 9). Ein identischer Lauf ueber denselben geprueften Datenstand muss dieselbe Ausgabe und dieselbe Pruefsumme erzeugen.
- Der Export ist eine **lohnrelevante, protokollpflichtige Aktion** und erzeugt ein unveraenderliches `AuditEvent` im getrennten, append-only, hash-verketteten Audit-Ledger (**Kern-Invariante 2**, Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).
- Grundlage des Laufs sind ausschließlich die jeweils **gueltigen `TimeEntry`-Revisionen**; korrigierte Eintraege werden ueber `revision`/`previous_entry_id` referenziert, nichts wird ueberschrieben (**Kern-Invariante 1**, Paragraf 8).

Die GoBD-Sicht auf den Export ist ergaenzend in [`GoBD.md`](GoBD.md) beschrieben.

---

## 4a. Implementierungsstand (Geruest, Phase 3 / D3)

Implementiert ist das **Mapping-Geruest mit generischem, neutralem Export** ([ADR-0011](../adr/0011-datev-mapping-geruest-generischer-export.md)), **nicht** das konkrete DATEV-Datensatzformat (weiterhin blockiert, Abschnitt 6):

- **Mapping-Tabelle** interne Kategorie (`work_time`, `vacation`, `sick`, `special`) -> `lohnart` / optional `kostenstelle` / `ausfallschluessel`, mandantenseitig konfiguriert (opake Codes, keine von ZeitVault vorgegebenen DATEV-Layouts).
- **Generischer CSV-Export** mit fester Spaltenstruktur (`personnel_number, category, lohnart, kostenstelle, ausfallschluessel, value, unit`) - ein neutrales Interchange-Format, **kein** DATEV-LODAS-/Lohn-und-Gehalt-Datensatz.
- **Protokollierung wie der GoBD-Export:** unveraenderlicher `ExportJob` mit Pruefsumme (reproduzierbar) und `AuditEvent` `export.run` (Kern-Invariante 2).
- **Sichtbare Luecken:** Kategorien ohne Mapping werden als `unmapped` gemeldet, nicht stillschweigend weggelassen.

Der konkrete DATEV-Export (Dateiweg LODAS/Lohn und Gehalt bzw. Lohnimport-Datenservice) wird als zusaetzlicher Serialisierer auf denselben Aggregaten/Mappings ergaenzt, **sobald** die offizielle Schnittstellenbeschreibung (Abschnitt 5) und die organisatorischen Voraussetzungen (Abschnitt 6) vorliegen.

---

## 5. Abzulegende Artefakte (Checkliste)

Vor dem Bau des Export-Moduls sind die folgenden Artefakte hier in `docs/compliance/` (bzw. referenziert) abzulegen. Diese Liste ist die **Definition of Ready** fuer die DATEV-Anbindung:

- [ ] **Offizielle DATEV-Schnittstellenbeschreibung** (ueber DATEV zu beziehen) als verbindliche Referenz - jeweils fuer **DATEV LODAS** und **DATEV Lohn und Gehalt** (Datei-Export, ASCII) sowie fuer den **DATEV Lohnimport-Datenservice (API)**.
- [ ] **Versions-/Standangabe** der hinterlegten Beschreibung (Dokumentversion, Datum, Gueltigkeitsstand), damit Format-Aenderungen nachvollziehbar bleiben.
- [ ] **Abgeleitete Mapping-Tabellen** je Mandant/Personaltyp: interne Kategorie -> DATEV-Lohnart, Ausfallschluessel, Kostenstelle (Grundlage `WageTypeMapping`, Paragraf 8) - ausschließlich aus der offiziellen Beschreibung abgeleitet.
- [ ] **Zuordnung der unterstuetzten Ziele** zu den jeweils maßgeblichen Abschnitten der offiziellen Beschreibung (LODAS, Lohn und Gehalt, Lohnimport-Datenservice).
- [ ] **Zugangs-/Registrierungsnachweise** fuer den API-Weg (siehe Abschnitt 6): Berater-/Mandantennummer, API-Zugang - getrennt und vertraulich verwaltet (nicht im Repo; Secrets ueber OpenBao/SOPS, Paragraf 11).
- [ ] **Verweis auf Test-/Validierungsverfahren** gegen DATEV (sofern von DATEV bereitgestellt), damit das erzeugte Format vor Produktivnutzung gegen die offiziellen Vorgaben geprueft werden kann.

> Hinweis: Die offizielle DATEV-Schnittstellenbeschreibung unterliegt den Nutzungsbedingungen von DATEV. Ob und in welcher Form sie im Repository abgelegt werden darf, ist vor der Ablage zu klaeren; andernfalls wird hier nur **referenziert** (Bezugsquelle, Version, Stand) statt eingecheckt.

---

## 6. Organisatorische Abhaengigkeit / Blocker (Paragraf 19)

Die DATEV-Anbindung haengt von einer **organisatorisch zu beschaffenden** Voraussetzung ab, die nicht durch Entwicklung geloest werden kann:

- **DATEV-Registrierung**, **Berater- und Mandantennummer** sowie **API-Zugang** (fuer den Lohnimport-Datenservice) muessen beschafft werden (Paragraf 15.1, Paragraf 19).
- Solange diese fehlen, **blockiert dies Roadmap-Phase 3** ("Export & Reporting", Paragraf 18). Das ist in Paragraf 19 als offene Entscheidung ausdruecklich vermerkt: "DATEV-Registrierung (Berater-/Mandantennummer, API-Zugang) muss organisatorisch beschafft werden - blockiert sonst Phase 3."
- Die offizielle Schnittstellenbeschreibung (Abschnitt 5) ist ebenfalls Voraussetzung; ohne sie ist das Format nicht spezifizierbar.

**Konsequenz fuer die Planung:** Beschaffung von Registrierung/Nummern/Zugang **und** Schnittstellenbeschreibung muss vor dem Start von Phase 3 angestoßen werden (Paragraf 20, naechste Schritte). Zugangsdaten werden vertraulich und getrennt vom Code verwaltet (Secrets via OpenBao/SOPS, keine Secrets im Repo, Paragraf 11).

---

## 7. Verweise

- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 15.1 - DATEV (LODAS, Lohn und Gehalt, Lohnimport-Datenservice, Mapping-Engine, Monatslauf)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 8 - Datenmodell (`WageTypeMapping`, `ExportJob` mit Pruefsumme, `TimeEntry`-Revisionen)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 9 - Revisionssicherheit & Audit (Export erzeugt `AuditEvent`)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 18 - Roadmap (Phase 3: Export & Reporting)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 19 - offene Entscheidungen (DATEV-Registrierung blockiert Phase 3)
- [`GoBD.md`](GoBD.md) - GoBD-Sicht auf Export, `ExportJob` und Pruefsumme
- [`GLOSSAR.md`](GLOSSAR.md) - Begriffe (DATEV, Lohnart, Ausfallschluessel, Kostenstelle, ExportJob)
- [ADR-0006: Audit-Ledger: append-only, hash-verkettet](../adr/0006-audit-ledger-append-only.md) - Protokollierung des Exports als `AuditEvent`

---

*Hinweis: Dieses Dokument fasst die organisatorischen und technischen Rahmenbedingungen der DATEV-Anbindung fuer die technische Planung zusammen und ersetzt keine Rechtsberatung. Fuer die verbindlichen DATEV-Feldlayouts und -Formate ist ausschließlich die offizielle DATEV-Schnittstellenbeschreibung maßgeblich.*
