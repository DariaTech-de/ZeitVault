# ADR-0010: Eine Codebasis, zwei Betriebsmodelle

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault wird in **zwei Betriebsmodellen** angeboten: selbst gehostet (On-Premises / im eigenen Rechenzentrum, eine Organisation pro Installation) und als Cloud/SaaS-Dienst (mehrere mandantengetrennte Organisationen im DE/EU-Rechenzentrum). Beide Modelle adressieren unterschiedliche Zielkunden, Datenhoheits- und Update-Erwartungen (Paragraf 2).

Daraus ergibt sich eine zentrale Architekturfrage: Wie werden zwei Betriebsmodelle bedient, ohne dass sich Entwicklung, Test, Auslieferung und Sicherheit verdoppeln? Mehrere Kraefte und Spannungsfelder wirken hier:

- **Verdopplungsrisiko:** Getrennte Code-Branches oder Forks je Betriebsmodell fuehren zu auseinanderlaufenden Verhaltensweisen, doppeltem Pflegeaufwand, Merge-Schmerz und der Gefahr, dass ein Fix nur in einer Linie landet. Bei einem langlebigen Enterprise-Produkt summiert sich das ueber die Zeit zu erheblichen Wartungskosten.
- **Sicherheit und Nachvollziehbarkeit:** Lohn- und Beschaeftigtendaten verlangen eine getestete, nachvollziehbare Artefaktlinie. Je mehr unterschiedliche Builds existieren, desto schwerer ist zu belegen, dass genau das gepruefte, gescannte und signierte Artefakt beim Kunden laeuft (Paragraf 11, Paragraf 16).
- **Konsistenz der Compliance-Eigenschaften:** Revisionssicherheit (GoBD), Mandantentrennung und Audit-Ledger sind Kern-Invarianten, die in beiden Betriebsmodellen identisch gelten muessen. Divergierende Builds gefaehrden diese Garantien.
- **Mandantenfaehigkeit von Tag 1:** Self-Hosted ist faktisch ein Sonderfall der Mandantenfaehigkeit (ein Mandant statt n). Wenn Tenancy von Beginn an im Modell verankert ist, ist Self-Hosted keine eigene Code-Variante, sondern eine Konfiguration (Paragraf 1 Leitprinzip 3, Paragraf 7).
- **Einheitliche Auslieferung:** Die Architektur sieht einen Satz signierter Container-Images vor, der ueber Docker Compose (klein) und Helm/Kubernetes (gross) in beiden Betriebsmodellen laeuft (Paragraf 16).

Paragraf 2 formuliert dies bereits als Architektur-Konsequenz: identische Container-Images, Unterschiede ausschliesslich ueber Konfiguration, nie ueber getrennte Code-Branches. Diese ADR macht das Prinzip verbindlich und benennt die Konsequenzen.

## Entscheidung

ZeitVault wird aus **einer einzigen Codebasis** und mit **identischen, signierten Container-Images** fuer Self-Hosted und Cloud/SaaS ausgeliefert.

Verbindliche Regeln:

