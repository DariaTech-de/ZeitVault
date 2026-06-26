# GoBD - Umsetzung im System

Die **GoBD** (Grundsaetze zur ordnungsmaeßigen Fuehrung und Aufbewahrung von Buechern, Aufzeichnungen und Unterlagen in elektronischer Form sowie zum Datenzugriff) sind ein BMF-Verwaltungsschreiben. Zeitdaten in ZeitVault sind lohn- und damit steuerrelevant; daraus folgen funktionale Pflichten an Datenmodell, Validierungslogik, Aufbewahrung und Export.

Dieses Dokument bildet die GoBD-Anforderungen aus [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.3 auf konkrete ZeitVault-Funktionen ab. Verbindliche Architektur-Grundlage ist die Architektur selbst; alle Paragraf-Verweise beziehen sich darauf. Die zentrale Architekturentscheidung zum Audit-Trail ist [ADR-0006: Audit-Ledger: append-only, hash-verkettet](../adr/0006-audit-ledger-append-only.md).

Durchgaengig gelten die folgenden **Kern-Invarianten** als harte MUSS-Regeln (vollstaendige Liste in [`../../CLAUDE.md`](../../CLAUDE.md); hier die fuer die GoBD einschlaegigen):

- **Kern-Invariante 1 - Unveraenderbarkeit von `TimeEntry`:** Ein `TimeEntry` wird **niemals ueberschrieben oder geloescht**. Eine Korrektur erzeugt einen **neuen Datensatz** mit erhoehter `revision`, Verweis auf den Vorgaenger (`previous_entry_id`) und einer **Pflicht-Begruendung** (`correction_reason`). Reporting und Export nutzen immer die jeweils gueltige Revision; die Historie bleibt vollstaendig (Paragraf 8).
- **Kern-Invariante 2 - unveraenderliches Audit-Ereignis:** Jede lohn-/sicherheitsrelevante Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteaenderung) erzeugt ein unveraenderliches `AuditEvent` im **getrennten, append-only, hash-verketteten Audit-Ledger** (Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).
- **Kern-Invariante 4 - Loeschen vs. Aufbewahren:** Aufbewahrungspflichtige Daten werden bei Austritt **nicht hart geloescht, sondern gesperrt/pseudonymisiert** und erst nach Fristablauf automatisiert geloescht (Spannungsfeld Loeschung <-> Aufbewahrung, Paragraf 3.4, Paragraf 12; datenschutzrechtliche Seite in [`DSGVO.md`](DSGVO.md)).

---

## Abbildung der GoBD-Anforderungen (Paragraf 3.3)

| GoBD-Anforderung | Umsetzung im System |
|---|---|
| **Unveraenderbarkeit & Nachvollziehbarkeit** - kein nachtraegliches stilles Ueberschreiben; jede Aenderung als neuer, begruendeter Datensatz mit Zeitstempel, Urheber und Vorgaengerbezug. | `TimeEntry` ist unveraenderlich (**Kern-Invariante 1**): Korrektur = neuer Datensatz mit erhoehter `revision`, `previous_entry_id` (Vorgaengerbezug) und Pflichtfeld `correction_reason`. Auf DB-Ebene per Postgres-nativen append-only-Triggern und eingeschraenkten Grants (kein `UPDATE`/`DELETE` auf Fachhistorie) abgesichert ([ADR-0005](../adr/0005-orm-drizzle.md)). Parallel dokumentiert das **Audit-Ledger** jede solche Aktion als unveraenderliches `AuditEvent` mit Zeitstempel und Urheber, hash-verkettet (`prev_hash`) und periodisch in WORM-Ablage versiegelt - Manipulation wird beim Nachrechnen sofort evident (**Kern-Invariante 2**, Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)). |
| **Vollstaendigkeit & Zeitgerechtheit** - zeitnahe Erfassung, keine Luecken. | Erfassung am Tag der Arbeitsleistung ueber Web, Mobile und Terminal (Paragraf 3.1, Paragraf 13). Mobile-Apps sind **Offline-First** mit lokaler Queue und idempotenten Sync-Endpunkten, sodass auch ohne Netz (Außendienst/Baustelle) zeitnah und konfliktfrei erfasst wird (Paragraf 13). Die **Compliance-/Regel-Engine** prueft live und im Stapellauf auf Plausibilitaet, fehlende Buchungen und Verstoeße (Verstoßreport), wodurch Luecken erkennbar werden (Paragraf 10, [ADR-0009](../adr/0009-compliance-regel-engine.md)). Da `TimeEntry` nie geloescht wird, kann die Aufzeichnung nicht nachtraeglich ausgeduennt werden; jede Korrektur bleibt als zusaetzliche Revision sichtbar (**Kern-Invariante 1**). |
| **Aufbewahrungsfristen** - relevante Aufzeichnungen revisionssicher aufbewahren. | Fristen sind **pro Mandant konfigurierbar** und in der Mandanten-/Aufbewahrungskonfiguration hinterlegt (Paragraf 8). Richtwerte: **Lohnunterlagen i. d. R. 6 Jahre**, **buchungsrelevante Unterlagen 10 Jahre**, **ArbZG-Aufzeichnungen >= 2 Jahre**. Eine **Retention-Engine** je Mandant setzt diese Fristen automatisiert durch (Paragraf 12). Aufbewahrungspflichtige Daten werden bei Austritt **nicht hart geloescht, sondern gesperrt/pseudonymisiert** und erst nach Fristablauf automatisiert geloescht (**Kern-Invariante 4**, Spannungsfeld Loeschung <-> Aufbewahrung, Paragraf 3.4, Paragraf 12). Das Audit-Ledger liegt revisionssicher in WORM-Ablage (Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)). |
| **Maschinelle Auswertbarkeit & Datenzugriff** - Export im pruefbaren Format fuer die Betriebspruefung. | **GoBD-Pruefexport** in maschinell auswertbarem Format fuer Betriebspruefungen (Paragraf 4, Paragraf 15.2). Jeder Export wird als `ExportJob` protokolliert - mit Zeitraum, Format, **Pruefsumme**, Ergebnisdatei in S3 und Status; Exporte sind damit **reproduzierbar und nachvollziehbar** (Paragraf 8, Paragraf 15.1). Der Export selbst ist eine protokollpflichtige Aktion und erzeugt ein `AuditEvent` (**Kern-Invariante 2**). |
| **Verfahrensdokumentation** - Beschreibung von Datenfluss, Berechtigungen und Versionen. | Die **Verfahrensdokumentation ist generierbar** aus Konfiguration, Schema und Regelversionen (Paragraf 9). Sie umfasst u. a. Datenfluss, RBAC/ABAC-Berechtigungen (Paragraf 11), die versionierten Regelpakete der Compliance-Engine (Paragraf 10, [ADR-0009](../adr/0009-compliance-regel-engine.md)), die Mandanten-/Aufbewahrungskonfiguration sowie Versiegelungsintervall und Einsatz des optionalen qualifizierten Zeitstempels des Ledgers ([ADR-0006](../adr/0006-audit-ledger-append-only.md)). |

