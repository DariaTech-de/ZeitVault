# ADR-0009: Versionierte Compliance-/Regel-Engine

**Status:** Akzeptiert - 2026-06-26

## Kontext

Die arbeitszeitrechtliche Bewertung ist fuer ZeitVault funktionale Pflicht und kein nachgelagertes Reporting-Feature: Das System muss in Echtzeit gegen das Arbeitszeitgesetz (ArbZG) pruefen und warnen - taegliche Hoechstarbeitszeit, Ruhezeit (>= 11 h), Pausen (>= 30 min ab 6 h, >= 45 min ab 9 h), Sonn- und Feiertagsarbeit sowie optionale Sonderregeln wie der Jugendarbeitsschutz (JArbSchG) (Paragraf 3.2). Diese Pruefungen leiten sich aus geltendem Recht ab; "Compliance by Design" ist eines der Leitprinzipien des Produkts (Paragraf 1).

Das bestimmende Spannungsfeld ist die **Beweglichkeit der Rechtslage**. Die Pflicht zur systematischen Arbeitszeiterfassung ergibt sich bereits aus dem EuGH-Urteil von 2019 (Rs. C-55/18) und dem BAG-Beschluss vom 13.09.2022; ein eigenstaendiges Arbeitszeiterfassungsgesetz als ArbZG-Novelle war zum Stand Fruehjahr 2026 aber noch nicht verkuendet (Paragraf 3.1). Der Referentenentwurf deutet substanzielle Aenderungen an, darunter eine **Tendenz von der starren Tagesgrenze hin zur woechentlichen Hoechstarbeitszeit (bis 48 h) mit Ausgleichszeitraum** sowie absehbare Ausnahmen und Uebergangsfristen fuer Kleinst-/Kleinbetriebe und Sonderregeln fuer leitende Angestellte. Die Architektur trifft daher eine explizite Vorsorge: Die Erfassungs- und Bewertungslogik soll regelbasiert und versioniert gebaut werden, damit ein solcher Umstieg per Konfiguration abbildbar ist - ohne Code-Umbau und ohne Datenmigration (Paragraf 3.1, Paragraf 10).

Daraus ergeben sich mehrere Kraefte:

- **Aenderbarkeit ohne Eingriff in die Vergangenheit:** Wenn sich das Gesetz aendert (z. B. taeglich -> woechentlich), darf das die bereits erfasste, bewertete und ggf. abgeschlossene Historie nicht umschreiben. Eine zum damaligen Zeitpunkt geltende Bewertung muss als solche nachvollziehbar bleiben - das ist auch eine GoBD-Frage (Paragraf 3.3).
- **Vielfalt der Modelle:** Voll-/Teilzeit, Gleitzeit, Schicht und Vertrauensarbeitszeit haben je eigene Sollzeit-, Pausen- und Gleitzeitregeln; Feiertage haengen am Bundesland des Standorts (Paragraf 4, Paragraf 8). Die Regeln muessen je Modell und Zeitraum unterschiedlich greifen koennen.
- **Zwei Auswertungszeitpunkte:** Es braucht eine **Live-Bewertung** beim Stempeln (sofortige, kontextsensitive Warnung statt Fehlermeldung, Paragraf 14) und eine **Stapelbewertung** (Monatsabschluss, Verstossreport, Paragraf 4).
- **Beweisbare Korrektheit:** Die Bewertungslogik trifft Aussagen mit rechtlicher und lohnrelevanter Wirkung. Sie muss vollstaendig und reproduzierbar testbar sein - nicht nur an Beispielen, sondern systematisch.
- **Beide Betriebsmodelle:** Die Engine muss in Self-Hosted (ein Mandant `default`) wie in Cloud/SaaS identisch arbeiten und je Mandant konfigurierbar sein (Paragraf 2, Paragraf 7).

Die Architektur sieht die Compliance-/Regel-Engine bereits als eigenes Modul des Backend-Monolithen vor (Paragraf 6) und beschreibt das Ziel in Paragraf 10 (versionierte Regelpakete, deklarative Bewertung, Live- und Stapellauf, vollstaendige Testbarkeit). Diese ADR macht die Festlegung verbindlich und benennt die Konsequenzen.

## Entscheidung

Wir bauen die arbeitszeitrechtliche Bewertung als **regelbasierte, versionierte Compliance-/Regel-Engine** und nicht als fest verdrahtete Pruefungen im Code.

Verbindliche Regeln:

