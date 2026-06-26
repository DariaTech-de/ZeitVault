# ADR-0008: Auth via Keycloak (OIDC/SAML)

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault braucht ein zentrales Identity- und Access-Management (IdM), das Authentifizierung und Autorisierung fuer Web, Mobile, Terminal/Kiosk und API liefert. Aus den Anforderungen des Projekts (Paragraf 1, Paragraf 5, Paragraf 11) ergeben sich mehrere Kraefte und Spannungsfelder:

- **Self-Hosted-Faehigkeit ist nicht verhandelbar:** Zielkunden im On-Premises-Betrieb sind datensensible Betriebe, Behoerden, Kanzleien und Praxen mit vollstaendiger Datenhoheit (Paragraf 2). Ein IdM, das nur als SaaS verfuegbar ist, scheidet damit aus - der Identity-Provider muss im Kunden-Rechenzentrum lauffaehig sein, aus demselben Container-Satz wie die uebrige Anwendung (Paragraf 16).
- **Enterprise-SSO ist Kaufkriterium:** Enterprise- und Behoerdenkunden erwarten Anbindung an bestehende Identitaetsquellen (Active Directory/LDAP, bestehende SAML- oder OIDC-Foederationen). Single Sign-On ueber die etablierten Standards **OIDC** und **SAML** ist Voraussetzung, nicht Kuer.
- **Hohe Sicherheitsanforderungen an Identitaet und Zugriff:** Die Sicherheitsarchitektur fordert OIDC/SAML, **MFA-Pflicht fuer Admins**, **RBAC + ABAC** (Standort/Abteilung) und das Prinzip der minimalen Rechte (Paragraf 11). Moderne starke Authentifizierung (MFA, Passkeys/WebAuthn) muss unterstuetzt werden.
- **Tenant-Kontext kommt aus dem Token:** Die Mandantentrennung haengt direkt am IdM. Der gueltige Tenant-Kontext wird aus dem Auth-Token abgeleitet und je Request gesetzt; kein Request ohne gueltigen Tenant-Kontext (Paragraf 7, Kern-Invariante 3). Der Identity-Provider muss `tenant_id` zuverlaessig und manipulationssicher in das Token ausstellen.
- **Update- und Lizenz-Sicherheit:** Die Versionsstrategie verlangt LTS-faehige, sauber aktualisierbare Bausteine und entkoppelt schnelldrehende oder austauschbare Teile ueber Standards statt ueber Implementierungen (Paragraf 5.1, Punkt 7). Ein IdM mit Zero-Downtime-Updates und stabilem, standardisiertem Integrationspunkt reduziert das Update-Risiko.
- **Zwei Betriebsmodelle, ein Code:** Cloud/SaaS (mehrere Mandanten) und Self-Hosted (`tenant_id = 'default'`) nutzen identische Images; Unterschiede nur ueber Konfiguration (Paragraf 2). Das IdM und seine Anbindung muessen in beiden Modellen identisch funktionieren.

Diese ADR legt fest, welches IdM verwendet wird und - mindestens ebenso wichtig - **wie die Anwendung daran haengt**. Paragraf 5 nennt Keycloak 26.6 als gesetzten Baustein; diese ADR macht die Wahl und die Entkopplung ueber den OIDC-Standard verbindlich.

## Entscheidung

Wir verwenden **Keycloak 26.6** als zentrales Identity- und Access-Management. Die Anwendung integriert ueber die offenen Standards **OIDC** (primaer, fuer alle eigenen Clients) und **SAML** (fuer Enterprise-Foederation), nicht ueber Keycloak-spezifische Schnittstellen.

Verbindliche Regeln:

- **Standard-basierte Anbindung, keine Implementierungs-Bindung:** Die Anwendung haengt an einem **Auth-Adapter**, der ausschliesslich gegen den OIDC-Standard spricht (Token-Ausstellung, Token-Validierung ueber die veroeffentlichten Schluessel/JWKS, Standard-Claims, Logout). Keycloak ist die gewaehlte Implementierung hinter diesem Standard und damit **austauschbar**, ohne den Anwendungscode zu aendern (Paragraf 6, Auth-Adapter).
- **OIDC primaer, SAML fuer Foederation:** Eigene Clients (Web, Mobile, Terminal, API) authentifizieren ueber OIDC. SAML dient der Anbindung bestehender Enterprise-/Behoerden-Identitaetsquellen, wo diese SAML voraussetzen.
- **MFA und Passkeys:** Starke Authentifizierung wird unterstuetzt (MFA, Passkeys/WebAuthn).
- **MFA-Pflicht fuer Admins:** Fuer administrative Rollen ist MFA verbindlich erzwungen (Paragraf 11).
- **RBAC + ABAC:** Autorisierung erfolgt rollenbasiert (RBAC) und attributbasiert (ABAC) entlang Standort und Abteilung (Paragraf 8, Paragraf 11). Die dafuer noetigen Attribute werden als Claims im Token gefuehrt.
- **Tenant-Kontext im Token:** Der Identity-Provider stellt den gueltigen Tenant (`tenant_id`) als Claim aus. Der Auth-Adapter leitet daraus je Request den Tenant-Kontext ab; ohne gueltigen Tenant-Kontext wird die Anfrage abgewiesen (Kern-Invariante 3, [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).
- **Self-hostbar, identisch in beiden Betriebsmodellen:** Keycloak laeuft als Teil des Container-Satzes sowohl im Self-Hosted-Compose-Setup als auch im Cloud-Betrieb (Paragraf 16). Self-Hosted = ein Realm/Mandant (`default`); die Anbindung bleibt identisch.

## Begruendung

- **On-Prem-Faehigkeit (ausschlaggebend):** Keycloak ist vollstaendig selbst hostbar und Teil des ausgelieferten Container-Satzes. Damit erfuellt es die harte Anforderung der Self-Hosted-Kunden nach voller Datenhoheit, ohne externe Identitaets-Cloud (Paragraf 2). Ein SaaS-only-IdM koennte das On-Premises-Modell gar nicht bedienen.
- **Enterprise-SSO ueber Standards:** Keycloak unterstuetzt OIDC und SAML sowie Brokering/Foederation zu Active Directory/LDAP und externen IdPs. Damit ist die Anbindung an bestehende Unternehmens- und Behoerdenidentitaeten ohne Eigenbau moeglich (Paragraf 11).
- **Starke Authentifizierung out of the box:** MFA und Passkeys/WebAuthn sind Bordmittel; die MFA-Pflicht fuer Admins laesst sich serverseitig erzwingen statt im Anwendungscode nachzubauen (Paragraf 11).
- **Austauschbarkeit durch Standard-Bindung:** Weil die Anwendung nur gegen OIDC spricht (Auth-Adapter, Paragraf 6), ist Keycloak eine Implementierungswahl, kein Lock-in. Das deckt sich mit der Architekturregel, austauschbare Komponenten an Standards statt an eine Implementierung zu binden (Paragraf 5.1, Punkt 7) - dieselbe Logik wie bei Secrets ueber die Vault-API ([ADR-0007](0007-osi-permissive-bausteine.md)).
- **Update-Sicherheit:** Keycloak 26.6 bietet Zero-Downtime-Updates und OpenTelemetry-Integration und passt damit zur kontrollierten Update-Strategie (Paragraf 5, Paragraf 5.1).
- **Konsistenz ueber beide Betriebsmodelle:** Derselbe IdM, dieselbe Anbindung in Cloud und Self-Hosted; der Tenant-Kontext kommt in beiden Faellen aus dem Token (Paragraf 2, Paragraf 7).

## Konsequenzen

### Positiv

- Vollstaendig self-hostbares IdM erfuellt die On-Premises-Anforderung ohne externe Abhaengigkeit (Paragraf 2).
- Enterprise-SSO und Foederation (OIDC/SAML, AD/LDAP) stehen ohne Eigenbau bereit; senkt Eintrittshuerde bei Enterprise-/Behoerdenkunden (Paragraf 11).
- MFA/Passkeys und die erzwungene MFA-Pflicht fuer Admins werden zentral und serverseitig durchgesetzt, nicht je Client nachgebaut (Paragraf 11).
- Durch die reine OIDC-Bindung bleibt der Identity-Provider austauschbar; kein Implementierungs-Lock-in (Paragraf 6, Paragraf 5.1).
- Der Tenant-Kontext stammt aus einem signierten Token und ist die Grundlage fuer die RLS-Durchsetzung (Kern-Invariante 3, [ADR-0004](0004-mandantenfaehigkeit-postgres-rls.md)).

### Negativ

- **Zusaetzliche Betriebskomponente:** Keycloak ist ein eigener Dienst mit eigener Datenhaltung, der mitbetrieben, aktualisiert, gesichert und ueberwacht werden muss - auch in jeder kleinen Self-Hosted-Installation (Paragraf 16). Das erhoeht Footprint und Betriebsaufwand.
- **Korrekte OIDC-/SAML-Konfiguration ist sicherheitskritisch:** Realm-, Client-, Mapper- und Foederations-Konfiguration (insbesondere die Ausstellung von `tenant_id`- und ABAC-Claims sowie die Token-Lebensdauern) muss sorgfaeltig und reproduzierbar erfolgen. Fehler hier wirken direkt auf Mandantentrennung und Zugriffsschutz.
- **Tenant-/Claim-Modell muss sauber abgebildet werden:** Die Zuordnung von Realm(s)/Gruppen/Rollen zu `tenant_id`, Standort und Abteilung erfordert ein durchdachtes, konsistent gepflegtes Mapping. ABAC-Attribute muessen verlaesslich und manipulationssicher in den Token gelangen.

### Neutral

- Keycloak wird ueber Konfiguration (Realm-Export/-Import bzw. deklarative Provisionierung) reproduzierbar aufgesetzt; die konkrete Provisionierungsmethode ist eine Implementierungsentscheidung im Infra-Setup (Paragraf 16).
- Der Auth-Adapter validiert Tokens gegen die veroeffentlichten Signaturschluessel (JWKS) des IdP; Schlusselrotation und Discovery folgen dem OIDC-Standard.
- Self-Hosted nutzt einen Realm/Mandanten (`default`); das aendert die Anbindung nicht, nur die Anzahl der Mandanten (Paragraf 2, Paragraf 7).
- Die Wahl von Keycloak praejudiziert nicht die separate KMS-/HSM-Entscheidung fuer Schluessel-Wrapping; diese ist davon getrennt zu treffen (Paragraf 19).

## Betrachtete Alternativen

- **Auth0 / Okta** - Abgelehnt. Beide sind primaer SaaS-Identitaets-Cloud-Angebote. Sie verursachen einen SaaS-Lock-in und sind fuer das On-Premises-Betriebsmodell nicht vollwertig selbst hostbar; damit koennen sie die zentrale Datenhoheits-Anforderung der Self-Hosted-Zielkunden nicht erfuellen (Paragraf 2). Ein IdM, das im Kunden-Rechenzentrum nicht lauffaehig ist, scheidet als Standard fuer ZeitVault aus.
- **Authentik** - Erwogen. Self-hostbar und standardbasiert (OIDC/SAML). Keycloak wurde wegen seiner breiteren Verbreitung im Enterprise-/Behoerdenumfeld, der ausgereiften Foederations-/Brokering-Faehigkeiten und der Zero-Downtime-Update-Eigenschaften (Paragraf 5) bevorzugt. Da die Anwendung nur an OIDC haengt, bliebe ein spaeterer Wechsel ohne Anwendungsaenderung moeglich (Paragraf 6).
- **Zitadel** - Erwogen. Ebenfalls self-hostbar und standardbasiert. Aus denselben Gruenden wie bei Authentik wurde Keycloak gewaehlt; die Standard-Bindung haelt einen Wechsel offen.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 5 - Technologie-Stack (Keycloak 26.6: OIDC + SAML, MFA/Passkeys, OpenTelemetry, Zero-Downtime-Updates, selbst hostbar)
- `../ARCHITEKTUR.md` Paragraf 11 - Sicherheitsarchitektur (OIDC/SAML via Keycloak, MFA-Pflicht fuer Admins, RBAC + ABAC nach Standort/Abteilung, minimale Rechte)
- `../ARCHITEKTUR.md` Paragraf 7 - Mandantenfaehigkeit (Tenant-Kontext aus dem Auth-Token, kein Request ohne gueltigen Tenant-Kontext) - Kern-Invariante 3
- `../ARCHITEKTUR.md` Paragraf 2 - Betriebsmodelle (eine Codebasis, Self-Hosted im eigenen Rechenzentrum, Konfiguration statt Code-Branches)
- `../ARCHITEKTUR.md` Paragraf 6 - Systemarchitektur (Auth-Adapter, OIDC/SAML via Keycloak)
- `../ARCHITEKTUR.md` Paragraf 5.1 - Versionsstrategie (austauschbare Komponenten an Standards statt Implementierung binden)
- `../ARCHITEKTUR.md` Paragraf 16 - Infrastruktur (Keycloak als Teil des Container-Satzes, Self-Hosted-Compose)
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md) - Tenant-Kontext aus dem Token als Grundlage der RLS-Durchsetzung
- [ADR-0007: OSI-/permissive Bausteine](0007-osi-permissive-bausteine.md) - gleiches Prinzip: Bindung an einen Standard (Vault-API) statt an eine Implementierung
- [ADR-0010: Eine Codebasis, zwei Betriebsmodelle](0010-eine-codebasis-zwei-betriebsmodelle.md) - identische Anbindung in Cloud und Self-Hosted
