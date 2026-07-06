# ADR-0012: Passkey-/WebAuthn-Login (passwortlos) ueber Keycloak

**Status:** Akzeptiert - 2026-07-06

## Kontext

Die Anmeldung soll zusaetzlich zum Passwort ueber **Passkeys** moeglich sein.
Passkeys sind FIDO2-/WebAuthn-Anmeldedaten (discoverable credentials), die als
kryptografisches Schluesselpaar auf dem Geraet (Plattform-Authenticator wie
Windows Hello, Touch ID/Face ID, Android) oder auf einem Sicherheitsschluessel
liegen. Der private Schluessel verlaesst das Geraet nie; der Server speichert nur
den oeffentlichen Schluessel. Daraus ergeben sich mehrere Kraefte:

- **Sicherheit an erster Stelle (Paragraf 11):** Phishing- und
  Credential-Stuffing-Resistenz ist ein zentrales Ziel. Passkeys sind an den
  Ursprung (Relying-Party-ID) gebunden und damit strukturell
  phishing-resistent - ein wesentlicher Vorteil gegenueber Passwort + TOTP.
- **Standard statt Eigenbau:** [ADR-0008](0008-auth-keycloak-oidc-saml.md) legt
  fest, dass Authentifizierung ausschliesslich ueber das IdM (Keycloak, OIDC)
  laeuft und die Anwendung nur gegen den OIDC-Standard spricht. WebAuthn muss
  daher **im IdM** konfiguriert werden, nicht im Anwendungscode. Der
  Anwendungscode (Web/Mobile) bleibt unveraendert: er startet weiterhin den
  Authorization-Code-Flow mit PKCE und erhaelt dieselben Tokens.
- **Datensparsamkeit und Datenschutz (Paragraf 12):** Es duerfen keine
  biometrischen Merkmale den Server erreichen. Bei Passkeys findet die
  Nutzerverifikation (Biometrie/PIN) ausschliesslich lokal auf dem Geraet statt;
  serverseitig liegt nur der oeffentliche Schluessel.
- **Zwei Betriebsmodelle, ein Code (Paragraf 2):** Die Konfiguration muss ueber
  den deklarativen Realm-Import erfolgen, damit Self-Hosted und Cloud identisch
  aufgesetzt werden.
- **Opt-in, kein Zwang:** Passkeys sollen moeglich sein, aber Passwort (mit MFA
  fuer Admins) bleibt als Weg bestehen. Nutzer registrieren einen Passkey
  freiwillig; die Umstellung darf bestehende Anmeldungen nicht brechen.

## Entscheidung

Wir aktivieren **WebAuthn Passwordless (Passkeys)** in Keycloak deklarativ ueber
den Realm-Import (`infra/docker/keycloak/zeitvault-realm.json`). Konkret:

- **WebAuthn-Passwordless-Policy:** Relying Party `ZeitVault`, Resident Key
  erforderlich (`requireResidentKey = Yes`, discoverable credentials =
  Passkeys), Nutzerverifikation erforderlich
  (`userVerificationRequirement = required`), Signaturalgorithmen `ES256` und
  `RS256`. Die RP-ID wird aus dem Host abgeleitet.
- **Required Action `webauthn-register-passwordless`:** aktiviert, aber **nicht**
  als Default erzwungen. Nutzer registrieren einen Passkey selbst ueber die
  Account-Konsole (`/realms/zeitvault/account`, Bereich "Signieren-Sie-sich-an")
  oder werden bei Bedarf pro Nutzer dazu aufgefordert.
- **Browser-Flow mit Passkey-Alternative:** Der Realm bindet den Browser-Flow
  `ZeitVault Browser mit Passkey`. Ablauf: Cookie/IdP-Redirector als
  Alternativen; danach ein Formular-Subflow mit **Benutzername zuerst**
  (`auth-username-form`), gefolgt von einem Subflow, in dem **Passkey**
  (`webauthn-authenticator-passwordless`) und **Passwort**
  (`auth-password-form`) gleichwertige Alternativen sind. So kann sich ein
  Nutzer mit Passkey **oder** Passwort anmelden.
- **Anwendungscode unveraendert:** Web und Mobile bleiben reine OIDC-Clients
  (Authorization Code + PKCE). Es gibt keinen client-seitigen WebAuthn-Code; die
  gesamte Passkey-Logik liegt im IdM.
- **MFA-Pflicht fuer Admins bleibt bestehen:** Ein Passkey mit erzwungener
  Nutzerverifikation erfuellt die Anforderung starker Authentifizierung; die
  Passwort-Strecke behaelt fuer administrative Rollen die MFA-Pflicht
  ([ADR-0008](0008-auth-keycloak-oidc-saml.md), Paragraf 11).

## Begruendung

- **Phishing-Resistenz:** Passkeys sind an die RP-ID gebunden und koennen nicht
  auf einer gefaelschten Domain verwendet werden. Das adressiert die haeufigste
  Angriffsklasse gegen Passwoerter direkt und serverseitig durchsetzbar
  (Paragraf 11).
- **Kein Implementierungs-Lock-in, kein Anwendungs-Umbau:** Weil WebAuthn im IdM
  hinter dem OIDC-Standard liegt, bleibt der Auth-Adapter der Anwendung
  unveraendert; die Wahl folgt der Regel "an Standards binden, nicht an
  Implementierungen" ([ADR-0008](0008-auth-keycloak-oidc-saml.md), Paragraf 5.1).