- **Versionierte Regelpakete:** Die fachlichen Regeln liegen als versionierte Regelpakete vor, gebuendelt nach Themen (Hoechstarbeitszeit, Ruhezeit, Pausen, Feiertage, Zuschlaege). Ein Regelpaket ist eine identifizierbare, unveraenderliche Version eines Regelsatzes. Optionale Sonderregelsaetze wie der Jugendarbeitsschutz (JArbSchG) sind eigene Regelpakete.
- **Referenz mit Gueltigkeitszeitraum:** Jedes Arbeitszeitmodell (`WorkTimeModel`) referenziert ein Regelpaket mit einem Gueltigkeitszeitraum (gueltig-ab/gueltig-bis). Eine Gesetzes- oder Konfigurationsaenderung wird als **neues Regelpaket mit neuem Gueltigkeitsbeginn** eingepflegt; bestehende Pakete werden nicht ueberschrieben. Eine Bewertung waehlt das fuer den jeweiligen Bewertungszeitpunkt gueltige Regelpaket.
- **Deklarative Bewertung:** Die Engine arbeitet deklarativ nach dem Muster Bedingung -> Bewertung/Warnung. Regeln beschreiben, *was* gilt, nicht prozedural, *wie* geprueft wird. Eine Bewertung liefert ein strukturiertes Ergebnis (z. B. konform, Warnung, Verstoss mit Begruendung und Bezug zur ausloesenden Regel), das in UI, Verstossreport und Verfahrensdokumentation verwendbar ist.
- **Zwei Ausfuehrungspfade, eine Engine:** Dieselbe Engine bewertet sowohl **live** (Warnung beim Stempeln, Paragraf 14) als auch **im Stapellauf** (Monatsabschluss und Verstossreport, entkoppelt ueber Valkey/BullMQ). Beide Pfade nutzen dieselbe Regelauswahl und dieselbe Bewertungslogik, damit Live-Warnung und Abschlussbewertung fuer denselben Sachverhalt nicht auseinanderlaufen.
- **Vollstaendige Testbarkeit:** Die Engine ist mit Property-Tests (Invarianten und Grenzfaelle, z. B. Ruhezeit-Berechnung ueber Tagesgrenzen) und Snapshot-Tests (reale Szenarien je Regelpaketversion) vollstaendig und reproduzierbar abgesichert. Regelpakete sind eigenstaendig testbar.
- **Geteilte Domaenenlogik:** Die Bewertungslogik liegt in der geteilten Domaenenschicht (`packages/domain`), getrennt von den schnelldrehenden Web-/Mobile-Frameworks (Paragraf 5.1, Paragraf 17), und wird vom Zeiterfassungsmodul (live) und vom Stapellauf (Reporting/Abschluss) gleichermassen genutzt.
- **Beide Betriebsmodelle identisch:** Die Engine laeuft in Self-Hosted (`tenant_id = 'default'`) wie in Cloud/SaaS gleich; Regelpaket-Zuordnung und Feiertagskalender sind je Mandant konfigurierbar, RLS bleibt aktiv ([ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).

Bewertungsergebnisse aendern niemals den erfassten `TimeEntry`; eine Bewertung ist eine Ableitung, keine Korrektur (Kern-Invariante 1, Paragraf 8). Lohn-/sicherheitsrelevante Aktionen, die aus der Bewertung folgen (z. B. eine Genehmigung trotz Warnung), erzeugen ein `AuditEvent` ([ADR-0006](0006-audit-ledger-append-only.md), Paragraf 9).

## Begruendung

- **Gesetzesaenderungen ohne Code-Umbau und ohne Datenmigration (ausschlaggebend):** Die Rechtslage ist nachweislich in Bewegung; der prominenteste absehbare Fall ist der Umstieg von der taeglichen auf die woechentliche Hoechstarbeitszeit (Paragraf 3.1). Mit versionierten Regelpaketen wird ein finaler Gesetzestext bei Verkuendung als neues Paket mit Gueltigkeitsbeginn eingepflegt (Paragraf 19) - ohne die Bewertungs-Codepfade umzubauen und ohne bestehende Daten zu migrieren. Das ist die direkte Umsetzung der in Paragraf 3.1 und Paragraf 10 festgehaltenen Architektur-Konsequenz.
- **Historie bleibt korrekt bewertbar (GoBD):** Weil Regelpakete versioniert und mit Gueltigkeitszeitraum referenziert sind und nicht ueberschrieben werden, bleibt nachvollziehbar, nach welcher Regel ein Zeitraum bewertet wurde. Eine Aenderung der Rechtslage schreibt die Bewertung der Vergangenheit nicht still um - das passt zur Unveraenderbarkeit und Nachvollziehbarkeit nach GoBD (Paragraf 3.3) und zum Korrekturprinzip des Datenmodells (Paragraf 8).
- **Deklarativ ist pruefbar und auditierbar:** Eine deklarative Regel (Bedingung -> Bewertung/Warnung) ist als Datenartefakt les-, versionier- und testbar und laesst sich in die generierbare Verfahrensdokumentation aufnehmen (Regelversionen als Teil der Dokumentation, Paragraf 9). Fest verdrahtete `if`-Kaskaden im Anwendungscode waeren weder so klar versionierbar noch so direkt belegbar.
- **Eine Engine fuer live und Stapellauf verhindert Drift:** Indem Live-Warnung (Paragraf 14) und Monatsabschluss/Verstossreport (Paragraf 4) dieselbe Engine und dieselbe Regelauswahl nutzen, kann die sofortige Warnung beim Stempeln nicht von der spaeteren Abschlussbewertung abweichen. Das ist fuer die Glaubwuerdigkeit gegenueber Mitarbeitenden und Pruefern wesentlich.
- **Testbarkeit als Korrektheitsnachweis:** Bewertungen haben rechtliche und lohnrelevante Wirkung. Property-Tests sichern Invarianten und Grenzfaelle (Tagesgrenzen, Ausgleichszeitraeume), Snapshot-Tests fixieren das erwartete Verhalten je Regelpaketversion. Damit wird eine neue Regelversion eingefuehrt, ohne unbeabsichtigt das Verhalten bestehender Pakete zu veraendern.
- **Self-Hosted-tauglich und mandantenkonfigurierbar:** Regelpaket-Zuordnung und Feiertagskalender sind Konfiguration je Mandant und Arbeitszeitmodell - kein Codepfad und kein Branch. Das haelt eine Codebasis fuer beide Betriebsmodelle einheitlich ([ADR-0010](0010-eine-codebasis-zwei-betriebsmodelle.md), Paragraf 2).

## Konsequenzen

### Positiv

- Gesetzesaenderungen (z. B. taegliche -> woechentliche Hoechstarbeitszeit) werden als neues, versioniertes Regelpaket eingepflegt - ohne Code-Umbau und ohne Datenmigration (Paragraf 3.1, Paragraf 10).
- Die historische Bewertung bleibt nachvollziehbar an die jeweils gueltige Regelversion gebunden; vergangene Bewertungen werden nicht still umgeschrieben (Paragraf 3.3).
- Live-Warnung beim Stempeln und Stapelbewertung im Monatsabschluss/Verstossreport beruhen auf derselben Engine und koennen nicht auseinanderlaufen (Paragraf 4, Paragraf 14).
- Deklarative, versionierte Regeln und ihre Versionen fliessen in die generierbare Verfahrensdokumentation ein (Paragraf 9).
- Vollstaendige Property-/Snapshot-Testbarkeit liefert einen reproduzierbaren Korrektheitsnachweis und schuetzt bestehende Regelpakete bei Einfuehrung neuer Versionen.
- Funktioniert in Self-Hosted und Cloud identisch; Regeln und Feiertagskalender sind Konfiguration je Mandant, kein Sonderpfad (Paragraf 2, Paragraf 7).

### Negativ

- **Hoehere Anfangskomplexitaet:** Eine deklarative, versionierte Engine mit Regelauswahl nach Gueltigkeitszeitraum ist aufwendiger zu entwerfen und zu bauen als direkt im Code verdrahtete Pruefungen. Der Nutzen entsteht erst ueber die Zeit (bei Gesetzesaenderungen).
- **Regelpaket-Pflege als laufende Aufgabe:** Neue Gesetzeslagen und Feiertagsaenderungen muessen als Regelpakete modelliert, getestet und mit korrektem Gueltigkeitsbeginn versioniert werden. Das verlagert Arbeit von der Code- auf die Regel-/Datenebene, beseitigt sie aber nicht.
- **Ausdruckskraft vs. Begrenzung:** Eine deklarative Sprache muss maechtig genug fuer reale Faelle (Ausgleichszeitraeume, Tagesgrenzen, modellabhaengige Pausen) und zugleich beschraenkt genug bleiben, um pruefbar und sicher zu sein. Diese Grenze ist bewusst zu ziehen und kann bei seltenen Sonderfaellen an Punkte stossen, die ergaenzende Regelpaket-Typen erfordern.
- **Korrekte Zeitlogik ist anspruchsvoll:** Ruhezeiten ueber Tagesgrenzen, Zeitzonen/Sommerzeit und woechentliche Ausgleichsfenster sind fehleranfaellig und muessen durch Property-Tests systematisch abgesichert werden.

### Neutral

- Das genaue Format der Regelpakete (deklarative Repraesentation und ihr Versionierungsschema) ist eine Implementierungsfrage innerhalb von `packages/domain`, solange Bedingung -> Bewertung/Warnung, Gueltigkeitszeitraum-Referenz und vollstaendige Testbarkeit gewahrt bleiben.
- Ob der Stapellauf rein zeitgesteuert (Monatsabschluss) oder zusaetzlich ereignisgetrieben laeuft, ist eine Betriebsentscheidung; die Anbindung erfolgt entkoppelt ueber Valkey/BullMQ (Paragraf 5).
- Die rechtliche Auslegung der Regeln (z. B. Auspraegung der Wochenlogik nach Verkuendung des Gesetzes) ist fachlich-juristisch und wird in Regelpakete uebersetzt; dieses Dokument trifft keine rechtliche Aussage und ersetzt keine Rechtsberatung.
- Feiertage haengen am Bundesland des Standorts (Paragraf 8); ob der Feiertagskalender als eigenes Regelpaket oder als referenzierte Stammdatenquelle modelliert wird, bleibt eine Implementierungsfrage.

## Betrachtete Alternativen

- **Fest verdrahtete Pruefungen im Anwendungscode (ArbZG-Grenzen direkt als `if`-Logik in den Zeiterfassungs-/Reporting-Modulen)** - Abgelehnt. Jede Gesetzesaenderung wuerde Code-Aenderungen und Releases erfordern, die historische Bewertung waere nicht sauber an eine Regelversion gebunden, und der Umstieg taeglich -> woechentlich (Paragraf 3.1) wuerde genau den Code-Umbau ausloesen, den diese Architektur vermeiden will. Versionierte, nachvollziehbare Bewertung waere nur schwer belegbar (Paragraf 3.3, Paragraf 10).
- **Externe Business-Rules-Management-Engine / Drittanbieter-Rule-Engine** - Abgelehnt. Bringt Betriebs- und Lizenzkomplexitaet, eine weitere Vertrauens- und Versionsgrenze ausserhalb der geteilten Domaenenschicht und erschwert die enge Verzahnung von Live-Warnung und Stapellauf sowie die Property-/Snapshot-Testbarkeit innerhalb des TypeScript-Monorepos (Paragraf 5, Paragraf 17). Der ueberschaubare, domaenenspezifische Regelraum (Hoechstarbeitszeit, Ruhezeit, Pausen, Feiertage, Zuschlaege) rechtfertigt eine generische externe Engine nicht.
- **Konfigurierbare Schwellwerte ohne Versionierung (nur Zahlen je Mandant einstellbar, ohne Gueltigkeitszeitraum und ohne Regelpaket-Historie)** - Abgelehnt. Loest zwar einfache Parameteraenderungen, kann aber strukturelle Aenderungen (taeglich -> woechentlich mit Ausgleichszeitraum) nicht abbilden und verliert die Nachvollziehbarkeit, nach welcher Regel die Vergangenheit bewertet wurde (Paragraf 3.3). Eine Aenderung wuerde die Bewertung der Historie still mitveraendern.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 3.1 - Arbeitszeiterfassungspflicht (bewegliche Rechtslage, Tendenz taeglich -> woechentliche Hoechstarbeitszeit, Architektur-Konsequenz: regelbasiert und versioniert ohne Datenmigration)
- `../ARCHITEKTUR.md` Paragraf 3.2 - ArbZG aktive Pruefungen (Hoechstarbeitszeit, Ruhezeit, Pausen, Sonn-/Feiertagsarbeit, JArbSchG als optionales Regelpaket)
- `../ARCHITEKTUR.md` Paragraf 10 - Regel-/Compliance-Engine (versionierte Regelpakete, deklarative Bewertung, Live- und Stapellauf, Property-/Snapshot-Tests)
- `../ARCHITEKTUR.md` Paragraf 3.3 - GoBD (Unveraenderbarkeit und Nachvollziehbarkeit, Regelversionen in der Verfahrensdokumentation)
- `../ARCHITEKTUR.md` Paragraf 4 - Funktionsumfang (Compliance-Engine, Arbeitszeitmodelle, Verstossreport, Feiertagskalender)
- `../ARCHITEKTUR.md` Paragraf 8 - Datenmodell (`WorkTimeModel` versioniert mit gueltig-ab/gueltig-bis, `TimeEntry` unveraenderlich)
- `../ARCHITEKTUR.md` Paragraf 14 - UI/UX (kontextsensitive Warnungen statt Fehlermeldungen beim Stempeln)
- `../ARCHITEKTUR.md` Paragraf 17 - Repository-Struktur (geteilte Domaenenlogik in `packages/domain`)
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md) - mandantenkonfigurierbare Regeln, aktive RLS in beiden Betriebsmodellen
- [ADR-0006: Audit-Ledger: append-only, hash-verkettet](0006-audit-ledger-append-only.md) - lohn-/sicherheitsrelevante Folgeaktionen erzeugen ein `AuditEvent`
- [ADR-0010: Eine Codebasis, zwei Betriebsmodelle](0010-eine-codebasis-zwei-betriebsmodelle.md) - identische Engine in Self-Hosted und Cloud, Regeln als Konfiguration
