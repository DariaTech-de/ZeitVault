# ArbZG - arbeitszeitrechtliche Grundlagen der Regel-Engine

Dieses Dokument haelt die **arbeitszeitrechtlichen Grundlagen** fest, die die ZeitVault-Compliance-/Regel-Engine abbildet. Es bildet die Anforderungen aus [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.1 (Arbeitszeiterfassungspflicht) und Paragraf 3.2 (ArbZG - aktive Pruefungen) auf konkrete Funktionen ab. Verbindliche Architektur-Grundlage ist die Architektur selbst; alle Paragraf-Verweise beziehen sich darauf.

Die zentrale Architekturentscheidung dazu ist [ADR-0009: Versionierte Compliance-/Regel-Engine](../adr/0009-compliance-regel-engine.md). Sie legt fest, dass die Bewertung **regelbasiert und versioniert** als Regelpakete gebaut wird - nicht als fest verdrahtete Pruefungen im Code. Genau diese Entscheidung traegt die unten beschriebene Beweglichkeit der Rechtslage.

Durchgaengig relevant sind zwei **Kern-Invarianten** als harte MUSS-Regeln:

- **Kern-Invariante 1 - Unveraenderbarkeit von `TimeEntry`:** Ein `TimeEntry` wird **niemals ueberschrieben oder geloescht**. Eine Korrektur erzeugt einen **neuen Datensatz** mit erhoehter `revision`, Verweis auf den Vorgaenger (`previous_entry_id`) und einer **Pflicht-Begruendung** (`correction_reason`) (Paragraf 8). Eine arbeitszeitrechtliche Bewertung ist stets eine **Ableitung**, keine Korrektur - sie aendert den erfassten `TimeEntry` nicht.
- **Kern-Invariante 2 - unveraenderliches Audit-Ereignis:** Jede lohn-/sicherheitsrelevante Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteaenderung) erzeugt ein unveraenderliches `AuditEvent` im **getrennten, append-only, hash-verketteten Audit-Ledger** (Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)). Eine bewusste Genehmigung trotz arbeitszeitrechtlicher Warnung ist eine solche protokollpflichtige Aktion.

---

## Teil A - Hintergrund und Erfassungspflicht (Paragraf 3.1)

Die Pflicht zur **systematischen Arbeitszeiterfassung** gilt in Deutschland bereits heute. Sie leitet sich nicht erst aus einer Novelle des Arbeitszeitgesetzes (ArbZG) ab, sondern aus der Rechtsprechung auf Basis des Arbeitsschutzgesetzes. Die gesetzliche Ausgestaltung ist in Bewegung; die Architektur trifft dafuer ueber die Regel-Engine bewusst Vorsorge.

### Rechtsgrundlagen und aktueller Stand

| Quelle | Gehalt fuer ZeitVault |
|---|---|
| **EuGH, Urteil vom 14.05.2019, Rs. C-55/18** ("CCOO") | Mitgliedstaaten muessen Arbeitgeber verpflichten, ein objektives, verlaessliches und zugaengliches System zur Messung der taeglichen Arbeitszeit einzurichten. Begruendung der Erfassungspflicht dem Grunde nach. |
| **BAG, Beschluss vom 13.09.2022, Az. 1 ABR 22/21** | Das Bundesarbeitsgericht entnimmt dem Arbeitsschutzgesetz bereits eine **bestehende Pflicht des Arbeitgebers**, ein System zur Erfassung der Arbeitszeit einzufuehren. Die Pflicht gilt damit unabhaengig von einer kuenftigen ArbZG-Novelle. |
| **Referentenentwurf zur ArbZG-Novelle (Arbeitszeiterfassungsgesetz)** | Konkretisiert die elektronische Erfassung. Stand **Fruehjahr 2026 noch nicht im Bundesgesetzblatt verkuendet**; Inhalt daher nicht abschliessend. Wird bei Verkuendung als **neues Regelpaket** eingepflegt (siehe Teil B und Paragraf 19). |

### Was der Referentenentwurf voraussichtlich vorsieht