---

## Erlaeuterung der zentralen Umsetzungen

### Unveraenderbarkeit & Nachvollziehbarkeit

Die GoBD verlangen, dass eine einmal erfasste Buchung nicht stillschweigend so geaendert werden kann, dass der urspruengliche Inhalt nicht mehr feststellbar ist. ZeitVault setzt dies auf zwei Ebenen um, die sich gegenseitig absichern:

1. **Fachdaten-Ebene (`TimeEntry`-Revisionen):** Ein `TimeEntry` traegt die Felder `revision`, `previous_entry_id` und `correction_reason`. Eine Korrektur ueberschreibt nichts, sondern fuegt einen neuen Datensatz an, der den Vorgaenger referenziert und eine Pflicht-Begruendung traegt. Die jeweils gueltige Revision wird fuer Reporting und Export verwendet, die vollstaendige Historie bleibt abrufbar (Paragraf 8, Kern-Invariante 1). Auf Datenbankebene wird dies durch Postgres-native append-only-Trigger und eingeschraenkte Grants durchgesetzt, sodass auch ein Fehler in der Anwendung die Historie nicht beschaedigen kann ([ADR-0005](../adr/0005-orm-drizzle.md)).
2. **Audit-Ebene (Audit-Ledger):** Unabhaengig von den Fachdaten dokumentiert der getrennte Audit-Ledger jede lohn-/sicherheitsrelevante Aktion als unveraenderliches `AuditEvent` mit Zeitstempel und Urheber. Durch die Hash-Verkettung (`prev_hash`) und die periodische, extern versiegelte Verankerung (signierter Tages-Hash in WORM-Ablage, optional qualifizierter Zeitstempel) wird jede nachtraegliche Aenderung oder Luecke beim Nachrechnen sofort evident. Die harte Vertrauensgrenze zum Anwendungs-Monolithen stellt sicher, dass die schreibende Anwendung ihren eigenen Audit-Trail nicht veraendern kann (Kern-Invariante 2, Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).

### Vollstaendigkeit & Zeitgerechtheit

Zeitgerechtheit bedeutet Erfassung am Tag der Arbeitsleistung (Paragraf 3.1). Web, Mobile und Terminal ermoeglichen dies; die Offline-First-Architektur der Mobile-Apps stellt zeitnahe Erfassung auch ohne Netzverbindung sicher (Paragraf 13). Vollstaendigkeit wird dadurch gestuetzt, dass `TimeEntry` nie geloescht wird und die Regel-Engine fehlende oder unplausible Buchungen sowie Verstoeße im Verstoßreport sichtbar macht (Paragraf 10).

### Aufbewahrungsfristen (Retention-Engine, sperren/pseudonymisieren statt loeschen)

Die Aufbewahrungsfristen sind je Mandant konfigurierbar, weil sie von Branche, Datenart und der konkreten Einordnung abhaengen:

