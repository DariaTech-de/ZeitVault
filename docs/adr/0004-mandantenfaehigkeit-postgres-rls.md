# ADR-0004: Mandantenfaehigkeit via Postgres RLS

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault wird aus **einer einzigen Codebasis** in zwei Betriebsmodellen ausgeliefert: selbst gehostet (eine Organisation pro Installation) und als Cloud/SaaS (mehrere Organisationen mandantengetrennt). Mandantenfaehigkeit ist damit kein nachtraegliches SaaS-Feature, sondern von Tag 1 im Datenmodell verankert (Paragraf 1, Paragraf 2).

Daraus ergeben sich mehrere Kraefte und Spannungsfelder:

- **Harte Isolationsanforderung:** Ein versehentlicher Cross-Tenant-Zugriff (Mitarbeiterzeiten, Lohn-/Personendaten eines fremden Mandanten) ist in einer Beschaeftigtendaten-Anwendung ein schwerwiegender Datenschutz- und Vertrauensbruch (DSGVO/BDSG, Paragraf 12). Die Isolation muss auch dann halten, wenn eine Anwendungsschicht einen Filter vergisst oder einen Bug enthaelt.
- **Eine Codebasis, zwei Betriebsmodelle:** Self-Hosted und Cloud nutzen identische Container-Images; Unterschiede werden ausschliesslich ueber Konfiguration gesteuert, nie ueber getrennte Code-Branches (Paragraf 2). Der Tenancy-Mechanismus muss in beiden Modellen identisch funktionieren.
- **Unterschiedliche Kundenanforderungen:** Fuer besonders regulierte oder sehr grosse Kunden kann eine staerkere physische Trennung (eigene Datenbank/eigenes Schema) gefordert sein, ohne dass dafuer ein zweiter Code-Pfad entsteht (Paragraf 7).
- **Datenmodell:** Alle Kern-Entitaeten fuehren bereits `tenant_id` (Paragraf 8). Der Mechanismus muss generisch ueber alle Tabellen wirken, nicht pro Abfrage einzeln.
- **PostgreSQL ist gesetzt** (Paragraf 5) und bietet mit Row-Level Security (RLS) ein DB-natives Mittel zur Mandantentrennung.

Diese ADR legt fest, wie Mandantentrennung technisch erzwungen wird. Paragraf 7 beschreibt das Ziel (pooled Multi-Tenancy via RLS, optional dedizierte DB/Schema); diese ADR macht es verbindlich und benennt die Konsequenzen.

## Entscheidung

Wir setzen Mandantenfaehigkeit als **pooled Multi-Tenancy mit PostgreSQL Row-Level Security (RLS)** um.

Verbindliche Regeln:

- **`tenant_id` ueberall:** Jede mandantenbezogene Tabelle fuehrt eine Spalte `tenant_id` (Paragraf 8).
- **RLS erzwingt Isolation auf DB-Ebene:** Fuer jede dieser Tabellen sind RLS-Policies aktiv, die Zeilen ausschliesslich fuer den aktuellen Tenant-Kontext sichtbar und schreibbar machen. Die Isolation greift in der Datenbank, nicht (nur) in der Anwendung.
- **Tenant-Kontext aus dem Auth-Token:** Der gueltige Tenant wird aus dem Auth-Token abgeleitet (OIDC/SAML via Keycloak, Paragraf 5/Paragraf 11) und **je Request** ueber `SET LOCAL` auf die Transaktion gesetzt, auf die sich die RLS-Policies beziehen.
- **Kein Request ohne Tenant-Kontext:** Es gibt keinen Datenzugriff ohne gueltig gesetzten Tenant-Kontext. Fehlt der Kontext, wird die Anfrage abgewiesen, nicht etwa ungefiltert ausgefuehrt.
- **Self-Hosted = `tenant_id = 'default'`:** Im Self-Hosted-Betrieb existiert genau ein Mandant (`default`); RLS bleibt dennoch aktiv. Das haelt den Code in beiden Betriebsmodellen identisch.
- **Optionale dedizierte DB/Schema:** Fuer besonders regulierte oder sehr grosse Kunden ist eine dedizierte Datenbank bzw. ein dediziertes Schema moeglich. Das ist **gleicher Code, andere Connection-Strategie** - kein zweiter Anwendungspfad.

## Begruendung

- **Schutz auch bei App-Bug (ausschlaggebend):** RLS verlagert die Mandantentrennung in die Datenbank. Selbst wenn die Anwendungsschicht einen `tenant_id`-Filter vergisst oder fehlerhaft baut, gibt die Datenbank keine fremden Zeilen heraus. Diese zusaetzliche, von der Anwendungslogik unabhaengige Schutzschicht (Defense in Depth) ist bei lohn- und personenbezogenen Daten der entscheidende Vorteil gegenueber reiner App-Layer-Filterung.
- **Konsistenz ueber beide Betriebsmodelle:** Derselbe Mechanismus laeuft in Cloud und Self-Hosted. Self-Hosted als `tenant_id = 'default'` mit aktivem RLS kostet praktisch nichts und vermeidet einen abweichenden Single-Tenant-Code-Pfad (Paragraf 2).
- **Skalierbarkeit der Trennstaerke ohne Code-Aenderung:** Pooled RLS als Standard; fuer einzelne Kunden eine dedizierte DB/Schema als Option. Da sich nur die Connection-Strategie aendert, bleibt eine Codebasis erhalten (Paragraf 7).
- **DB-native Faehigkeit:** RLS ist ein Kernfeature von PostgreSQL 18 (Paragraf 5) und einer der Gruende fuer die ORM-Wahl, die Postgres-native Features bewusst nutzbar machen soll (siehe [ADR-0005](0005-orm-drizzle.md)).