Diese Punkte sind **Tendenzen aus dem Entwurf**, nicht geltendes Recht (Stand Fruehjahr 2026):

- **Beginn, Ende und Dauer** der taeglichen Arbeitszeit werden grundsaetzlich **elektronisch und am Tag der Arbeitsleistung** erfasst. ZeitVault erfasst genau diese Groessen ueber Web, Mobile und Terminal; die Offline-First-Mobile-Apps stuetzen die zeitnahe Erfassung auch ohne Netz (Paragraf 13).
- Die **Verantwortung bleibt beim Arbeitgeber**, auch wenn die Erfassung an Mitarbeitende oder Dritte delegiert wird. Das System weist Erfassung, Korrektur und Genehmigung jeweils einem Urheber zu und protokolliert sie im Ledger (Kern-Invariante 2).
- **Vertrauensarbeitszeit bleibt zulaessig**, jedoch **nicht ohne Dokumentation**: Verstoesse gegen Hoechst- und Ruhezeiten muessen erkennbar werden. ZeitVault bildet Vertrauensarbeitszeit als eigenes Arbeitszeitmodell ab (Paragraf 4) und bewertet auch hier ueber die Regel-Engine, sodass Verstoesse im Verstossreport sichtbar werden.
- **Tendenz zur woechentlichen Hoechstarbeitszeit (bis 48 h)** mit **Ausgleichszeitraum** statt starrer Tagesgrenze (Flexibilisierung). Dieser moegliche Umstieg taeglich -> woechentlich ist der ausschlaggebende Grund fuer die versionierte Regel-Engine ([ADR-0009](../adr/0009-compliance-regel-engine.md)).
- Voraussichtliche **Ausnahmen und Uebergangsfristen fuer Kleinst-/Kleinbetriebe** sowie **Sonderregeln fuer leitende Angestellte** (vgl. Paragraf 5 Abs. 3 BetrVG). Solche Ausnahmen werden als Konfiguration je Mandant bzw. ueber die Regelpaket-Zuordnung abgebildet, nicht als Codepfad.

### Verantwortung, Vertrauensarbeitszeit und Sanktionsrisiko

- **Arbeitgeberverantwortung:** Die Erfassungspflicht trifft den Arbeitgeber. Delegation an Beschaeftigte (z. B. Selbsterfassung) entbindet ihn nicht; das System haelt die Urheberschaft und den vollstaendigen, manipulationsevidenten Trail vor (Kern-Invariante 1 und 2).
- **Vertrauensarbeitszeit:** zulaessig, aber dokumentiert. Auch ohne feste Anwesenheitskontrolle muessen Hoechst- und Ruhezeitverstoesse erkennbar bleiben - die Regel-Engine bewertet die erfassten Zeiten unabhaengig vom Arbeitszeitmodell.
- **Sanktionsrisiko:** Bei Pflichtverletzung drohen behoerdliche Anordnung und **Bussgeld bis 30.000 EUR** (Paragraf 3.1). Die revisionssichere Erfassung und der Verstossreport dienen auch der Nachweisbarkeit gegenueber der Aufsicht.

> **Architektur-Konsequenz (Paragraf 3.1, Paragraf 10):** Erfassungs- und Bewertungslogik sind regelbasiert und versioniert. Ein Wechsel der Rechtslage (z. B. taeglich -> woechentlich) wird per Regelpaket mit neuem Gueltigkeitsbeginn abgebildet - **ohne Code-Umbau und ohne Datenmigration**. Die historische Bewertung bleibt an die zum jeweiligen Zeitpunkt gueltige Regelversion gebunden und wird nicht still umgeschrieben (GoBD, Paragraf 3.3, siehe [`GoBD.md`](GoBD.md)).

---

## Teil B - Aktive Pruefungen als Regelpakete (Paragraf 3.2, [ADR-0009](../adr/0009-compliance-regel-engine.md))

