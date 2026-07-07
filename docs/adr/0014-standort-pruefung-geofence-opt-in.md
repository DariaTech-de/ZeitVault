# ADR-0014: Standort-Prüfung beim Stempeln (Geofencing, standardmäßig aus)

**Status:** Akzeptiert - 2026-07-07

## Kontext

Kunden wünschen die Möglichkeit, beim Stempeln zu prüfen, ob sich Mitarbeitende
tatsächlich an einem Betriebsstandort befinden (z. B. Außendienst, mehrere
Werke). Gleichzeitig ist die Standortprüfung stark grundrechts- und
mitbestimmungsrelevant. Daraus ergeben sich klare Kräfte:

- **Kern-Invariante 5 (nicht verhandelbar):** GPS/Geofencing ist standardmäßig
  DEAKTIVIERT. Standort-/Verhaltensdaten werden nur nach Betriebsvereinbarung
  aktiviert; keine heimliche Überwachung (BetrVG § 87, Mitbestimmung bei
  technischen Überwachungseinrichtungen).
- **Datensparsamkeit (Paragraf 12):** Es dürfen nur die für den Zweck nötigen
  Daten gespeichert werden. Rohe Bewegungsprofile (präzise Koordinaten je
  Stempel) sind dafür nicht erforderlich – das Prüfergebnis genügt.
- **Unveränderbarkeit (Kern-Invariante 1):** Stempel sind append-only. Ein
  Prüfergebnis, das zum Stempel gehört, muss beim Anlegen unveränderlich gesetzt
  werden; eine spätere „Kennzeichnung" durch die Administration darf den Stempel
  nicht verändern.
- **Revisionssicherheit (Kern-Invariante 2):** Das Aktivieren der Prüfung und das
  Kennzeichnen eines Stempels sind sicherheitsrelevante Aktionen und müssen
  auditiert werden.
- **Zwei Erfassungswege:** Online-Stempel (Web/App) und offline erfasste Stempel
  (Mobile-Queue, [ADR-0006]/Sync). Beide müssen die Prüfung konsistent abbilden.

## Entscheidung

Wir führen eine **optionale, je Mandant aktivierbare** Standort-Prüfung ein, die
**standardmäßig aus** ist:

- **Opt-in je Mandant:** `geofence_settings.enabled` (Default `false`). Nur die
  Administration kann aktivieren; die Aktivierung setzt eine Betriebsvereinbarung
  voraus und wird auditiert (`geofence.configure`). Ist die Prüfung aus, wird
  KEINE Position ausgewertet – auch eine mitgesendete Position bleibt ungenutzt.
- **Standorte:** `geofence_sites` (Mittelpunkt lat/lng + Radius in Metern) je
  Mandant unter RLS. Die App/Client sendet beim Stempeln optional eine Position.
- **Prüfergebnis, keine Rohdaten:** Am (append-only) Stempel werden nur
  `location_check` (`not_required` | `inside` | `outside` | `no_signal`), der
  getroffene Standort und die **gerundete** Distanz in Metern gespeichert – NICHT
  die rohen Koordinaten (Datensparsamkeit). Das Ergebnis wird beim Insert einmalig
  gesetzt und nie verändert.
- **Bewertung:** `inside`, wenn die Position im Radius des nächstgelegenen
  Standorts liegt, sonst `outside`; ohne Position `no_signal`. Haversine-Distanz,
  rein deklarativ und unit-getestet.
- **Beide Erfassungswege:** Online-Stempel werten die Position sofort aus; die
  Offline-Sync-Strecke wertet die je Eintrag mitgeführte Position beim Sync aus
  (ein Auswerter lädt Einstellungen/Standorte einmal und bewertet in-memory).
