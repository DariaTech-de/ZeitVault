# Compliance-Verzeichnis

Dieses Verzeichnis buendelt die **Compliance-Referenzen** von ZeitVault: arbeits-, steuer- und datenschutzrechtliche Grundlagen sowie die Schnittstellen-Referenzen, auf die sich Datenmodell, Validierungslogik, Aufbewahrung und Export stuetzen. Die Dokumente fassen die rechtlichen Anforderungen fuer die technische Umsetzung zusammen und verweisen auf die maßgeblichen Quellen; sie sind die fachliche Grundlage fuer die Module **Zeiterfassung**, **Compliance-/Regel-Engine**, **Export** und **Verwaltung**.

Verbindliche Quelle der Architektur ist [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md); alle Paragraf-Verweise in den Compliance-Dokumenten beziehen sich darauf (insbesondere Paragraf 3 Rechtlicher Rahmen, Paragraf 9 Revisionssicherheit, Paragraf 12 Datenschutz, Paragraf 15 DATEV-Export). Architekturentscheidungen mit Compliance-Bezug sind als ADRs hinterlegt, vgl. [ADR-0006](../adr/0006-audit-ledger-append-only.md) (Audit-Ledger) und [ADR-0009](../adr/0009-compliance-regel-engine.md) (Regel-Engine).

## Index

| Dokument | Zweck | Status |
|---|---|---|
| [`GLOSSAR.md`](GLOSSAR.md) | Begriffsverzeichnis der wiederkehrenden Compliance- und Fachbegriffe (GoBD, DSGVO, ArbZG, DATEV, RLS, Revisionssicherheit). | Erstellt - 2026-06-26 |
| [`GoBD.md`](GoBD.md) | Fasst die Grundsaetze ordnungsmaeßiger Buchfuehrung (Unveraenderbarkeit, Nachvollziehbarkeit, Aufbewahrung, Verfahrensdokumentation) und ihre Umsetzung im System zusammen. | Erstellt - 2026-06-26 |
| [`DSGVO.md`](DSGVO.md) | Beschreibt die datenschutzrechtliche Umsetzung (Rechtsgrundlagen, Betroffenenrechte, Loeschen vs. Aufbewahren, Datensparsamkeit, Mitbestimmung). | Erstellt - 2026-06-26 |
| [`ARBZG.md`](ARBZG.md) | Haelt die arbeitszeitrechtlichen Anforderungen (Hoechst-/Ruhezeiten, Pausen, Aufzeichnungspflicht) fest, die die Regel-Engine abbildet. | Erstellt - 2026-06-26 |
| [`DATEV-REFERENZ.md`](DATEV-REFERENZ.md) | Verweist auf die offizielle DATEV-Schnittstellenbeschreibung und leitet daraus das Mapping fuer den Lohn-Export ab. | Erstellt - offizielle DATEV-Beschreibung noch zu beschaffen |

## Weitere abzulegende Artefakte

Hier werden ergaenzend die folgenden Compliance-Artefakte abgelegt; sie sind teils noch zu erstellen oder zu beschaffen:

- **Verzeichnis von Verarbeitungstaetigkeiten (VVT/RoPA)** - generierbares Verzeichnis der Verarbeitungstaetigkeiten gemaeß DSGVO (vgl. Architektur Paragraf 12).
- **AVV-Vorlage** - Vorlage fuer den Auftragsverarbeitungsvertrag fuer den SaaS-Betrieb, **inkl. Subunternehmerliste** (Hosting, KMS, eAU-Gateway u. a.).
- **DSFA-Bausteine** - vorbereitende Bausteine fuer die Datenschutz-Folgenabschaetzung zu Beschaeftigten-Zeit-/Standortdaten.
- **Offizielle DATEV-Schnittstellenbeschreibung** - maßgebliche Referenz fuer die Feldlayouts des Lohn-Exports; ueber DATEV zu beziehen und hier als verbindliche Quelle zu hinterlegen, bevor das Export-Modul gebaut wird (Architektur Paragraf 15, Paragraf 20).

## Disclaimer

Die Dokumente in diesem Verzeichnis fassen rechtliche Rahmenbedingungen fuer die technische Planung zusammen und **ersetzen keine Rechtsberatung**. Fuer die verbindliche Auslegung von ArbZG, GoBD und DSGVO sowie fuer die DATEV-Formate sind die offiziellen Quellen bzw. fachkundige Beratung maßgeblich.