Das System prueft und warnt **in Echtzeit beim Stempeln** (kontextsensitive Warnung statt Fehlermeldung, Paragraf 14) und bewertet **im Stapellauf** (Monatsabschluss, Verstossreport, Paragraf 4). Beide Pfade nutzen **dieselbe Engine und dieselbe Regelauswahl**, damit Live-Warnung und Abschlussbewertung nicht auseinanderlaufen ([ADR-0009](../adr/0009-compliance-regel-engine.md)).

Jede Pruefung ist als **versioniertes Regelpaket** modelliert, gebuendelt nach Thema. Jedes Arbeitszeitmodell (`WorkTimeModel`) referenziert ein Regelpaket mit Gueltigkeitszeitraum; eine Bewertung waehlt das fuer den Bewertungszeitpunkt gueltige Paket. Die folgenden Pruefungen sind die heute aus dem ArbZG abgeleiteten Regelpakete:

| Regelpaket | ArbZG-Inhalt (Richtwert) | Bewertung in der Engine |
|---|---|---|
| **Hoechstarbeitszeit** | Taegliche Hoechstarbeitszeit **8 h**, Ausdehnung auf **bis zu 10 h** zulaessig, sofern im Ausgleichszeitraum im Schnitt 8 h nicht ueberschritten werden. | Live-Warnung bei Annaeherung/Ueberschreitung; Stapelbewertung prueft den Ausgleich. Kuenftige **Wochenlogik (bis 48 h mit Ausgleichszeitraum)** wird als **neue Regelpaketversion** eingefuehrt, ohne bestehende Pakete zu aendern. |
| **Ruhezeit** | Ununterbrochene Ruhezeit **>= 11 h** zwischen zwei Arbeitseinsaetzen. | Bewertung ueber die Tagesgrenze hinweg (Arbeitsende -> naechster Arbeitsbeginn). Grenzfaelle (Tageswechsel, Sommerzeit) sind durch Property-Tests abgesichert ([ADR-0009](../adr/0009-compliance-regel-engine.md)). |
| **Pausen** | **>= 30 min** Pause bei mehr als 6 h Arbeitszeit, **>= 45 min** bei mehr als 9 h; aufteilbar in Abschnitte von mindestens 15 min. | Bewertung der erfassten `Break`-Datensaetze gegen die geleistete Arbeitszeit; modellabhaengige Pausenregeln je `WorkTimeModel`. |
| **Sonn-/Feiertagsarbeit** | Grundsaetzliches Verbot der Beschaeftigung an Sonn- und gesetzlichen Feiertagen mit zahlreichen Ausnahmen; Dokumentations- und Zuschlagsrelevanz. | Feiertage haengen am **Bundesland des Standorts** (`Location`, Paragraf 8); Bewertung als Dokumentations-/Zuschlagsmarkierung, nicht als harte Blockade. |
| **Jugendarbeitsschutz (JArbSchG)** - **optional** | Strengere Grenzen fuer Jugendliche (z. B. kuerzere Hoechstarbeitszeit, laengere Ruhezeiten, eingeschraenkte Sonn-/Feiertagsarbeit). | **Optionales, eigenes Regelpaket**, nur fuer betroffene Beschaeftigte aktiviert. Aenderung der allgemeinen Pakete bleibt davon unberuehrt. |

### Eigenschaften der Bewertung