- **Kennzeichnung („blinken"):** Die Administration kann einen Stempel zur
  Nachverfolgung kennzeichnen (`stamp_flags`, getrennte, veränderbare
  Workflow-Entität – der Stempel bleibt unverändert). Auffällige Stempel
  (`outside`/`no_signal`) werden in der Verwaltung hervorgehoben; das Kennzeichnen
  wird auditiert (`stamp.flag`).

## Begründung

- **Rechtskonform per Default:** „Aus" als Voreinstellung setzt Kern-Invariante 5
  technisch durch; ein versehentliches Erheben von Standortdaten ist
  ausgeschlossen. Die Aktivierung ist eine bewusste, auditierte
  Administrationshandlung.
- **Datensparsam by design:** Nur das Prüfergebnis und eine gerundete Distanz
  werden persistiert; es entsteht kein Bewegungsprofil (Paragraf 12).
- **Invarianten-treu:** Das Ergebnis ist Teil des unveränderlichen Stempels; die
  spätere Kennzeichnung liegt in einer getrennten Tabelle und verletzt die
  Append-only-Regel nicht (Kern-Invariante 1).
- **Konsistent über beide Wege:** Derselbe deklarative Auswerter bewertet Online-
  und Offline-Stempel; die Offline-Bewertung nutzt die zum Zeitpunkt des Syncs
  gültigen Standorte.

## Konsequenzen

### Positiv

- Standardmäßig keine Standortverarbeitung; Aktivierung nur bewusst und auditiert
  (Kern-Invariante 5, Paragraf 12).
- Kein Bewegungsprofil: nur Ergebnis/Standort/Distanz am Stempel.
- Prüfergebnis unveränderbar; Kennzeichnung getrennt und revisionssicher.

### Negativ

- **Genauigkeit/Manipulierbarkeit von GPS:** Positionsdaten der Endgeräte können
  ungenau oder manipuliert sein. Das Ergebnis ist daher ein Hinweis zur Prüfung,
  keine harte Zutrittskontrolle; die Kennzeichnung erfordert eine menschliche
  Bewertung.
- **Betriebsvereinbarung erforderlich:** Die Aktivierung ohne wirksame
  Betriebsvereinbarung ist unzulässig; die technische Aktivierung ersetzt die
  rechtliche Grundlage nicht.
- **Offline-Bewertung zeitversetzt:** Offline erfasste Positionen werden erst beim
  Sync gegen die dann gültigen Standorte bewertet.

### Neutral

- Rohkoordinaten werden bewusst nicht gespeichert; für Streitfälle steht die
  gerundete Distanz zum getroffenen Standort zur Verfügung. Eine spätere,
  ausdrücklich geregelte Speicherung genauerer Daten bliebe eine eigene
  Datenschutz-Entscheidung.
- Die App erfasst eine Position nur, wenn der Mandant Geofencing aktiviert hat;
  der Client-Vertrag trägt die Position optional (`location`).

## Betrachtete Alternativen

- **Immer aktiv / Opt-out** - Abgelehnt. Verstößt gegen Kern-Invariante 5 und die
  Mitbestimmung; heimliche oder voreingestellte Überwachung ist unzulässig.
- **Rohe Koordinaten je Stempel speichern** - Abgelehnt. Erzeugt ein
  Bewegungsprofil und widerspricht der Datensparsamkeit (Paragraf 12); für den
  Zweck (im Standort ja/nein) nicht erforderlich.
- **Kennzeichnung als Spalte am Stempel** - Abgelehnt. Der Stempel ist
  append-only (Kern-Invariante 1); eine veränderbare Kennzeichnung gehört in eine
  getrennte Entität.
- **Serverseitige Live-Ortung ohne App-Beteiligung** - Nicht möglich/zulässig;
  die Position kommt ausschließlich vom Endgerät und nur mit Zustimmung/Aktivierung.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 3.4, Paragraf 12 - Datenschutz/Datensparsamkeit,
  GPS/Geofencing standardmäßig aus (Kern-Invariante 5, BetrVG § 87)
- [ADR-0004: Mandantenfähigkeit via Postgres RLS](0004-mandantenfaehigkeit-postgres-rls.md)
  - Einstellungen/Standorte/Kennzeichnungen je Mandant unter RLS
- [ADR-0006: Audit-Ledger append-only](0006-audit-ledger-append-only.md) -
  geofence.configure / stamp.flag als unveränderliche Ereignisse; Stempel bleibt
  append-only (Kern-Invariante 1)
