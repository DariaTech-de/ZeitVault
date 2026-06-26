# DSGVO / BDSG - Umsetzung im System

Die **DSGVO** (Datenschutz-Grundverordnung, EU-Verordnung 2016/679) und das **BDSG** (Bundesdatenschutzgesetz, das die DSGVO national konkretisiert, u. a. beim Beschaeftigtendatenschutz) steuern die Verarbeitung personenbezogener Daten in ZeitVault. Da das System Beschaeftigten-Zeit- und potenziell Standortdaten verarbeitet, sind Datenschutzanforderungen **funktionale Pflicht** an Datenmodell, Berechtigungslogik, Aufbewahrung und Betrieb.

Dieses Dokument bildet die Anforderungen aus [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.4 und Paragraf 12 auf konkrete ZeitVault-Funktionen ab. Verbindliche Architektur-Grundlage ist die Architektur selbst; alle Paragraf-Verweise beziehen sich darauf. Angrenzende Dokumente sind [`GoBD.md`](GoBD.md) (steuerliche Aufbewahrung, Spannungsfeld Loeschung <-> Aufbewahrung) und [`ARBZG.md`](ARBZG.md) (arbeitszeitrechtliche Aufzeichnungspflichten).

Durchgaengig gelten die folgenden **Kern-Invarianten** als harte MUSS-Regeln:

- **Kern-Invariante 3 - Mandantentrennung:** Jede Tabelle fuehrt `tenant_id`; **RLS erzwingt die Mandantentrennung auf DB-Ebene**. Kein Request ohne gueltigen Tenant-Kontext (aus dem Auth-Token). Self-Hosted laeuft als `tenant_id = default`, RLS bleibt aktiv (Paragraf 7, [ADR-0004](../adr/0004-mandantenfaehigkeit-postgres-rls.md)).
- **Kern-Invariante 4 - Loeschen vs. Aufbewahren:** Aufbewahrungspflichtige Daten werden **nicht hart geloescht**, sondern **gesperrt/pseudonymisiert** bis zum Fristablauf und erst danach automatisiert geloescht (Paragraf 12, [`GoBD.md`](GoBD.md)).
- **Kern-Invariante 5 - Datensparsamkeit:** **GPS/Geofencing ist standardmaeßig deaktiviert** und nur per Betriebsvereinbarung aktivierbar (Mitbestimmung nach BetrVG Paragraf 87, Paragraf 3.4, Paragraf 12).

Ergaenzend gilt **Kern-Invariante 2** (unveraenderliches `AuditEvent` im getrennten Audit-Ledger), auf die sich die Protokollierung lesender Zugriffe stuetzt (Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).

---

## 1. Rechtsgrundlagen der Verarbeitung

Die Rechtsgrundlage jeder Verarbeitung wird dokumentiert (Paragraf 3.4) und im generierbaren **VVT/RoPA** (siehe Abschnitt 8) je Verarbeitungstaetigkeit ausgewiesen. Fuer den Beschaeftigtenkontext sind insbesondere relevant:

- **Vertragserfuellung** (Art. 6 Abs. 1 lit. b DSGVO; im Beschaeftigtenkontext i. V. m. Paragraf 26 BDSG): Die Kernverarbeitung - Erfassung von Kommen/Gehen, Pausen, Salden, Abwesenheiten zur Durchfuehrung des Arbeitsverhaeltnisses und zur Lohnabrechnung - ist zur Durchfuehrung des Beschaeftigungsverhaeltnisses erforderlich.
- **Gesetzliche Pflicht** (Art. 6 Abs. 1 lit. c DSGVO): Die Arbeitszeiterfassung selbst sowie steuerliche und arbeitsrechtliche Aufbewahrungspflichten ergeben sich aus rechtlichen Verpflichtungen (Arbeitszeiterfassungspflicht nach Paragraf 3.1, ArbZG-Aufzeichnungen, GoBD/steuerliche Aufbewahrung nach [`GoBD.md`](GoBD.md), MiLoG-Aufzeichnungen nach Paragraf 3.5).
- **Betriebsvereinbarung als Erlaubnistatbestand** (Art. 88 DSGVO i. V. m. Paragraf 26 Abs. 4 BDSG): Eine Kollektivvereinbarung kann die Verarbeitung legitimieren - insbesondere fuer mitbestimmungspflichtige, sensible Zusatzfunktionen wie GPS/Geofencing. Solche Funktionen sind standardmaeßig deaktiviert und werden erst nach Abschluss einer Betriebsvereinbarung aktiviert (Kern-Invariante 5).

Die jeweils aktivierten sensiblen Funktionen werden mit zugehoeriger **Rechtsgrundlage und/oder Betriebsvereinbarung dokumentiert** (Einwilligungs-/Mitbestimmungsnachweis, Paragraf 12); die Aktivierung ist eine rechterelevante Aenderung und erzeugt ein `AuditEvent` (Kern-Invariante 2).

> Hinweis: Eine **Einwilligung** (Art. 6 Abs. 1 lit. a DSGVO) ist im Beschaeftigtenverhaeltnis wegen des Ueber-/Unterordnungsverhaeltnisses nur eingeschraenkt tragfaehig und wird daher nicht als primaere Rechtsgrundlage fuer die Kernverarbeitung herangezogen. Die konkrete Einordnung trifft der Verantwortliche je Mandant.

---

## 2. DSFA-Vorbereitung

Beschaeftigten-Zeit- und Standortdaten sind regelmaeßig **DSFA-pflichtig** (Datenschutz-Folgenabschaetzung nach Art. 35 DSGVO), weil eine systematische Ueberwachung von Beschaeftigten ein voraussichtlich hohes Risiko fuer die Betroffenen bedeuten kann (Paragraf 3.4). ZeitVault liefert dafuer **vorbereitende DSFA-Bausteine** (Paragraf 12), die der Verantwortliche je Mandant zu einer vollstaendigen DSFA ausarbeitet:

- **Beschreibung der Verarbeitung**: abgeleitet aus VVT/RoPA, Datenmodell (Paragraf 8) und Datenfluss (Erfassung -> Bewertung -> Genehmigung -> Reporting/Export).
- **Erforderlichkeits- und Verhaeltnismaeßigkeitsbewertung**: gestuetzt auf Datensparsamkeit (sensible Funktionen standardmaeßig aus) und die dokumentierte Rechtsgrundlage.
- **Risikobetrachtung und Abhilfemaßnahmen**: Verweis auf die technischen und organisatorischen Maßnahmen (RLS-Mandantentrennung, RBAC/ABAC, MFA-Pflicht fuer Admins, Verschluesselung, Feldverschluesselung, Audit-Protokollierung lesender Zugriffe - Paragraf 11).
- **Besondere Bausteine** fuer die regelmaeßig kritischen Funktionen: GPS/Geofencing und eAU-Bezug (besondere Kategorien/Gesundheitsdaten, Paragraf 15.3).

Die DSFA ist organisatorisch **vor Produktivsetzung** sensibler Funktionen und frueh unter Einbindung von Betriebsrat und Datenschutz durchzufuehren (Paragraf 20). Die DSFA-Bausteine werden ergaenzend im Compliance-Verzeichnis abgelegt (siehe [`README.md`](README.md)).

---

## 3. Betroffenenrechte als Funktionen

Die Betroffenenrechte sind nicht nur organisatorisch, sondern als **Systemfunktionen** umgesetzt (Paragraf 3.4, Paragraf 12). Alle nachstehenden Funktionen wirken ausschließlich innerhalb des Tenant-Kontexts (Kern-Invariante 3) und erzeugen, soweit lohn-/sicherheitsrelevant oder lesend auf personenbezogene Daten zugreifend, ein `AuditEvent` (Kern-Invariante 2).

| Betroffenenrecht (DSGVO) | Umsetzung im System |
|---|---|
| **Auskunft** (Art. 15) | **Self-Service-Auskunft**: Beschaeftigte sehen ihre erfassten Zeiten, Salden, Abwesenheiten und Stammdaten im Mitarbeiter-Self-Service (Paragraf 14); zusaetzlich ein zusammenfassender, lesbarer Auskunftsbericht. Der lesende Zugriff auf personenbezogene Daten wird protokolliert (Paragraf 11, siehe Abschnitt 10). |
| **Berichtigung** (Art. 16) | Berichtigung **ueber den Korrektur-Workflow** (Paragraf 4, Paragraf 8). Zeitdaten werden nie ueberschrieben: Eine Korrektur erzeugt einen neuen `TimeEntry` mit erhoehter `revision`, `previous_entry_id` und Pflicht-Begruendung `correction_reason` (Kern-Invariante 1, GoBD). Stammdaten werden ueber die Verwaltung berichtigt, jede Aenderung erzeugt ein `AuditEvent`. |
| **Loeschung** (Art. 17) | Loeschung im Rahmen der **Retention-Engine** (Abschnitt 5). Soweit keine Aufbewahrungspflicht entgegensteht, werden Daten geloescht; aufbewahrungspflichtige Daten werden bis Fristablauf **gesperrt/pseudonymisiert** und erst danach automatisiert geloescht (Kern-Invariante 4). |
| **Datenuebertragbarkeit** (Art. 20) | **Maschinenlesbarer Export je Mitarbeiter** der vom Beschaeftigten bereitgestellten/erfassten Daten in einem strukturierten, gaengigen Format (Paragraf 12). Der Export wird als `ExportJob` mit Pruefsumme protokolliert (Paragraf 8) und erzeugt ein `AuditEvent`. |

Weitere Rechte (Einschraenkung der Verarbeitung nach Art. 18, Widerspruch nach Art. 21) werden durch dieselben Bausteine gestuetzt: die Sperr-/Pseudonymisierungslogik der Retention-Engine bildet die Einschraenkung technisch ab.

---

## 4. Berichtigung ueber den Korrektur-Workflow (Abgrenzung)

Das Recht auf Berichtigung kollidiert mit der GoBD-Unveraenderbarkeit nur scheinbar. ZeitVault loest dies ueber den **Korrektur-Workflow** statt ueber stilles Ueberschreiben:

- Eine unrichtige Zeiterfassung wird nicht veraendert, sondern durch eine **neue Revision** korrigiert; Reporting und Export nutzen die jeweils gueltige Revision, die Historie bleibt vollstaendig (Kern-Invariante 1, Paragraf 8).
- Die urspruengliche (unrichtige) Angabe bleibt als Vorgaengerrevision nachvollziehbar - das ist datenschutzrechtlich zulaessig und steuerrechtlich geboten, weil die Korrektur mit Begruendung dokumentiert ist.
- Reine Stammdatenkorrekturen (z. B. Namensschreibweise) erfolgen ueber die Verwaltung und werden im Audit-Ledger protokolliert.

Damit wird das Berichtigungsrecht erfuellt, ohne die Revisionssicherheit (GoBD) zu verletzen.

---

## 5. Loeschen vs. Aufbewahren (Retention-Engine - Kern-Invariante 4)

Das zentrale Spannungsfeld ist **Loeschung (DSGVO) gegen Aufbewahrungspflicht (GoBD/Steuer/ArbZG)**. ZeitVault loest es ueber eine je Mandant konfigurierbare **Retention-Engine** (Paragraf 12):

- Daten, die einer steuerlichen oder arbeitsrechtlichen Aufbewahrungspflicht unterliegen, werden bei Austritt eines Beschaeftigten **nicht hart geloescht, sondern gesperrt/pseudonymisiert** und erst nach Fristablauf automatisiert geloescht (Kern-Invariante 4).
- **Sperren** entzieht die Daten der aktiven Verarbeitung (kein Reporting, keine Auswertung, keine Anzeige im Self-Service), haelt sie aber fuer eine Betriebspruefung verfuegbar.
- **Pseudonymisierung** ersetzt direkt identifizierende Stammdaten durch ein Pseudonym, sodass der Personenbezug nur noch ueber eine getrennt gesicherte Zuordnung herstellbar ist; die fuer die Aufbewahrungspflicht erforderlichen Aufzeichnungen bleiben auswertbar.
- **Fristen** sind pro Mandant konfigurierbar (Richtwerte: Lohnunterlagen i. d. R. 6 Jahre, buchungsrelevante Unterlagen 10 Jahre, ArbZG-Aufzeichnungen >= 2 Jahre; Details in [`GoBD.md`](GoBD.md)). Nach Fristablauf loescht die Retention-Engine automatisiert.
- `TimeEntry` selbst bleibt waehrend der Aufbewahrungsfrist unveraenderlich (Kern-Invariante 1); die Sperr-/Pseudonymisierungslogik wirkt auf den Personenbezug und die Sichtbarkeit, nicht auf die GoBD-Historie.

Das unveraenderliche Audit-Ledger liegt revisionssicher in WORM-Ablage; das Loeschen/Sperren/Pseudonymisieren selbst ist eine protokollpflichtige Aktion und erzeugt ein `AuditEvent` (Kern-Invariante 2, Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).

---

## 6. Datensparsamkeit & Mitbestimmung (GPS/Geofencing aus - Kern-Invariante 5)

ZeitVault erhebt nur die fuer den jeweiligen Zweck erforderlichen Daten (Datenminimierung nach Art. 5 Abs. 1 lit. c DSGVO):

- **Stammdaten datensparsam**: `Employee` haelt nur die fuer Erfassung, Bewertung und Lohnexport notwendigen Felder (Paragraf 8).
- **GPS/Geofencing standardmaeßig DEAKTIVIERT** (Kern-Invariante 5, Paragraf 3.4, Paragraf 12). Die Einfuehrung technischer Einrichtungen, die zur Ueberwachung von Verhalten oder Leistung der Beschaeftigten geeignet sind, ist **mitbestimmungspflichtig nach BetrVG Paragraf 87** (Abs. 1 Nr. 6). Geofencing/Standortdaten sind deshalb nur nach Abschluss einer **Betriebsvereinbarung** aktivierbar; ohne Aktivierung findet keine Standortverarbeitung statt - keine heimliche Verhaltensueberwachung.
- Auch bei Aktivierung dient Geofencing ausschließlich der **Plausibilisierung** (Paragraf 13), nicht der Bewegungsverfolgung; die Aktivierung wird mit Rechtsgrundlage/Betriebsvereinbarung dokumentiert (Einwilligungs-/Mitbestimmungsnachweis, Paragraf 12) und im Audit-Ledger protokolliert (Kern-Invariante 2).
- **Observability datensparsam**: Logs/Metriken werden ohne unnoetige Personenbezuege gefuehrt (Paragraf 16).

Betriebsrat und Datenschutz sind frueh einzubinden (Paragraf 20).

---

## 7. Datenresidenz

- **Cloud/SaaS ausschließlich in deutschen/EU-Rechenzentren** (z. B. Hetzner, IONOS, OVHcloud EU; Paragraf 12, Paragraf 2). Auch der Objektspeicher ist ein **EU-Provider-S3** bzw. im Self-Hosting SeaweedFS/MinIO unter Kundenkontrolle (Paragraf 5).
- **Keine Drittlanduebermittlung ohne Garantien**: Eine Uebermittlung in Drittlaender (außerhalb EU/EWR) findet nur statt, wenn die Voraussetzungen nach Kapitel V DSGVO (Angemessenheitsbeschluss bzw. geeignete Garantien) erfuellt sind. Der Default-Betrieb sieht keine Drittlanduebermittlung vor.
- **Self-Hosted**: Datenhoheit vollstaendig beim Kunden; die Daten verlassen die Kundeninfrastruktur nicht (Paragraf 2).
- Eingesetzte Subunternehmer (Hosting, KMS, eAU-Gateway) sind in der **Subunternehmerliste** der AVV ausgewiesen (Abschnitt 8).

> Der konkrete Cloud-Provider und das KMS/HSM sind noch zu fixieren (offene Entscheidung, Paragraf 19); die Residenz-Anforderung (DE/EU) ist davon unabhaengig verbindlich.

---

## 8. Dokumente (VVT/RoPA, AVV inkl. Subunternehmerliste, DSFA-Bausteine)

ZeitVault stellt die datenschutzrechtlichen Dokumente teils generierbar bereit, teils als Vorlage (Paragraf 12):

- **VVT/RoPA** (Verzeichnis von Verarbeitungstaetigkeiten, Art. 30 DSGVO): **generierbar** aus Konfiguration, Datenmodell und aktivierten Funktionen - mit Zwecken, Rechtsgrundlagen, Datenkategorien, Empfaengern, Aufbewahrungsfristen (aus der Retention-Konfiguration) und technisch-organisatorischen Maßnahmen. Eng verzahnt mit der generierbaren Verfahrensdokumentation (Paragraf 9, [`GoBD.md`](GoBD.md)).
- **AVV** (Auftragsverarbeitungsvertrag, Art. 28 DSGVO) **inkl. Subunternehmerliste** fuer den SaaS-Betrieb: DariaTech (Auftragsverarbeiter) und Kunde (Verantwortlicher). Die **Subunternehmerliste** fuehrt eingesetzte Unter-Auftragsverarbeiter (Hosting/Rechenzentrum, KMS, eAU-Gateway u. a.) mit Zweck und Standort (DE/EU). Im Self-Hosting entfaellt die AVV in der Regel, da keine Auftragsverarbeitung durch DariaTech stattfindet.
- **DSFA-Bausteine**: vorbereitende Bausteine zur Datenschutz-Folgenabschaetzung fuer Beschaeftigten-Zeit-/Standortdaten (siehe Abschnitt 2).

Diese Artefakte werden im Compliance-Verzeichnis abgelegt bzw. erzeugt (siehe [`README.md`](README.md)).

---

## 9. Feldverschluesselung sensibler Felder

Ergaenzend zur flaechendeckenden Verschluesselung **at rest** (AES-256 fuer DB und Objektspeicher) und **in transit** (TLS 1.3) sowie der Envelope-Encryption ueber KMS (Paragraf 11) setzt ZeitVault eine **anwendungsseitige Feldverschluesselung fuer besonders sensible Felder** ein (Paragraf 11, Paragraf 12):

- Betroffen sind insbesondere Felder mit erhoehtem Schutzbedarf, z. B. der **eAU-Bezug** (Gesundheits-/Abwesenheitsdaten, besondere Kategorien nach Art. 9 DSGVO; Paragraf 15.3) sowie weitere als sensibel klassifizierte Stammdatenfelder.
- Die Verschluesselung erfolgt zusaetzlich zur Speicher-Verschluesselung (Defense in Depth), sodass diese Felder auch bei Zugriff auf die Datenbankschicht nicht im Klartext vorliegen.
- Schluesselverwaltung ueber KMS/OpenBao; optional kundenverwaltete Schluessel (BYOK) und HSM fuer On-Prem (Paragraf 2, Paragraf 11).

Die Feldverschluesselung ersetzt nicht die Mandantentrennung (Kern-Invariante 3), sondern ergaenzt sie.

---

## 10. Audit-Protokollierung lesender Zugriffe

Ueber die in [`GoBD.md`](GoBD.md) beschriebene Protokollierung schreibender, lohnrelevanter Aktionen hinaus gilt fuer den Datenschutz: **Jeder lesende Zugriff auf personenbezogene Daten wird protokolliert** (Paragraf 11). Damit ist nachvollziehbar, wer wann auf welche Beschaeftigtendaten zugegriffen hat - relevant fuer Missbrauchserkennung und fuer die Beantwortung von Betroffenenanfragen.

- Lesezugriffe werden im Rahmen der Audit-Protokollierung erfasst; sicherheitsrelevante Zugriffe fließen als `AuditEvent` in den getrennten, append-only, hash-verketteten Audit-Ledger (Kern-Invariante 2, Paragraf 9, [ADR-0006](../adr/0006-audit-ledger-append-only.md)).
- Die Protokollierung ist selbst datensparsam zu fuehren (Subjekt, Objekt, Zeitpunkt, Zweck/Aktion - kein Mitschnitt fachlicher Inhalte ueber das Notwendige hinaus).
- Zugriff auf personenbezogene Daten ist durch **RBAC + ABAC** (Standort/Abteilung) und das Prinzip minimaler Rechte begrenzt; MFA-Pflicht fuer Admins (Paragraf 11).

---

## Verweise

- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.4 - DSGVO/BDSG (Rechtsgrundlagen, DSFA, Betroffenenrechte, Loeschen vs. Aufbewahren, VVT/AVV, Mitbestimmung BetrVG Paragraf 87)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 12 - Datenschutz/DSGVO (Datenresidenz, Datensparsamkeit, Betroffenenrechte als Funktionen, Retention-Engine, Dokumente, Einwilligungs-/Mitbestimmungsnachweis)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 7 - Mandantenfaehigkeit (RLS, Tenant-Kontext, Kern-Invariante 3)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 8 - Datenmodell (`Employee` datensparsam, `TimeEntry`-Revisionen, `ExportJob` mit Pruefsumme, Soft-Delete-Sperre)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 9 - Revisionssicherheit & Audit (Audit-Ledger, Verfahrensdokumentation)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 11 - Sicherheitsarchitektur (Verschluesselung, Feldverschluesselung, RBAC/ABAC, MFA, Protokollierung lesender Zugriffe)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 13, Paragraf 15.3 - Geofencing-Plausibilisierung, eAU
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](../adr/0004-mandantenfaehigkeit-postgres-rls.md) - technische Umsetzung von Kern-Invariante 3
- [ADR-0006: Audit-Ledger: append-only, hash-verkettet](../adr/0006-audit-ledger-append-only.md) - Protokollierung (Kern-Invariante 2)
- [`GoBD.md`](GoBD.md) - steuerliche Aufbewahrung und Spannungsfeld Loeschung <-> Aufbewahrung (Kern-Invariante 4)
- [`ARBZG.md`](ARBZG.md) - arbeitszeitrechtliche Aufzeichnungspflichten
- [`GLOSSAR.md`](GLOSSAR.md) - Begriffe (DSGVO, BDSG, DSFA, VVT/RoPA, AVV, BetrVG, Pseudonymisierung)

---

*Hinweis: Dieses Dokument fasst die datenschutzrechtlichen Anforderungen (DSGVO/BDSG) fuer die technische Planung zusammen und ersetzt keine Rechtsberatung. Fuer die verbindliche Auslegung von DSGVO und BDSG, fuer die Wahl der Rechtsgrundlagen, die Durchfuehrung der DSFA und die Ausgestaltung von Betriebsvereinbarungen sind die offiziellen Quellen bzw. fachkundige Beratung maßgeblich.*