- **Deklarativ (Bedingung -> Bewertung/Warnung):** Jede Pruefung liefert ein strukturiertes Ergebnis (konform, Warnung, Verstoss mit Begruendung und Bezug zur ausloesenden Regel), das in UI, Verstossreport und der generierbaren Verfahrensdokumentation verwendbar ist (Paragraf 9, Paragraf 10).
- **Versioniert mit Gueltigkeitszeitraum:** Regelpakete werden nicht ueberschrieben; eine Aenderung ist ein neues Paket mit neuem Gueltigkeitsbeginn. So bleibt nachvollziehbar, nach welcher Regel ein Zeitraum bewertet wurde (GoBD, Paragraf 3.3).
- **Bewertung aendert keine Fachdaten:** Das Ergebnis aendert niemals den erfassten `TimeEntry` (Kern-Invariante 1). Folgt aus der Warnung eine Handlung (z. B. Genehmigung trotz Warnung), erzeugt diese ein `AuditEvent` (Kern-Invariante 2, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).
- **Beide Betriebsmodelle identisch:** Die Engine arbeitet in Self-Hosted (`tenant_id = 'default'`) wie in Cloud/SaaS gleich; Regelpaket-Zuordnung und Feiertagskalender sind je Mandant konfigurierbar, RLS bleibt aktiv (Paragraf 2, Paragraf 7, [ADR-0004](../adr/0004-mandantenfaehigkeit-postgres-rls.md)).
- **Aufbewahrung:** Aufzeichnungen nach ArbZG sind **>= 2 Jahre** aufzubewahren; die Fristdurchsetzung erfolgt ueber die mandantenkonfigurierbare Retention-Engine (Paragraf 12, siehe [`GoBD.md`](GoBD.md)).

> **Hinweis - Rechtslage in Bewegung:** Die hier beschriebenen Grenzwerte geben den heutigen Stand des ArbZG wieder. Der **finale Gesetzestext** der ArbZG-Novelle wird bei Verkuendung als **neues Regelpaket mit eigenem Gueltigkeitsbeginn** eingepflegt; bestehende Pakete und die bereits damit erfolgte Bewertung der Vergangenheit bleiben unveraendert (Paragraf 19, [ADR-0009](../adr/0009-compliance-regel-engine.md)). Die fachlich-juristische Auslegung der Regeln (z. B. konkrete Auspraegung der Wochenlogik) wird in Regelpakete uebersetzt; dieses Dokument trifft keine rechtliche Aussage.

---

## Verweise

- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.1 - Arbeitszeiterfassungspflicht (EuGH C-55/18, BAG 1 ABR 22/21, Referentenentwurf, Arbeitgeberverantwortung, Sanktionsrisiko bis 30.000 EUR)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.2 - ArbZG aktive Pruefungen (Hoechstarbeitszeit, Ruhezeit, Pausen, Sonn-/Feiertagsarbeit, JArbSchG)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 10 - Regel-/Compliance-Engine (versionierte Regelpakete, deklarative Bewertung, Live- und Stapellauf)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 4 - Funktionsumfang (Arbeitszeitmodelle, Compliance-Engine, Verstossreport, Feiertagskalender)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 8 - Datenmodell (`WorkTimeModel`, `TimeEntry`, `Break`, `Location` mit Bundesland)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 14 - UI/UX (kontextsensitive Warnungen statt Fehlermeldungen beim Stempeln)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 19 - offene Entscheidungen (Rechtslage in Bewegung, finaler Gesetzestext als neues Regelpaket)
- [ADR-0009: Versionierte Compliance-/Regel-Engine](../adr/0009-compliance-regel-engine.md) - regelbasierte, versionierte Bewertung; Regelpakete je Thema; Live- und Stapellauf
- [ADR-0006: Audit-Ledger: append-only, hash-verkettet](../adr/0006-audit-ledger-append-only.md) - protokollpflichtige Folgeaktionen (Kern-Invariante 2)
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](../adr/0004-mandantenfaehigkeit-postgres-rls.md) - mandantenkonfigurierbare Regeln, aktive RLS in beiden Betriebsmodellen
- [`GoBD.md`](GoBD.md) - Aufbewahrungsfristen (ArbZG-Aufzeichnungen >= 2 Jahre), Retention-Engine, Verfahrensdokumentation
- [`DSGVO.md`](DSGVO.md), [`GLOSSAR.md`](GLOSSAR.md) - angrenzende Compliance-Dokumente

---

*Hinweis: Dieses Dokument fasst die arbeitszeitrechtlichen Rahmenbedingungen fuer die technische Planung zusammen und ersetzt keine Rechtsberatung. Fuer die verbindliche Auslegung des ArbZG, des JArbSchG sowie der zugehoerigen Rechtsprechung und kuenftiger Gesetzesfassungen sind die offiziellen Quellen bzw. fachkundige Beratung maßgeblich.*
