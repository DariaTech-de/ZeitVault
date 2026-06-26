# Datenschutz-Folgenabschätzung (DSFA / DPIA) — Bausteine

Diese Bausteine unterstützen die Datenschutz-Folgenabschätzung gemäß Art. 35 DSGVO für die Verarbeitung von Beschäftigten-Zeit- und (optional) Standortdaten. Sie sind je Einsatz zu vervollständigen und von der/dem Verantwortlichen freizugeben.

> Ersetzt keine Rechtsberatung; die Erforderlichkeit und das Ergebnis einer DSFA sind im Einzelfall zu prüfen.

## 1. Anlass und Erforderlichkeit

Die systematische Erfassung von Arbeitszeiten Beschäftigter kann ein hohes Risiko bergen (Verhaltens-/Leistungskontrolle, ggf. Standortdaten). Eine DSFA ist insbesondere zu prüfen, wenn Standort-/Geofencing-Funktionen aktiviert werden.

## 2. Beschreibung der Verarbeitung

Siehe [`VVT-ROPA.md`](VVT-ROPA.md) (V1–V6) und [`VERFAHRENSDOKUMENTATION.md`](VERFAHRENSDOKUMENTATION.md). Kernverarbeitung: Zeiterfassung, Bewertung, Abwesenheiten, Auswertung/Export; optional eAU (Art. 9), optional Standortdaten.

## 3. Risiken für die Rechte und Freiheiten

| Risiko | Bewertung | Maßnahme im System |
|---|---|---|
| Lückenlose Verhaltens-/Leistungsüberwachung | hoch (bei Standortdaten) | GPS/Geofencing standardmäßig AUS (Kern-Invariante 5); Aktivierung nur per Betriebsvereinbarung |
| Heimliche Auswertung | mittel | Datensparsamkeit; lesende Zugriffe und Aktionen protokolliert |
| Unbefugter Zugriff (mandantenübergreifend) | hoch | RLS `FORCE` je Tabelle, Tenant-Kontext je Transaktion, Tests |
| Manipulation von Zeit-/Lohndaten | hoch | append-only Trigger, hash-verkettetes Audit-Ledger, Korrektur statt Überschreiben |
| Verarbeitung von Gesundheitsdaten (eAU) | hoch (Art. 9) | nur Status/Referenz, kein Diagnoseinhalt; Zugriff RBAC-beschränkt |
| Übermäßige Aufbewahrung | mittel | Retention-Engine: Sperren/Pseudonymisieren, Löschung nach Frist |
| Drittlandübermittlung | hoch | Datenresidenz EU/DE technisch erzwungen |

## 4. Abhilfemaßnahmen (TOMs)

Pseudonymisierung, Mandantentrennung (RLS), Append-only/Revisionssicherheit, RBAC/ABAC, MFA-Pflicht für Admins, Verschlüsselung (Transport; Feldverschlüsselung sensibler Felder vorgesehen), Protokollierung lesender Zugriffe auf personenbezogene Daten, SBOM/Signatur der Releases, Datensparsamkeit.

## 5. Mitbestimmung

Technische Einrichtungen zur Verhaltens-/Leistungskontrolle unterliegen der Mitbestimmung (BetrVG § 87 (1) Nr. 6). Standort-/Geofencing-Funktionen sind ohne Betriebsvereinbarung nicht zu aktivieren.

## 6. Ergebnis (je Einsatz auszufüllen)

- Restrisiko: _<niedrig/mittel/hoch>_
- Freigabe Verantwortliche:r / DSB: _<Datum, Unterschrift>_
- Konsultation der Aufsichtsbehörde erforderlich: _<ja/nein>_

## Verweise

- [`DSGVO.md`](DSGVO.md), [`VVT-ROPA.md`](VVT-ROPA.md)
- [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md) Paragraf 3.4, 12
