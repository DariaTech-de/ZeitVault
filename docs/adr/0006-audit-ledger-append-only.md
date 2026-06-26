# ADR-0006: Audit-Ledger: append-only, hash-verkettet

**Status:** Akzeptiert - 2026-06-26

## Kontext

Zeitdaten in ZeitVault sind lohn- und damit steuerrelevant; daraus folgt eine harte GoBD-Anforderung an Unveraenderbarkeit und Nachvollziehbarkeit: kein nachtraegliches stilles Ueberschreiben, jede Aenderung muss als nachvollziehbarer, begruendeter Vorgang mit Zeitstempel, Urheber und Vorgaengerbezug protokolliert sein (Paragraf 3.3). Die Revisionssicherheit ist eines der Leitprinzipien des Produkts (Paragraf 1).

Daraus ergeben sich mehrere Kraefte und Spannungsfelder:

- **Vertrauensanker statt Beiwerk:** Der Audit-Trail ist nicht nur ein Log, sondern der Vertrauensanker des Systems. Er muss belegen koennen, dass lohn-/sicherheitsrelevante Aktionen (Erfassung, Korrektur, Genehmigung, Export, Rechteaenderung) vollstaendig und unveraendert aufgezeichnet wurden (Paragraf 9).
- **Manipulation muss evident werden:** Es reicht nicht, Manipulation organisatorisch zu verbieten. Eine nachtraegliche Aenderung oder Loeschung von Audit-Daten muss technisch sofort erkennbar sein - auch gegenueber einem Innentaeter mit Datenbankzugriff.
- **Vertrauensgrenze gegenueber der Anwendung:** Der modulare Monolith (Backend, NestJS) und der Audit-Trail haben unterschiedliche Vertrauensniveaus. Wenn dieselbe Anwendung mit denselben Rechten Fachdaten schreibt und ihren eigenen Audit-Trail veraendern koennte, ist der Trail wertlos. Es braucht eine harte Grenze, nicht nur eine Modulgrenze (Paragraf 6).
- **Durchsatz:** Jede protokollpflichtige Aktion erzeugt ein `AuditEvent`. Der Ledger muss diesen Schreibstrom zuverlaessig und ohne Datenverlust aufnehmen, darf aber die Fachpfade nicht blockieren.
- **Beide Betriebsmodelle:** Die Loesung muss in Self-Hosted (ein Mandant `default`) wie in Cloud/SaaS identisch funktionieren und mit dem vorhandenen Objektspeicher (WORM-faehige S3-/SeaweedFS-/MinIO-Ablage) zusammenarbeiten (Paragraf 2, Paragraf 5).

Die Architektur sieht den Audit-/Ledger-Dienst bereits als von Anfang an getrennten Dienst vor (Paragraf 6) und beschreibt das Ziel in Paragraf 9 (append-only, hash-verkettet, periodische Versiegelung, Trennung der Schreibrechte). Diese ADR macht diese Festlegung verbindlich und benennt die Konsequenzen.

## Entscheidung

Wir fuehren das Audit-Ledger als **von Anfang an getrennten Dienst** mit harter Vertrauensgrenze ein.

Verbindliche Regeln:

- **Getrennter Dienst:** Der Ledger ist ein eigenstaendiger Dienst (eigener NestJS-Service unter `apps/ledger`), nicht ein Modul des Anwendungs-Monolithen. Bei Bedarf an hohem Durchsatz ist eine Implementierung in Go zulaessig; die Schnittstelle und die Invarianten bleiben dieselben.
- **Append-only:** Jede lohn-/sicherheitsrelevante Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteaenderung) erzeugt ein unveraenderliches `AuditEvent`. `AuditEvent`-Datensaetze werden ausschliesslich angefuegt, nie veraendert oder geloescht.
- **Hash-Verkettung:** Jedes `AuditEvent` enthaelt den Hash seines Vorgaengers (`prev_hash`) und bildet damit eine fortlaufende, manipulationsevidente Kette. Ein nachtraegliches Aendern oder Loeschen eines Events bricht die Kette und wird beim Nachrechnen sofort erkennbar.
- **Periodische Versiegelung:** In regelmaessigen Abstaenden wird ein Anker erzeugt - ein signierter Tages-Hash - und in eine WORM-S3-Ablage geschrieben. Optional wird zusaetzlich ein qualifizierter Zeitstempel eingeholt. Damit ist der Stand der Kette zu einem Zeitpunkt extern festgenagelt.
- **Trennung der Schreibrechte:** Der Anwendungs-DB-User darf `AuditEvent`-Daten nur per `INSERT` anfuegen, nicht per `UPDATE` oder `DELETE` aendern. Dies wird ueber einen separaten Service-Account und/oder separaten Speicher durchgesetzt - die schreibende Anwendung besitzt keine Rechte, ihren eigenen Audit-Trail zu veraendern.
- **Beide Betriebsmodelle identisch:** Der Mechanismus laeuft in Self-Hosted (`tenant_id = 'default'`) wie in Cloud/SaaS gleich; jedes `AuditEvent` fuehrt `tenant_id`, RLS bleibt aktiv ([ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).

Dies ist die technische Umsetzung von **Kern-Invariante 2**: Jede lohn-/sicherheitsrelevante Aktion (Erfassung, Korrektur, Genehmigung, Export, Rechteaenderung) erzeugt ein unveraenderliches `AuditEvent` im getrennten, append-only, hash-verketteten Audit-Ledger.

## Begruendung

- **Harte Vertrauensgrenze fuer Revisionssicherheit (ausschlaggebend):** GoBD verlangt Unveraenderbarkeit und Nachvollziehbarkeit (Paragraf 3.3). Ein getrennter Dienst mit eingeschraenkten Schreibrechten trennt die Faehigkeit, Fachdaten zu schreiben, von der Faehigkeit, den Audit-Trail zu veraendern. Genau diese Trennung macht den Trail glaubwuerdig - er ist nicht von derselben Instanz manipulierbar, die er protokolliert.
- **Manipulation wird sofort evident:** Die Hash-Verkettung (`prev_hash`) plus periodische, extern versiegelte Anker (signierter Tages-Hash in WORM-Ablage, optional qualifizierter Zeitstempel) sorgen dafuer, dass jede nachtraegliche Aenderung oder Luecke beim Nachrechnen auffaellt. Das verlagert den Schutz von "darf nicht" zu "faellt auf" und ist Revisionssicherheit im Sinne der Betriebspruefung.
- **Append-only + eingeschraenkte Grants als doppelte Durchsetzung:** `INSERT`-only auf DB-Ebene (separater Service-Account, kein `UPDATE`/`DELETE`) ergaenzt die kryptografische Verkettung. Selbst ein fehlerhafter oder boeswilliger Schreibversuch findet keinen Weg, bestehende Events zu veraendern. Das nutzt bewusst Postgres-native eingeschraenkte Grants und append-only-Durchsetzung (einer der Gruende fuer die ORM-Wahl, [ADR-0005](0005-orm-drizzle.md)).
- **Getrennt von Tag 1, nicht nachgeruestet:** Eine Vertrauensgrenze laesst sich nicht glaubwuerdig nachtraeglich einziehen. Der Ledger ist daher von Anfang an ein eigener Dienst (Paragraf 6), auch wenn das uebrige Backend ein modularer Monolith bleibt.
- **Durchsatz-Option ohne Invarianten-Bruch:** Der Standard ist NestJS (eine Codebasis-Sprache, geteilte Typen). Falls der Schreibstrom es erfordert, ist Go als Implementierung zulaessig, ohne dass sich die fachlichen Invarianten (append-only, Verkettung, Versiegelung, getrennte Rechte) aendern.

## Konsequenzen

### Positiv

- Manipulation am Audit-Trail wird technisch evident statt nur organisatorisch verboten; die Kette plus versiegelte Anker belegen Vollstaendigkeit und Unveraendertheit gegenueber einer Betriebspruefung (Paragraf 3.3, Paragraf 9).
- Erfuellt Kern-Invariante 2 (unveraenderliches `AuditEvent` je lohn-/sicherheitsrelevanter Aktion im getrennten, append-only, hash-verketteten Ledger).
- Die schreibende Anwendung kann ihren eigenen Audit-Trail nicht veraendern; selbst bei kompromittiertem Anwendungs-DB-User bleiben bestehende Events geschuetzt (Defense in Depth, Paragraf 11).
- Liefert die Datenbasis fuer die generierbare Verfahrensdokumentation und den GoBD-Pruefexport (Paragraf 3.3, Paragraf 9).
- Funktioniert in Self-Hosted und Cloud identisch; keine Sonderpfade (Paragraf 2).

### Negativ

- **Zusaetzlicher Dienst im Betrieb:** Der Ledger ist eine eigene Komponente mit eigenem Service-Account, eigenem Deployment, eigener Ueberwachung und eigener Backup-/Restore-Betrachtung - mehr Betriebsaufwand als eine In-App-Tabelle.
- **Schluessel- und WORM-Verwaltung noetig:** Die Signatur des Tages-Hashs braucht ein verwaltetes Schluesselmaterial (KMS/OpenBao, Paragraf 11), die WORM-Ablage muss korrekt konfiguriert und unveraenderlich gehalten werden. Der optionale qualifizierte Zeitstempel erfordert einen externen, vertrauenswuerdigen Dienst.
- **Verifikation muss gebaut und getestet werden:** Das Nachrechnen der Kette und das Pruefen der Anker sind eigene Funktionen, deren Korrektheit eigens abgesichert werden muss (z. B. Tests, die einen gebrochenen `prev_hash` oder eine fehlende Sequenz zuverlaessig erkennen). Ohne diese Verifikation bleibt die Kette nur ein Versprechen.
- **Grant-Disziplin:** Die `INSERT`-only-Beschraenkung (kein `UPDATE`/`DELETE`, kein `BYPASSRLS`) muss in Migrationen und Rollen konsequent durchgehalten werden; ein Fehler hier untergraebt die Vertrauensgrenze.

### Neutral

- Die Wahl der Ledger-Implementierung (NestJS als Standard, optional Go bei hohem Durchsatz) ist eine spaetere, durch Messung getriebene Entscheidung; die Schnittstelle und die Invarianten bleiben davon unberuehrt.
- Versiegelungsintervall (z. B. taeglich) und der Einsatz des optionalen qualifizierten Zeitstempels sind je Mandant/Betriebsmodell konfigurierbar und gehoeren in die Verfahrensdokumentation.
- Das Anwendungs-Backend uebergibt Events an den Ledger; ob synchron oder asynchron (entkoppelt ueber Valkey/BullMQ) angebunden wird, ist eine Implementierungsfrage, solange kein Event verloren geht und die Reihenfolge der Kette gewahrt bleibt.

## Betrachtete Alternativen

- **In-App-Audit-Tabelle ohne Trennung (Audit-Log als gewoehnliche Tabelle im Anwendungs-Monolithen, gleicher DB-User)** - Abgelehnt. Schwaecher: Dieselbe Anwendung mit denselben Rechten, die Fachdaten schreibt, koennte ihren eigenen Audit-Trail aendern oder loeschen. Damit fehlt die harte Vertrauensgrenze, und Manipulation bliebe nicht zwangslaeufig evident. Fuer einen GoBD-Vertrauensanker reicht das nicht (Paragraf 3.3, Paragraf 9).
- **Externe Blockchain / verteiltes Ledger** - Abgelehnt. Overkill: Eine oeffentliche oder konsensbasierte Blockchain bringt Betriebskomplexitaet, Latenz, Kosten und teils Drittlandfragen mit sich, ohne fuer dieses Problem einen Mehrwert ueber die hash-verkettete, periodisch extern versiegelte Loesung hinaus zu liefern. Die geforderte Manipulationsevidenz wird durch Hash-Kette plus signierten Anker in WORM-Ablage (optional qualifizierter Zeitstempel) bereits erreicht - bei deutlich geringerem Aufwand und besserer Datenhoheit (Paragraf 2, Paragraf 12).

## Verweise

- `../ARCHITEKTUR.md` Paragraf 6 - Systemarchitektur (Audit-/Ledger-Dienst von Anfang an getrennt, harte Vertrauensgrenze)
- `../ARCHITEKTUR.md` Paragraf 9 - Revisionssicherheit & Audit (append-only, Hash-Verkettung `prev_hash`, periodische Versiegelung, Trennung der Schreibrechte, Verfahrensdokumentation)
- `../ARCHITEKTUR.md` Paragraf 3.3 - GoBD (Unveraenderbarkeit, Nachvollziehbarkeit, Aufbewahrung)
- `../ARCHITEKTUR.md` Paragraf 8 - Datenmodell (`AuditEvent` im separaten Ledger)
- `../ARCHITEKTUR.md` Paragraf 11 - Sicherheitsarchitektur (Schluesselverwaltung KMS/OpenBao, Defense in Depth)
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md) - `tenant_id` und aktive RLS auch fuer den Ledger
- [ADR-0005: ORM-Wahl: Drizzle](0005-orm-drizzle.md) - Postgres-native append-only-Trigger und eingeschraenkte Grants
- [ADR-0010: Eine Codebasis, zwei Betriebsmodelle](0010-eine-codebasis-zwei-betriebsmodelle.md) - identischer Mechanismus in Self-Hosted und Cloud