- **Datenschutz by design:** Biometrie bleibt auf dem Geraet; der Server sieht
  nur oeffentliche Schluessel. Das entspricht der Datensparsamkeit (Paragraf 12)
  und vermeidet die Verarbeitung besonderer Kategorien personenbezogener Daten.
- **Reproduzierbar in beiden Betriebsmodellen:** Die Aktivierung liegt im
  deklarativen Realm-Import und ist damit in Self-Hosted und Cloud identisch
  (Paragraf 2, Paragraf 16).
- **Sanfte Einfuehrung:** Als Opt-in (Required Action nicht erzwungen) bricht die
  Umstellung keine bestehende Passwort-Anmeldung; Nutzer koennen schrittweise
  auf Passkeys wechseln.

## Konsequenzen

### Positiv

- Phishing- und Credential-Stuffing-resistente Anmeldung, serverseitig
  erzwungen (Paragraf 11).
- Keine Aenderung am Anwendungscode; Web/Mobile bleiben reine OIDC-Clients.
- Keine biometrischen Daten auf dem Server; Datensparsamkeit gewahrt
  (Paragraf 12).
- Deklarativ und reproduzierbar ueber den Realm-Import, identisch in beiden
  Betriebsmodellen (Paragraf 2).

### Negativ

- **WebAuthn erfordert einen Secure Context:** In Produktion muss die
  Keycloak-Login-Domain ueber HTTPS erreichbar sein (localhost ist im
  Entwicklungsbetrieb ausgenommen). Das erhoeht die Anforderung an das
  TLS-/Domain-Setup des IdM.
- **Sicherheitskritische Flow-Konfiguration:** Der Browser-Flow und die
  WebAuthn-Policy sind zugriffskritisch. Fehler in der Flow-Struktur wirken
  direkt auf die Anmeldbarkeit. Der Realm-Import ist daher in jeder Zielumgebung
  vor Produktivsetzung zu verifizieren (Keycloak-Bootstrap mit `--import-realm`,
  Test-Login mit Passkey ueber einen virtuellen Authenticator).
- **Wiederherstellung/Geraeteverlust:** Bei Verlust aller Passkeys braucht es
  einen Wiederherstellungsweg (Passwort-Fallback bzw. administratives
  Zuruecksetzen der Anmeldedaten). Der Passwort-Weg bleibt daher bewusst
  erhalten.

### Neutral

- Die Registrierung eines Passkeys erfolgt ueber die Keycloak-Account-Konsole;
  ein gefuehrter In-App-Einstieg kann spaeter ergaenzt werden.
- `authenticatorAttachment` steht auf "not specified": sowohl
  Plattform-Authenticatoren (Windows Hello, Touch ID) als auch externe
  Sicherheitsschluessel sind zugelassen. Eine Verschaerfung (nur Plattform) ist
  eine spaetere Policy-Entscheidung.
- Attestation steht auf "not specified" (keine Hersteller-Attestierung
  gefordert); bei hoeheren Anforderungen kann eine Attestation-Pruefung mit
  einer AAGUID-Allowlist aktiviert werden.

## Betrachtete Alternativen

- **Nur Passwort + TOTP (Status quo beibehalten)** - Abgelehnt. TOTP ist nicht
  phishing-resistent; ein Angreifer kann das Einmalkennwort auf einer
  gefaelschten Seite abgreifen. Passkeys schliessen diese Luecke strukturell.
- **WebAuthn client-seitig in der Web-/Mobile-App implementieren** - Abgelehnt.
  Wuerde die Authentifizierung aus dem IdM in den Anwendungscode ziehen, gegen
  [ADR-0008](0008-auth-keycloak-oidc-saml.md) (nur OIDC-Bindung) verstossen und
  Web/Mobile/Terminal je eigenen, sicherheitskritischen Code aufbuerden.
- **WebAuthn als zweiten Faktor statt passwortlos
  (`webauthn-authenticator`)** - Erwogen. Loest die Phishing-Resistenz ebenfalls,
  bleibt aber an das Passwort gekoppelt und bietet nicht den Komfort der
  passwortlosen Anmeldung. Der passwortlose Flow schliesst den Zwei-Faktor-Fall
  nicht aus; beide koennen koexistieren. Fuer die Anforderung "Anmelden ueber
  Passkey" ist der passwortlose Authenticator die passende Wahl.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 11 - Sicherheitsarchitektur (OIDC/SAML via
  Keycloak, MFA-Pflicht fuer Admins, starke Authentifizierung)
- `../ARCHITEKTUR.md` Paragraf 12 - Datenschutz/Datensparsamkeit (keine
  unnoetigen personenbezogenen Daten; Biometrie bleibt auf dem Geraet)
- `../ARCHITEKTUR.md` Paragraf 2 - Betriebsmodelle (deklarative Konfiguration,
  identisch in Cloud und Self-Hosted)
- [ADR-0008: Auth via Keycloak (OIDC/SAML)](0008-auth-keycloak-oidc-saml.md) -
  Auth ausschliesslich ueber das IdM; MFA/Passkeys als Bordmittel; nur
  OIDC-Bindung der Anwendung
- [ADR-0004: Mandantenfaehigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md)
  - Tenant-Kontext aus dem Token bleibt unveraendert
