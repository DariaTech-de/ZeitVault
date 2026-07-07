# ADR-0015: Zeiterfassungs-Terminal (NFC/Fingerabdruck), keine Server-Biometrie

**Status:** Akzeptiert - 2026-07-07

## Kontext

Kunden möchten ein Terminal am Eingang, an dem Mitarbeitende per **NFC-Chip** oder
**Fingerabdruck** stempeln. Daraus ergeben sich mehrere Kräfte:

- **Biometrie ist besonders schützenswert (DSGVO Art. 9):** Fingerabdruckdaten
  sind besondere Kategorien personenbezogener Daten. Sie serverseitig zu
  speichern oder zu verarbeiten, wäre ein hohes Risiko und erfordert enge
  Rechtsgrundlagen. Datensparsamkeit (Paragraf 12) verlangt, das zu vermeiden.
- **Terminal ist kein Nutzer:** Ein Terminal hat keinen persönlichen Login; es
  muss sich dennoch sicher gegenüber dem Server authentifizieren und den
  richtigen Mandanten treffen (Kern-Invariante 3, RLS).
- **Unveränderbarkeit/Revisionssicherheit:** Terminal-Stempel sind reguläre
  Stempel und müssen dieselbe append-only Logik und Audit-Pflicht erfüllen
  (Kern-Invarianten 1 und 2).
- **Betrieb offline-nah:** Das Terminal steht im Kundennetz; die Auth darf nicht
  von einem externen Dienst abhängen (Self-Hosted, Paragraf 2).

## Entscheidung

Wir führen ein **Kiosk-Terminal** mit Geräte-Token-Authentifizierung ein und
verarbeiten **keine biometrischen Daten am Server**:

- **Fingerabdruck bleibt lokal:** Der Fingerabdruck wird ausschließlich **auf dem
  Terminal** (Secure Element/lokale Enrollierung) abgeglichen. Der Server erhält
  NIE biometrische Rohdaten oder Templates – nur die vom Terminal **lokal
  aufgelöste Mitarbeiter-ID**. Es gibt bewusst KEINE Fingerabdruck-Tabelle am
  Server.
- **NFC-Chip → Mitarbeitender:** Die Zuordnung von NFC-UID zu Mitarbeitendem wird
  serverseitig gepflegt (`nfc_credentials`, UID je Mandant eindeutig, RLS). Das
  Terminal sendet die UID; der Server löst den Mitarbeitenden auf.
- **Geräte-Token statt Nutzer-Login:** Terminals authentifizieren sich mit einem
  Geräte-Token im Header `x-terminal-token`. Das Token hat die Form
  `<base64url(tenantId)>.<secret>`; der Mandant ist kodiert (nicht geheim) und
  setzt den RLS-Kontext, das Geheimnis wird gegen den gespeicherten **SHA-256-Hash**
  in Konstantzeit geprüft. Der Server speichert nur den Hash; das Klartext-Token
  wird bei der Registrierung **einmalig** angezeigt.
- **Kiosk-Endpunkt:** `POST /kiosk/stamp` (Terminal-Guard) nimmt entweder `nfcUid`
  ODER `employeeId` (Fingerabdruck) und optional `kind`. Ohne `kind` wählt der
  Server automatisch die nächste sinnvolle Aktion (out→Kommen, in→Gehen,
  Pause→Pause-Ende). Der Stempel wird über den regulären Stempel-Pfad angelegt
  (Quelle `terminal`, append-only, Tagesfolge-Validierung, AuditEvent).
- **Verwaltung:** Registrierung/Deaktivierung von Terminals und NFC-Zuordnungen
  erfolgt durch die Administration (Nutzer-Token, Rolle `admin`) und wird
  auditiert (`terminal.register`, `nfc.map`).

## Begründung

- **DSGVO-konform durch Design:** Da Biometrie das Gerät nie verlässt, entstehen
  serverseitig keine Art.-9-Daten; das Risiko wird an der Quelle vermieden
  (Paragraf 12). Der Server arbeitet nur mit einer Mitarbeiter-ID wie bei jedem
  anderen Stempel.