- **Eine Codebasis, ein Artefakt:** Beide Betriebsmodelle nutzen denselben Quellcode und denselben Satz signierter Container-Images. Es gibt **keine** getrennten Code-Branches oder Forks je Betriebsmodell und keine "Self-Hosted-Edition" als eigenstaendige Build-Linie.
- **Unterschiede ausschliesslich ueber Konfiguration:** Verhaltensunterschiede zwischen Self-Hosted und Cloud werden ausschliesslich ueber **Konfiguration** gesteuert - Umgebungsvariablen (Env) bzw. **Helm-Values** und Feature-Flags. Niemals ueber abweichenden Code.
- **Self-Hosted als Mandant `default`:** Im Self-Hosted-Betrieb laeuft genau ein Mandant mit `tenant_id = 'default'`. RLS bleibt dabei aktiv (siehe [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).
- **SaaS-spezifische Funktionen sind abschaltbar:** SaaS-Selbstregistrierung und Abrechnung/Billing sind im Self-Hosted-Betrieb per Konfiguration **deaktiviert**. Sie sind Funktionen desselben Codes, kein Code, der nur in einem Build existiert.
- **Trennstaerke und Hosting variieren konfigurativ, nicht im Code:** Pooled Multi-Tenancy ist Standard; eine dedizierte DB/Schema fuer einzelne Kunden ist eine Connection-Strategie, kein zweiter Anwendungspfad (Paragraf 7, [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)). Objektspeicher (EU-Provider-S3 vs. SeaweedFS/MinIO) und KMS/HSM werden ueber Adapter/Konfiguration gewaehlt, nicht ueber Forks.

## Begruendung

- **Wartbarkeit:** Eine Codebasis bedeutet, dass jeder Fix, jedes Feature und jedes Update genau einmal entwickelt, getestet und ausgerollt wird. Es entsteht kein Merge- oder Backport-Aufwand zwischen Betriebsmodell-Linien, und kein Fix kann versehentlich nur in einer Linie landen.
- **Konsistenz:** Self-Hosted- und Cloud-Kunden erhalten dasselbe Verhalten und dieselben Compliance-Eigenschaften (GoBD-Revisionssicherheit, Mandantentrennung, Audit-Ledger). Konfiguration verschiebt, was aktiv ist - sie veraendert nicht die zugrundeliegende Logik. Self-Hosted als `tenant_id = 'default'` bei aktivem RLS vermeidet einen abweichenden Single-Tenant-Code-Pfad (Paragraf 7).
- **Sicherheit - eine getestete Artefaktlinie (ausschlaggebend):** Es gibt genau eine Build-, Scan- und Signaturkette (Lint -> Test -> Security-Scans -> SBOM -> Build -> Cosign-Signatur -> Release, Paragraf 16). Dasselbe gepruefte, gescannte und signierte Image laeuft bei allen Kunden. Das vereinfacht den Nachweis (SBOM je Release, signierte Images) und reduziert die Angriffs- und Fehlerflaeche gegenueber mehreren parallel gepflegten Build-Linien - ein wesentlicher Vorteil bei lohn- und personenbezogenen Daten (Paragraf 11).
- **Mandantenfaehigkeit von Tag 1 macht es moeglich:** Weil Tenancy von Beginn an im Datenmodell verankert ist (jede Tabelle fuehrt `tenant_id`, RLS erzwingt Trennung), ist Self-Hosted nur der Sonderfall "ein Mandant". Es braucht keinen Single-Tenant-Sonderbau (Paragraf 1 Leitprinzip 3, [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).
- **CRA-/Lieferketten-Logik:** Eine nachvollziehbare, reproduzierbare und signierte Artefaktlinie passt zur Cyber-Resilience-Act-Vorbereitung (Schwachstellenmanagement, Update-Pflichten, SBOM, Paragraf 5.1, Paragraf 16).

## Konsequenzen

### Positiv

- Jede Aenderung wird genau einmal gebaut, getestet, gescannt und signiert; kein Backport- oder Merge-Aufwand zwischen Betriebsmodell-Linien.
- Konsistentes Verhalten und konsistente Compliance-Eigenschaften ueber beide Betriebsmodelle (Paragraf 2, Paragraf 7).
- Eine getestete, signierte Artefaktlinie vereinfacht Sicherheit, Nachweisbarkeit (SBOM, Cosign-Signatur) und CRA-Vorbereitung (Paragraf 11, Paragraf 16).
- Self-Hosted ohne Single-Tenant-Sonderpfad, weil Mandantenfaehigkeit von Tag 1 verankert ist (Kern-Invariante 3, [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).

### Negativ

- **Disziplin bei Feature-Flags/Konfiguration noetig:** Betriebsmodell-Unterschiede muessen sauber als Konfiguration/Feature-Flags modelliert werden, nicht als verstreute `if self-hosted`-Abzweigungen im Code. Ohne klare Konventionen drohen schwer testbare Konfigurationspfade und tote Code-Zweige.
- **Test-Matrix waechst:** Beide relevanten Konfigurationen (Self-Hosted mit `default`/deaktivierter Registrierung-Abrechnung; Cloud mit Multi-Tenant/Billing) muessen in CI abgesichert werden, damit kein Pfad nur in einem Modell funktioniert.
- **Keine schnelle Self-Hosted-Sonderloesung im Code:** Ein Kundenwunsch, der nur Self-Hosted betrifft, darf nicht per Fork "schnell" geloest werden, sondern muss als Konfiguration/Feature-Flag in der gemeinsamen Codebasis abgebildet werden. Das ist langfristig richtig, kurzfristig aber aufwendiger als ein Fork.

### Neutral

- SaaS-Selbstregistrierung und Abrechnung sind im Self-Hosted-Betrieb lediglich deaktiviert; der Code dafuer ist vorhanden, wird aber nicht aktiviert.
- Infrastruktur-Adapter (Objektspeicher EU-Provider-S3 vs. SeaweedFS/MinIO, KMS/HSM, Connection-Strategie fuer pooled vs. dedizierte DB/Schema) werden ueber Konfiguration gewaehlt; die Anwendungslogik bleibt identisch (Paragraf 7, Paragraf 16).
- Auslieferung erfolgt aus denselben Images ueber Docker Compose (klein) oder Helm/Kubernetes (gross) in beiden Betriebsmodellen; nur die Werte unterscheiden sich (Paragraf 16).

## Betrachtete Alternativen

- **Getrennte Code-Branches oder Forks je Betriebsmodell** - Abgelehnt. Fuehrt zu auseinanderlaufendem Verhalten, doppeltem Pflege- und Backport-Aufwand und der Gefahr, dass ein Fix nur in einer Linie ankommt. Widerspricht direkt der Architektur-Konsequenz aus Paragraf 2 und untergraebt die Konsistenz der Compliance-Garantien.
- **Eigene "Self-Hosted-Edition" als separate Build-Linie** - Abgelehnt. Mehrere Build-, Scan- und Signaturketten erhoehen Aufwand und Angriffs-/Fehlerflaeche und erschweren den Nachweis, dass genau das gepruefte Artefakt beim Kunden laeuft. Die Sicherheitslogik "eine getestete Artefaktlinie" entfaellt. Self-Hosted-Spezifika werden stattdessen ueber Konfiguration/Feature-Flags desselben Artefakts abgebildet.
- **Single-Tenant-Code-Pfad fuer Self-Hosted (Tenancy nur in der Cloud)** - Abgelehnt. Erzeugt einen zweiten Datenzugriffs- und Sicherheitsweg und widerspricht der Verankerung der Mandantenfaehigkeit von Tag 1. Self-Hosted laeuft stattdessen als `tenant_id = 'default'` mit aktivem RLS (siehe [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).

## Verweise

- `../ARCHITEKTUR.md` Paragraf 2 - Betriebsmodelle: identische Container-Images, Unterschiede ausschliesslich ueber Konfiguration (Env/Helm-Values), nie ueber getrennte Code-Branches; Self-Hosted = `tenant_id = 'default'` bei deaktivierter SaaS-Registrierung/Abrechnung.
- `../ARCHITEKTUR.md` Paragraf 7 - Mandantenfaehigkeit: pooled Multi-Tenancy via RLS, Self-Hosted = ein Mandant `default` mit aktivem RLS, optional dedizierte DB/Schema (gleicher Code, andere Connection-Strategie).
- `../ARCHITEKTUR.md` Paragraf 16 - Infrastruktur & DevOps: ein Satz signierter Container-Images, identische Images fuer beide Betriebsmodelle, CI/CD-Kette mit SBOM und Cosign-Signatur.
- `../ARCHITEKTUR.md` Paragraf 1 (Leitprinzip 3) - "Eine Codebasis, zwei Betriebsmodelle"; Self-Hosted = Single-Tenant-Konfiguration desselben Codes.
- `../ARCHITEKTUR.md` Paragraf 5.1 / Paragraf 11 - Versions-/Update-Strategie und Sicherheitsarchitektur: getestete, signierte, reproduzierbare Artefaktlinie (SBOM, Cosign), CRA-Vorbereitung.
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md) - Mandantenfaehigkeit von Tag 1; Self-Hosted als `tenant_id = 'default'` mit aktivem RLS; pooled vs. dedizierte DB/Schema als Connection-Strategie.
- [README.md](README.md) - Index aller ADRs.