- **Lohnunterlagen:** i. d. R. **6 Jahre**.
- **Buchungsrelevante Unterlagen:** **10 Jahre**.
- **Aufzeichnungen nach ArbZG:** **>= 2 Jahre** (siehe auch [`ARBZG.md`](ARBZG.md)).

Eine **Retention-Engine** setzt diese Fristen automatisiert durch (Paragraf 12). Zentral ist dabei das Spannungsfeld **Loeschung gegen Aufbewahrung**: Daten, die einer steuerlichen oder arbeitsrechtlichen Aufbewahrungspflicht unterliegen, werden bei Austritt eines Beschaeftigten **nicht hart geloescht, sondern gesperrt/pseudonymisiert** und erst nach Fristablauf automatisiert geloescht (Kern-Invariante 4, Paragraf 3.4, Paragraf 12). Damit wird das DSGVO-Loeschinteresse mit der GoBD-/steuerlichen Aufbewahrungspflicht in Einklang gebracht; die datenschutzrechtliche Seite ist in [`DSGVO.md`](DSGVO.md) beschrieben.

### Maschinelle Auswertbarkeit & Datenzugriff

Fuer die Betriebspruefung liefert ZeitVault einen **GoBD-Pruefexport** in maschinell auswertbarem Format (Paragraf 15.2). Jeder Export - GoBD-Pruefexport ebenso wie der DATEV-Lohn-Export - wird als `ExportJob` mit Zeitraum, Format, **Pruefsumme**, Ergebnisdatei in S3 und Status erfasst und ist dadurch reproduzierbar und protokolliert (Paragraf 8, Paragraf 15.1). Die Pruefsumme belegt die Integritaet der ausgelieferten Datei; der Export erzeugt zusaetzlich ein `AuditEvent` im Ledger (Kern-Invariante 2). Die konkreten DATEV-Feldlayouts richten sich nach der offiziellen DATEV-Schnittstellenbeschreibung (siehe [`DATEV-REFERENZ.md`](DATEV-REFERENZ.md)); fuer den GoBD-Pruefexport ist das maßgebliche pruefbare Format aus den amtlichen Vorgaben abzuleiten (kein Raten).

### Verfahrensdokumentation

Die Verfahrensdokumentation ist aus dem System generierbar (Paragraf 9). Sie wird aus Konfiguration, Schema und Regelversionen zusammengestellt und beschreibt insbesondere:

- den **Datenfluss** (Erfassung -> Bewertung -> Genehmigung -> Reporting/Export),
- die **Berechtigungen** (RBAC + ABAC nach Standort/Abteilung, MFA-Pflicht fuer Admins, Paragraf 11),
- die **eingesetzten Versionen** der Regelpakete der Compliance-Engine ([ADR-0009](../adr/0009-compliance-regel-engine.md)),
- die **Mandanten-/Aufbewahrungskonfiguration** (Fristen, Retention-Engine),
- die **Ledger-Parameter** (Versiegelungsintervall, optionaler qualifizierter Zeitstempel, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).

---

## Verweise

- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.3 - GoBD (Unveraenderbarkeit, Vollstaendigkeit/Zeitgerechtheit, Aufbewahrungsfristen, maschinelle Auswertbarkeit, Verfahrensdokumentation)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 8 - Datenmodell (`TimeEntry` mit `revision`/`previous_entry_id`/`correction_reason`, `ExportJob` mit Pruefsumme, `AuditEvent`)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 9 - Revisionssicherheit & Audit (append-only, Hash-Verkettung, periodische Versiegelung, Verfahrensdokumentation)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 12 - Datenschutz (Loeschen vs. Aufbewahren, Retention-Engine je Mandant)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 15 - Steuerberater-Export (GoBD-Pruefexport, `ExportJob`, DATEV)
- [ADR-0006: Audit-Ledger: append-only, hash-verkettet](../adr/0006-audit-ledger-append-only.md) - technische Umsetzung von Kern-Invariante 2
- [ADR-0005: ORM-Wahl: Drizzle](../adr/0005-orm-drizzle.md) - Postgres-native append-only-Trigger und eingeschraenkte Grants
- [ADR-0009: Versionierte Compliance-/Regel-Engine](../adr/0009-compliance-regel-engine.md) - Bewertung und Verstoßerkennung
- [`DSGVO.md`](DSGVO.md), [`ARBZG.md`](ARBZG.md), [`DATEV-REFERENZ.md`](DATEV-REFERENZ.md) - angrenzende Compliance-Dokumente

---

*Hinweis: Dieses Dokument fasst die GoBD-Anforderungen fuer die technische Planung zusammen und ersetzt keine Rechtsberatung. Fuer die verbindliche Auslegung der GoBD, der steuerlichen Aufbewahrungsfristen und des Datenzugriffsrechts sowie fuer die DATEV-Formate sind die offiziellen Quellen bzw. fachkundige Beratung maßgeblich.*