## Konsequenzen

### Positiv

- Mandantentrennung haelt auch bei einem Bug in der Anwendungsschicht; das Risiko eines Cross-Tenant-Datenlecks sinkt erheblich (Defense in Depth, Paragraf 11/Paragraf 12).
- Ein einziger Tenancy-Mechanismus fuer Cloud und Self-Hosted; kein Single-Tenant-Sonderpfad (Paragraf 2).
- Hoehere Trennstaerke fuer regulierte/grosse Kunden ist ohne Code-Verzweigung erreichbar (nur Connection-Strategie).
- Erfuellt Kern-Invariante 3 (jede Tabelle fuehrt `tenant_id`; RLS erzwingt Trennung; kein Request ohne gueltigen Tenant-Kontext).

### Negativ

- **Jede Query braucht Kontext:** Vor jedem Datenzugriff muss der Tenant-Kontext je Request via `SET LOCAL` korrekt gesetzt sein. Das verlangt eine zuverlaessige, zentrale Stelle (z. B. Request-/Transaktions-Middleware), die den Kontext aus dem Auth-Token ableitet und setzt, sowie ein hartes Abweisen bei fehlendem Kontext.
- **Test-Strategie fuer RLS noetig:** Die Korrektheit der Policies muss eigens abgesichert werden - Tests, die belegen, dass ohne Kontext nichts sichtbar ist, dass ein Tenant keine fremden Zeilen liest/schreibt und dass jede neue Tabelle RLS aktiviert hat. RLS-Luecken sind sonst leicht zu uebersehen.
- Der Anwendungs-DB-User darf RLS nicht umgehen (kein `BYPASSRLS`); Grants und Rollen muessen entsprechend eingeschraenkt sein.

### Neutral

- Die optionale dedizierte DB/Schema-Variante erfordert eine konfigurierbare Connection-Strategie (Routing pro Mandant), aendert aber das Datenmodell und die Policies nicht.
- Verbindungspooling muss mit `SET LOCAL` zusammenpassen (transaktionsgebundener Kontext), damit kein Tenant-Kontext ueber Verbindungen hinweg ausleckt; dies ist eine Implementierungs-Randbedingung des Pooling-Setups.
- Migrationen muessen die RLS-Aktivierung und Policies pro Tabelle mitfuehren; das wird ueber das ORM/Migrations-Werkzeug abgebildet ([ADR-0005](0005-orm-drizzle.md)).

## Betrachtete Alternativen

- **Reine App-Layer-Filterung (nur `WHERE tenant_id = ...` in der Anwendung)** - Abgelehnt. Fehleranfaellig: Die Isolation haengt davon ab, dass jede einzelne Abfrage den Filter korrekt setzt. Ein einziger vergessener oder falscher Filter fuehrt zu Cross-Tenant-Zugriff, ohne dass die Datenbank schuetzt. Bei lohn-/personenbezogenen Daten ist dieses Restrisiko nicht akzeptabel. RLS dient hier als verbindliche, von der App unabhaengige Durchsetzung.
- **Datenbank-pro-Mandant als Default** - Abgelehnt als Standard, behalten als Option. Eine eigene Datenbank je Mandant bietet zwar starke physische Trennung, verursacht aber erheblichen Betriebsaufwand (Provisionierung, Migrationen ueber n Datenbanken, Backups, Monitoring, Connection-Verwaltung), der mit der Mandantenzahl waechst. Als Default ist das fuer pooled SaaS unwirtschaftlich. Fuer besonders regulierte oder sehr grosse Kunden bleibt die dedizierte DB/Schema-Variante eine bewusste Option bei identischem Code (Paragraf 7).

## Verweise

- `../ARCHITEKTUR.md` Paragraf 7 - Mandantenfaehigkeit (pooled Multi-Tenancy via RLS, Tenant-Kontext aus Auth-Token, optional dedizierte DB/Schema, Self-Hosted = `default`)
- `../ARCHITEKTUR.md` Paragraf 8 - Datenmodell (alle Kern-Entitaeten fuehren `tenant_id`)
- `../ARCHITEKTUR.md` Paragraf 2 - Betriebsmodelle (eine Codebasis, Konfiguration statt Code-Branches)
- `../ARCHITEKTUR.md` Paragraf 11 / Paragraf 12 - Sicherheits- und Datenschutzarchitektur (Isolation, Beschaeftigtendatenschutz)
- [ADR-0005: ORM-Wahl: Drizzle](0005-orm-drizzle.md) - Postgres-native Features (RLS, eingeschraenkte Grants) und Migrationen