- **Sichere, self-hostbare Terminal-Auth:** Das Geräte-Token trägt den Mandanten
  (für RLS) und ein zufälliges Geheimnis, von dem nur der Hash gespeichert wird –
  kein externer Dienst, kein Klartext in der DB, Konstantzeit-Vergleich.
- **Invarianten bleiben gewahrt:** Terminal-Stempel durchlaufen exakt dieselbe
  append-only Logik, Tagesfolge-Prüfung und Audit-Pflicht wie Web/Mobile
  (Kern-Invarianten 1 und 2); die Quelle `terminal` macht sie nachvollziehbar.

## Konsequenzen

### Positiv

- Keine biometrischen Daten am Server (DSGVO Art. 9, Datensparsamkeit).
- Terminals authentifizieren sich sicher und self-hostbar (nur Hash gespeichert,
  Mandant im Token, kein Phone-Home).
- Terminal-Stempel sind revisionssicher und append-only wie alle anderen.

### Negativ

- **Vertrauen ins Terminal:** Die Fingerabdruck-Auflösung liegt beim Gerät; die
  Sicherheit hängt von der Geräteintegrität und der Verwahrung des Geräte-Tokens
  ab. Ein kompromittiertes Terminal/Token muss deaktivierbar sein (ist es:
  `active=false`).
- **NFC-Chips sind übertragbar:** Ein NFC-Chip identifiziert den Chip, nicht
  zwingend die Person. Für höhere Sicherheit ist der Fingerabdruck (lokal) oder
  eine Kombination vorzusehen; das ist eine Betriebsentscheidung.
- **Token-Verwahrung:** Das Klartext-Token wird nur einmal angezeigt; geht es
  verloren, muss ein neues Terminal registriert werden.

### Neutral

- Die konkrete Fingerabdruck-Hardware/-Enrollierung ist Sache des Terminals und
  hier bewusst nicht spezifiziert; der Server-Vertrag ist „Terminal sendet
  aufgelöste Mitarbeiter-ID".
- Die Auto-Wahl der nächsten Aktion ist eine einfache Zustandslogik; ein Terminal
  kann `kind` auch explizit senden (z. B. Pausentasten).

## Betrachtete Alternativen

- **Fingerabdruck-Templates am Server speichern/abgleichen** - Abgelehnt. Erzeugt
  besondere Kategorien personenbezogener Daten (DSGVO Art. 9) mit hohem Risiko und
  widerspricht der Datensparsamkeit (Paragraf 12). Der lokale Abgleich vermeidet
  das vollständig.
- **Terminal per Nutzer-Token/Service-Account in Keycloak** - Erwogen. Möglich,
  aber schwergewichtig für ein Kiosk-Gerät ohne Person; das gehashte Geräte-Token
  ist einfacher, self-hostbar und ohne zusätzlichen IdP-Roundtrip. Die reguläre
  Nutzer-Auth bleibt für Web/Mobile bei Keycloak ([ADR-0008](0008-auth-keycloak-oidc-saml.md)).
- **Nur NFC (kein Fingerabdruck)** - Verworfen als alleinige Lösung, da NFC-Chips
  übertragbar sind; der lokale Fingerabdruck ergänzt ohne Server-Biometrie.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 12 - Datenschutz/Datensparsamkeit (keine
  unnötigen/besonderen personenbezogenen Daten)
- `../ARCHITEKTUR.md` Paragraf 7 - Mandantenfähigkeit (Tenant-Kontext, RLS) -
  Kern-Invariante 3
- [ADR-0004: Mandantenfähigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md)
  - Terminals/NFC je Mandant unter RLS
- [ADR-0006: Audit-Ledger append-only](0006-audit-ledger-append-only.md) -
  terminal.register / nfc.map und Terminal-Stempel als unveränderliche Ereignisse
- [ADR-0008: Auth via Keycloak (OIDC/SAML)](0008-auth-keycloak-oidc-saml.md) -
  reguläre Nutzer-Auth; das Terminal nutzt ein separates Geräte-Token
