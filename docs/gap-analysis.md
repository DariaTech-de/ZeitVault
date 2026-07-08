# Gap-Analyse: Payroll-Compliance (gegen docs/requirements/payroll-compliance.md)

Stand: 2026-07-08. Methodik: Domain-Modelle und Bewertungslogik zuerst gelesen
(`packages/domain`), dann API-Services, Schema/Migrationen und Testabdeckung
(`apps/api/test/*.itest.ts`, `packages/domain/**/*.test.ts`). Status
„implementiert" nur bei Code-Fundstelle UND Test, der das Akzeptanzkriterium
abdeckt. Zeilennummern beziehen sich auf den Stand von Commit `3f7fbf5`.

Aufwand: S < 1 Tag, M = 1–3 Tage, L > 3 Tage bzw. strukturell.

## Gap-Tabelle

| Req-ID | Status | Fundstelle (Datei:Zeile) | Begründung | Aufwand |
|---|---|---|---|---|
| A-01 | teilweise | stamp_events + Schicht-Faltung (`packages/domain/src/stamping/shifts.ts`); Dauer abgeleitet, nicht gespeichert | Nachtschichten sind seit Schnitt 1 erfassbar (siehe K-02). Verbleibende Lücke: Doppelmodell `time_entries` wird erst in Schnitt 4 zur Projektion konsolidiert (ADR-0017, findings.md Nr. 2). | S |
| A-02 | implementiert | `packages/types/src/stamp.ts:16-23` (location optional); Test: `apps/api/test/geofence.itest.ts:61-74` (Stempel ohne Ort → `not_required`), alle Stempel-Tests laufen ortlos | Ort ist optionales Attribut; Eintrag ohne Ortsangabe ist der Normalfall. | — |
| A-03 | implementiert | Schnitt 1: Pflicht-`reason` + Marker (`stamping.service.ts` stamp(); Spalten `late_entry`/`late_reason`, Migration 0019); Genehmigungs-Workflow setzt die Marker ebenfalls (`correction.service.ts`); Offline-Sync markiert mit systemischer Begründung `offline_sync` (A-06 bleibt möglich). Tests: `apps/api/test/stamping-shifts.itest.ts` | Nacherfassung > 24 h erfordert eine Begründung und wird dauerhaft markiert. | — |
| A-04 | implementiert | Trigger: `apps/api/src/db/migrations/0001_stamping.sql:30-39`; Test: `apps/api/test/append-only.itest.ts:23-36` (UPDATE und DELETE schlagen fehl) | Append-only auf DB-Ebene, testabgedeckt. Strenger als AK: UPDATE ist unabhängig vom Status verboten. | — |
| A-05 | teilweise | Terminal nutzt denselben Pfad: `apps/api/src/terminal/terminal.service.ts` → `StampingService.stamp` (`apps/api/src/stamping/stamping.service.ts:80-123`, source `terminal`) | Eine Bewertungslogik für alle Kanäle ist strukturell gegeben. Es fehlt der Test „Terminal-Eintrag und Web-Eintrag mit identischen Zeiten → identische Bewertung" (`terminal.itest.ts` testet nur RLS/NFC-Eindeutigkeit). | S |
| A-06 | teilweise | Client-Queue: `packages/domain/src/sync/queue.ts` + Tests `queue.test.ts:11-28` (idempotent je clientEventId); Server-Dedup: `apps/api/src/stamping/stamping.service.ts:284-356` (`onConflictDoNothing`, duplicates-Zähler) | Mechanik vorhanden und unit-getestet; Ende-zu-Ende-Test (Reconnect, Doppelerfassung über API) fehlt. | S |
| A-07 | teilweise | ArbZG-Prüfung läuft immer beim Stempeln: `stamping.service.ts:144-149`; Arbeitszeitmodelle: `schema.ts` (work_time_models, Sollminuten je Wochentag) | Verstoßerkennung ist modellunabhängig aktiv ✓. Es gibt aber kein `trust_based`-Kennzeichen am Modell und keine Sollzeit-Prüfung, die man dafür abschalten würde — das Zeitmodell ist an nichts gekoppelt. | S |
| A-08 | implementiert | Flag je Mandant: `apps/api/src/db/schema.ts:137-144` (geofence_settings.enabled); aus → keine Positionsauswertung: `apps/api/src/geofence/geofence.service.ts:138-155`; Test: `apps/api/test/geofence.itest.ts:61-74` | Bei deaktiviertem Flag wird die Position nicht ausgewertet und kein Geodatum persistiert (`location_check='not_required'`, site/distance NULL). | — |
| B-01 | teilweise | `packages/domain/src/arbzg/engine.ts:34-59` (8 h Warnung, 10 h Verstoß); Params `rule-packages.ts:17-18`; Tests `engine.test.ts:57-61` | Tagesgrenzen vorhanden. Der Kern des AK fehlt: Ausgleich auf 8 h im DURCHSCHNITT über 6 Kalendermonate/24 Wochen (konfigurierbar Monate ODER Wochen) — die Engine kennt keine periodenübergreifende Betrachtung. | L |
| B-02 | implementiert | Schnitt 0 (2026-07-08): strikte Schwellen `packages/domain/src/arbzg/engine.ts` (`requiredBreakMinutes`, „mehr als"), Abschnitte ≥ 15 min (`countableBreakMinutes`), max. 6 h am Stück (`evaluateContinuousWork`); Tests mit Gesetzeswortlaut + AK-Matrix: `engine.test.ts` (6:00→0, 6:01→30, 9:00→30, 9:01→45; 3×10 min zählt nicht; Netto-Bezugsgröße; Satz-3-Fälle) | Bezugsgröße ist die Arbeitszeit (netto) — Intervalle enthalten nur Arbeit, Pausen getrennt. Die Engine VALIDIERT nur (kein Auto-Pausenabzug); der frühere `>=`-Fehler erzeugte falsche Verstoßmeldungen, keine Unterbezahlung. | — |
| B-03 | teilweise | 11-h-Prüfung: `engine.ts` evaluateRestPeriod; seit Schnitt 1 schichtübergreifend UND live verkettet (gemeinsame Tagessicht `day-view.ts`, previousShiftEnd beim Stempeln/Heute/Report; Test day-view.test.ts) | Offen: 10-h-Verkürzung in Ausnahmebranchen mit Ausgleich innerhalb Kalendermonat/4 Wochen (Schnitt 3, an Regelmodell aus Schnitt 2 gebunden). | M |
| B-04 | fehlt | Gegenstelle: `packages/domain/src/arbzg/types.ts` (Params kennen keine Nachtarbeitnehmer-Dimension) | Kein Nachtarbeitnehmer-Begriff, keine eigene (kürzere) Ausgleichsperiode. Setzt B-01-Periodik voraus. | M |
| B-05 | fehlt | Gegenstelle: `packages/domain/src/surcharge/rule-packages.ts:24` (einziges Nachtfenster 20–6, steuerlich) | Es existiert nur die EStG-Definition als Zuschlagsfenster. Die ArbZG-Nachtzeit (23–6, Bäcker 22–5) ist nirgends modelliert; die AK-Unterscheidung 20:30 → `tax_night_bonus=true` / `arbzg_night_work=false` ist nicht darstellbar. | S |
| B-06 | fehlt | — (kein Modul; gesucht: Sonntag/Ersatzruhetag in domain + api) | Keine Zählung beschäftigungsfreier Sonntage, kein Ersatzruhetag-Tracking, keine Fristüberwachung. | L |
| B-07 | fehlt | Gegenstelle: `apps/api/src/db/schema.ts:34-56` (employees ohne Geburtsdatum) | Ohne Geburtsdatum keine automatische Aktivierung/Umschaltung; JArbSchG-Regelsatz existiert nicht. | M |
| B-08 | fehlt | — (kein `collective_agreement` in Schema/Typen; gesucht) | Kein Tarifvertrags-/Betriebsvereinbarungs-Objekt; Regelabweichungen sind heute gar nicht möglich (nur ein Code-Paket), damit auch keine Bindung. | M |
| B-09 | fehlt | Gegenstelle: `packages/domain/src/arbzg/rule-packages.ts:34-47` (`selectRulePackage` wählt still das jüngste gültige Paket) | Keine Ebenen (Gesetz→TV→BV→individuell), kein Günstigkeitsprinzip, keine Konflikterkennung — genau die „stille Priorisierung", die das AK ausschließt. | L |
| B-10 | teilweise | `rule-packages.ts:11-15` und `surcharge/rule-packages.ts:12-16` (validFrom/validTo je Paket) | Gültigkeitszeitraum-Struktur existiert ✓. Aber: Pakete sind Code-Konstanten (nicht mandantenseitig/DB), es gibt keinen Reprocessing-Job und keine Differenzberechnung (hängt an F-04/Periodenmodell). | L |
| B-11 | fehlt | Gegenstelle: `packages/domain/src/arbzg/types.ts` (nur maxDaily*), kein `max_working_time_mode` im Repo | Keine Wochenberechnung, kein Umschalter pro Mitarbeitergruppe (Mitarbeitergruppen existieren nicht). | M |
| B-12 | teilweise | Schnitt 1 (Basis, BL-6): Zeitdauern sind ganze Minuten; Sekunden→Minuten als explizite, dokumentierte Rundungsregel (kaufmännisch je Intervall, `engine.ts` intervalMinutes + Tests) | Offen: Rundungsmodus PRO MANDANT konfigurierbar + im Audit-Trail sichtbar (Schnitt 3); Betrags-/Lohnartenrundung erst am Ende (Schnitt 4). | M |
| B-13 | teilweise | Live-Prüfung beim Stempeln: `stamping.service.ts:144-149` (Findings in der Antwort); Anzeige beim Mitarbeiter (Heute-Ansicht) | Prüfung läuft beim Erfassen ✓ (nicht nur Nachtjob). Es fehlt: Benachrichtigung der Führungskraft; „Planen" existiert nicht. Ruhezeit fehlt live (B-03). | S |
| C-01 | teilweise | Fenster 20:00–06:00, 25 %, minutengenau: `surcharge/rule-packages.ts:19-25`, `compute.ts:53-67`; Tests `surcharge.test.ts:24-35` (Splittung an 20:00-Grenze) | Regel + Splittung korrekt und getestet. ABER: Die Zuschlags-Engine ist nur eine Vorschau (`work-time.service.ts:68-72`, Spans kommen vom Aufrufer) — sie ist nicht an echte Stempel angebunden, und „lokale Zeit" ist ungelöst (K-01). | M |
| C-02 | fehlt | Gegenstelle: `surcharge/types.ts` (SurchargeRule kennt keine Bedingungen, SurchargeKind geschlossen: night/sunday/holiday) | 40 %-Fenster 0–4 Uhr mit Bedingung „Aufnahme vor 00:00" ist im Regelmodell nicht darstellbar. | M |
| C-03 | teilweise | 50 % Sonntag: `surcharge/rule-packages.ts:26-31`; Tests `surcharge.test.ts:37-45` | Wie C-01: Regel korrekt, aber nicht an echte Stempel angebunden. | S |
| C-03a | fehlt | Gegenstelle: `surcharge/types.ts` (SurchargeRule kennt keine Bedingungen/Fortwirkungen) | Fortwirkung des Sonntagszuschlags 0–4 Uhr des Folgetags bei Arbeitsaufnahme vor 0 Uhr (§ 3b Abs. 3 Nr. 2 EStG) ist im Regelmodell nicht darstellbar — gleiche Mechanik wie C-02 (bedingtes Fenster mit Schichtbeginn-Bedingung), gemeinsam umzusetzen. | M |
| C-04 | teilweise | 125 % Feiertag: `surcharge/rule-packages.ts:32-37`; Test `surcharge.test.ts:47-52` | Feiertag ✓. Es fehlt: 31.12. ab 14:00 Uhr (Teiltagsregel nicht darstellbar). | S |
| C-04a | fehlt | Gegenstelle: `surcharge/types.ts` (wie C-03a) | Fortwirkung des Feiertagszuschlags 0–4 Uhr des Folgetags bei Arbeitsaufnahme vor 0 Uhr — mit C-02/C-03a als eine Fortwirkungs-Mechanik umzusetzen. | M |
| C-05 | fehlt | Gegenstelle: `surcharge/types.ts:10` (keine 150 %-Klasse, keine Sondertage) | 24.12. ab 14:00, 25./26.12., 01.05. mit 150 % sind nicht modelliert. | M |
| C-06 | fehlt | — (kein Geldbetrag im gesamten System; gesucht: €, Cent, Grundlohn, wage, hourly) | Ohne Geldmodell keine 50-€-/25-€-Grenzen, keine getrennten Felder steuerfrei/SV-frei. Grundsatzentscheidung nötig (Blocker 5). | L |
| C-07 | teilweise | Kumulation dokumentiert + implementiert: `compute.ts:36-41` (Nacht kumuliert; Feiertag > Sonntag), `:86-91`; Tests `surcharge.test.ts:54-70` | Für die heutigen drei Arten gelöst und getestet. Mit C-02/C-05 (40 %/125 %/150 % konkurrierend) muss die Konkurrenzregel neu formuliert und getestet werden. | S |
| C-08 | teilweise | Kalender je Bundesland inkl. Landesregeln: `packages/domain/src/calendar/holidays.ts:73-107`; Tests `calendar.test.ts` | Kalender ✓ (16 Länder, korrekte Landesfeiertage). Es fehlt: Einsatzort als Entität (Bundesland ist heute Request-Parameter, `work-time.service.ts:60-72`) und gemeindespezifische Feiertage (bewusst ausgeschlossen, `holidays.ts:69-72` — Spec verlangt sie, z. B. Fronleichnam in Teilen SN/TH). | M |
| C-09 | fehlt | Gegenstelle: `packages/types/src/stamp.ts:6` (nur clock/break-Arten) | Keine Bewertungsarten (Vollarbeit/Bereitschaftsdienst/Rufbereitschaft/Reisezeit), keine differenzierte ArbZG-Behandlung. | L |
| C-10 | fehlt | Gegenstelle: `packages/domain/src/accounts/types.ts:10` (ein einziges `overtime`-Konto) | Keine Trennung Mehrarbeit/Überstunden, keine TV-abhängige Definition. | M |
| C-11 | teilweise | Mapping-Struktur + Nicht-still-Verlieren: `packages/domain/src/payroll/mapping.ts:19-45`; Tests `payroll.test.ts`. Gegenstelle: `apps/api/src/export/export.controller.ts:45-48` (Mapping kommt aus dem Request-Body) | Mapping-Konzept existiert und ist getestet, aber es ist NICHT mandantenseitig persistiert und es gibt keine Admin-UI — „Änderung ohne Deployment wirksam" ist so nicht erfüllt (der Aufrufer muss das Mapping jedes Mal mitschicken). | M |
| D-01 | teilweise | Konto `flextime` mit Buchungen/Salden: `packages/domain/src/accounts/*`, `apps/api/test/accounts.itest.ts` | Konto existiert. Es fehlen: Kernzeit/Rahmenzeit, Kappungsgrenze, Verfallsregel (Kappung als protokollierter Buchungssatz). | M |
| D-02 | fehlt | Gegenstelle: `schema.ts` accountKind-Enum (overtime/flextime/vacation, geschlossen) | Kein Jahresarbeitszeitkonto. | M |
| D-03 | fehlt | — (kein Wertguthaben-Begriff im Repo) | § 7b/7d SGB IV nicht abgebildet. | L |
| D-04 | teilweise | Kontoauszug mit laufendem Saldo im Self-Service: `packages/domain/src/accounts/balance.ts` (buildStatement), UI Konten; Spalten vorhanden: `schema.ts:397-398` (source_type/source_id) | Auszug ✓. Aber die Herkunftsspalten werden beim Buchen NICHT befüllt (`apps/api/src/accounts/accounts.service.ts:40-49`) — Rückverfolgung bis zum Ursprungs-Zeiteintrag ist damit nicht gegeben. | S |
| E-01 | fehlt | Gegenstelle: `packages/domain/src/absence/working-days.ts:1-27` (zählt Mo–Fr, dient dem ABZUG, nicht dem Anspruch) | Kein Anspruchsmodell: keine 24-Werktage-Basis (Mo–Sa), keine Umrechnung auf individuelle Verteilung, kein Verteilungswechsel unterjährig. | L |
| E-02 | fehlt | — (kein Ein-/Austritts-/Teilzeitbezug im Urlaubskontext) | Hängt an E-01 (Anspruchs-Engine). | L |
| E-03 | fehlt | — | Kein Übertragsstichtag, kein Übertragskonzept. | M |
| E-04 | fehlt | — | Kein Hinweisversand, kein revisionssicherer Versandnachweis, keine Verfallskopplung. | L |
| E-05 | fehlt | Gegenstelle: `apps/api/src/absence/absence.service.ts:62-100` (reine Statuswechsel, keine Kollisionslogik) | Krankheit im Urlaubszeitraum bucht nichts zurück. | M |
| E-06 | teilweise | Statusfluss: `packages/domain/src/eau/eau.ts:1-35` + Tests `eau.test.ts`; Persistenz + Audit: `apps/api/src/eau/eau.service.ts:45-52` (`eau.request`) | Schnittstelle als Port vorhanden und protokolliert ✓; der tatsächliche Kassen-Abruf (zertifiziertes Gateway) ist bewusst extern und nicht angebunden. | M |
| E-07 | fehlt | Gegenstelle: `packages/domain/src/absence/transitions.ts:1` / `packages/types/src/absence.ts:4` (nur vacation/sick/special) | Mutterschutz/Elternzeit/Pflegezeit/Beschäftigungsverbot fehlen; keine Flags `reduces_vacation`/`paid`/`sv_relevant`. | M |
| E-08 | fehlt | — | Kein Kug-Nachweis (Soll/Ist je Monat). Soll-Stunden existieren via work_time_models als Baustein. | M |
| E-09 | teilweise | Workflow mit Genehmiger + Audit: `absence.service.ts:62-100`, `transitions.ts`; RLS-Test `absence-rls.itest.ts` | Genehmigen/Ablehnen/Stornieren ✓. Es fehlen: Vertretungsregelung, Eskalation, Kopplung an den Monatsabschluss (Cut-off existiert nicht, F-03). | M |
| F-01 | fehlt | Bewusste Gegenstelle: `packages/domain/src/payroll/types.ts:1-11` (nur generisches CSV; DATEV-Layouts dürfen laut CLAUDE.md §9 nicht erfunden werden); `docs/compliance/DATEV-REFERENZ.md` ist Platzhalter | Natives LODAS-/Lohn-und-Gehalt-Format erfordert die OFFIZIELLE Schnittstellenbeschreibung → externe Abhängigkeit, siehe offene Frage 1. | L |
| F-02 | teilweise | Trennung Bewertung → Mapping → Serialisierung: `mapping.ts` (mapToLineItems) + `toPayrollCsv` | Schichtung vorhanden, aber kein explizites Adapter-Interface/Registry für mehrere Ziele. | S |
| F-03 | fehlt | — (kein Freeze/Periodenabschluss in Schema oder Services) | Kein Periodenbegriff, keine Freigabekette, keine DB-Sperre für eingefrorene Zeiträume. | L |
| F-04 | fehlt | — | Keine Retro-/Differenzlogik; Exporte lesen immer den Live-Stand. | L |
| F-05 | teilweise | Deterministische Sortierung + Prüfsumme + unveränderlicher ExportJob: `apps/api/src/export/export.service.ts:93-111`; Tests `export.serialize.test.ts`, `apps/api/test/export.itest.ts` | Gleicher Datenstand → gleiche Prüfsumme ✓ (getestet auf Serialisierungsebene). Aber „gleicher Datenstand" ist ohne Freeze (F-03) nicht fixierbar, und der Exportinhalt selbst wird nicht aufbewahrt (nur Checksum) — Byte-Reproduktion nach Datenänderung nicht möglich. | M |
| G-01 | teilweise | Append-only, hash-verkettetes Ledger: `apps/ledger/src/db/migrations/0000_init.sql:16-41` (prev_hash/hash, Trigger); Audit bei lohnrelevanten Aktionen: `packages/types/src/audit-event.ts:10-37` | Trail unveränderbar ✓, breite Abdeckung ✓. Lücken: kein alt→neu-Diff im Event-Payload; Regeländerungen sind Code (nicht auditierbar); einzelne Stammdaten-Schreibpfade ohne Trail (z. B. `work-time.service.ts:25-45` create ohne Audit). | M |
| G-02 | teilweise | Kein DELETE via Trigger: `0001_stamping.sql:30-39` u. a.; Korrektur-Revision mit Begründung: `apps/api/src/time/time.logic.ts:22-39`, `stamping.service.ts:157-230` | Unveränderbarkeit + Nachvollziehbarkeit sind über das Revisions-/Gegenbuchungsmuster gegeben (fachlich äquivalent zum Storno). Die AK-Felder `voided_at/voided_by/void_reason` existieren nicht als einheitliches Muster über alle Entitäten. | S |
| G-03 | teilweise | Retention-Engine + Klassen: `packages/domain/src/retention/retention.ts:12-33`; Service + Test: `retention.service.ts`, `retention.itest.ts` | Engine ✓ (Sperren/Pseudonymisieren/Fristlauf, Jahresende-Logik). Es fehlen: 2-Jahre-MiLoG-Klasse, Policy PRO DATENART (heute je Mitarbeiter-Datensatz), „längste zutreffende Frist"-Auflösung. | M |
| G-04 | fehlt | — (kein Lücken-Report; reporting.service kennt nur Verstöße/Salden) | Report „Erfassungslücken > 7 Tage" fehlt. Baustein (createdAt vs occurredAt) ist vorhanden. | S |
| G-05 | fehlt | Gegenstelle: Rollenmodell nur employee/manager/admin (`apps/api/src/auth/`) | Keine `auditor`-Rolle; der GoBD-Export (`export.service.ts:76-127`) ist als Grundlage nutzbar. | M |
| G-06 | teilweise | Statische Doku: `docs/compliance/VERFAHRENSDOKUMENTATION.md` | Vorhanden als gepflegtes Dokument, nicht als systemseitig generiertes Artefakt „aktive Regelsätze pro Stichtag" (setzt DB-Regelsätze aus B-10 voraus). | M |
| H-01 | fehlt | Gegenstelle: `apps/api/src/platform/feature-flags.ts` (nur registration/billing); Admin-Dashboard zeigt Einzelleistung (`admin/dashboard.service.ts`) | Kein Auswertungsverbots-Flag, keine k-Anonymität; aktuelle Auswertungen sind personenscharf. | M |
| H-02 | teilweise | RBAC-Guards + Tests: `apps/api/src/auth/roles.guard.ts`, `roles.test.ts`; RLS-Tests (`rls.itest.ts` u. a.) | Rollenkonzept vorhanden und punktuell getestet. Eine vollständige, getestete Berechtigungs-MATRIX je Endpunkt fehlt; Lohndaten existieren noch nicht (Trennung ist bei C-06/I-01 mitzudenken). | M |
| H-03 | fehlt | — (keine Betriebsrats-Rolle) | Hängt an Rollenmodell-Erweiterung (mit G-05). | S |
| H-04 | teilweise | Sperren/Pseudonymisieren/Löschen: `retention.*` (s. G-03) | Löschkonzept ✓. Art.-15-Auskunftsexport je Betroffenem fehlt. | M |
| H-05 | teilweise | Self-Host/EU + TLS: `infra/docker/*`, Runbooks; Doku: `docs/compliance/DSGVO.md`, `DSFA.md`, `VVT-ROPA.md` | Betriebsmodell und Transportverschlüsselung ✓, DSGVO-Doku ✓. AVV-VORLAGE nicht gefunden; Verschlüsselung at rest nicht erzwungen/dokumentiert. | M |
| I-01 | fehlt | Bausteine: Salden je Mitarbeiter (`reporting.service.ts:145-180`) | Ohne Geldmodell (Tagessatz/Stundensatz, C-06) keine Rückstellungsbewertung; kein Stichtagsexport. | M |
| I-02 | teilweise | Verstoßreport je Zeitraum: `reporting.service.ts:105-142`; UI Auswertungen | Zeitraum ✓, Verstoßart in Findings enthalten. Es fehlen: Organisationseinheiten (existieren nicht als Entität) und Filter je Verstoßart. | S |
| I-03 | teilweise | Projektzeit: `schema.ts` projects/project_time_entries, `project.itest.ts` | Projekte ✓ (append-only Buchungen). Kostenstellen/-träger nur als Mapping-Felder im Payroll-Export, keine Zuordnung der Arbeitszeit. | M |
| I-04 | nicht auffindbar | — | Kein FuE-Bezug im Repo gefunden. (Prio K.) | M |
| J-01 | implementiert | RLS mit FORCE auf allen Mandantentabellen: z. B. `0001_stamping.sql`, `0017_terminals.sql:18-23`, `0018_employee_photos.sql`; Tests: `rls.itest.ts`, `absence-rls.itest.ts`, `terminal.itest.ts:20-58` | Cross-Tenant-Zugriff scheitert auf Query-Ebene, nachweislich getestet (auch WITH CHECK). | — |
| J-02 | implementiert | OIDC gegen Keycloak: `apps/api/src/auth/token-verifier.ts:28-56` (Issuer/Audience/RS256); Web-PKCE: `apps/web/src/lib/oidc.ts`; Tests: `claims.test.ts`, `me.itest.ts` | SSO über Keycloak (OIDC nativ; SAML über Keycloak-Brokering, ADR-0008). | — |
| J-03 | fehlt | — | Kein SCIM. | M |
| J-04 | teilweise | OpenAPI generiert: `apps/api/src/main.ts:29-36` | API offen dokumentiert ✓, aber Version „0.0.0", kein /v1-Präfix, keine Versionierungs-/Deprecation-Politik. | S |
| J-05 | nicht auffindbar | — | Keine a11y-Tests/-Audits im Repo; Zustand der Oberflächen gegenüber WCAG 2.1 AA unbewertet. | M |
| J-06 | implementiert | `infra/docker/docker-compose*.yml`, `install.sh`/`install.ps1`, `docs/DEPLOY-*.md`; ADR-0010 | Self-Hosted ist ein Kernbetriebsmodell (AK hat kein Testkriterium; CI baut die Images). | — |
| K-01 | implementiert | Schnitt 1: Speicherung UTC ✓, Bewertung in der Einsatzort-Zeitzone (`packages/domain/src/localtime/localtime.ts`, `day-view.ts`; alle Services auf lokale Abrechnungstage umgestellt). DST-AK-Tests: `localtime.test.ts`/`shifts.test.ts` (Schicht 22:00–06:00 → 7 h bzw. 9 h) und Service-Level `stamping-shifts.itest.ts` gegen die echte DB. | — |
| K-02 | teilweise | Schnitt 1: Schichtfolgen-Validierung im ±48-h-Fenster (`stamping.service.ts`), Nachtschicht = EINE Schicht (`foldShifts`), Abrechnungstag = lokaler Tag des Schichtbeginns (ADR-0018, `day-view.ts`); Lohnexport ordnet je Abrechnungstag zu (`export.service.ts`). Test: `stamping-shifts.itest.ts` (22:00–06:00 akzeptiert, 8 h am Starttag) | Erfassung + explizit beschlossener Standard (ADR-0018) stehen. Offen: die je Mandant KONFIGURIERBARE Zuordnungsregel und die Kopplung an die Abrechnungsperiode (Schnitt 5). | M |
| K-03 | implementiert | Schnitt 1: werktägliche Lesart = Schicht-/Abrechnungstags-Bewertung (`day-view.ts` + Tests: Nachtschicht zählt zum Tag des Schichtbeginns; Ruhezeit schichtübergreifend über die Kalendertagsgrenze); kalendertägliche Lesart = `sliceIntervalByLocalDay` (`localtime.ts` + DST-feste Tests) als Grundlage der Zuschlags-Splittung. Beide Lesarten testabgedeckt. | — |
| K-04 | teilweise | Minutenweise Datumsklassifikation über Mitternacht: `surcharge/compute.ts:53-58`; Test So→Mo: `surcharge.test.ts:72-77` | Mechanik der Zuschlagssplittung an der Tagesgrenze ✓ (Richtung Sa→So identisch, aber nicht explizit getestet). Gilt nur für die (unverdrahtete) Zuschlags-Vorschau — reale Stempel erreichen sie nicht (C-01) und scheitern vorher an K-02. | S |
| K-05 | nicht auffindbar | — (einziger ISO-Wochen-Code ist Dashboard-Anzeige: `admin/dashboard.service.ts:43-47`) | Keine bewertungs-/abrechnungsrelevante Wochenlogik vorhanden, daher auch keine Kantenfälle testbar. | M |
| K-06 | implementiert | Schema-Review: durchgängig timestamptz ✓. Schnitt 1: Einsatzort-Entität mit IANA-Zeitzone (ADR-0016; `work_locations` + Historie, Migration 0019, RLS-Test `work-location-rls.itest.ts`), Auflösung Übersteuerung > Zuordnung > Mandanten-Default > Fallback (`work-location.service.ts` resolve), Bewertung gegen die aufgelöste Zeitzone in Stempeln/Heute/Report/Export/Dashboard. | — |

Status-Zählung (79 Anforderungen; Stand nach Schnitt 1, 2026-07-08): implementiert 11 (B-02 aus Schnitt 0; A-03/K-01/K-03/K-06 aus Schnitt 1) · teilweise 32 · fehlt 33 · widerspricht 0 · nicht auffindbar 3 (I-04, J-05, K-05). Nebenbefunde aus Schnitt 1: [`findings.md`](findings.md).

---

## 1. Architektur-Blocker (nicht additiv nachrüstbar)

**BL-1: Kein lokaler Zeit-/Einsatzort-Begriff — Bewertung hängt am UTC-Kalendertag.**
Der „Arbeitstag" ist an drei unabhängigen Stellen als UTC-Datumsfenster codiert
(`stamping.service.ts:31-40`, `reporting.service.ts:28-37,190`,
`export.service.ts:225`), und es existiert keine Entität, die eine Zeitzone oder
ein Bundesland trägt. K-01/K-03/K-06 (lokale Bewertung), C-08 (Feiertag je
Einsatzort) und B-03 (Kalendertagsgrenze) sind dagegen nicht anbaubar: Der
Tagesbegriff muss einmal zentral definiert (Einsatzort → IANA-Zeitzone →
lokaler Tagesschnitt) und alle Verbraucher darauf umgestellt werden. Bestehende
Auswertungen ändern dabei ihr Ergebnis → bewusster Migrationsschritt, kein Add-on.

**BL-2: Tagesgebundene Stempel-Validierung macht Nachtschichten unmöglich.**
`stamp()` validiert den Statuswechsel ausschließlich gegen die Ereignisse des
UTC-Tages des neuen Stempels (`stamping.service.ts:96-108`); `foldStampDay`
wirft bei einem `clock_out` ohne `clock_in` am selben Tag (`fold.ts:67-70`).
Folge: Ausstempeln nach Mitternacht → 409. Das ist kein fehlendes Feature,
sondern eine aktive Sperre im Kernfluss (betrifft Erfassung, Offline-Sync,
Korrekturen UND alle tagesfaltenden Auswertungen). Die Validierung muss auf
„offene Schicht des Mitarbeiters" umgestellt und die Faltung schichts- statt
tagesbasiert werden — Grundlage für K-02/K-03/A-01 und die Zeitscheiben der
Zuschläge.

**BL-3: Regel-Engine ist einlagig, zustandslos und im Code verdrahtet.**
Ein einziges aktives Paket pro Datum, still ausgewählt
(`rule-packages.ts:34-47`), als Code-Konstante. B-08 (TV-Bindung), B-09
(Layering + Günstigkeitsprinzip mit Konfliktfehler), B-10 (mandantenseitige,
versionierte Regelsätze + Reprocessing), B-01/B-04/B-06/B-11 (perioden-
übergreifende Durchschnitte/Zähler) verlangen: persistente Regelsätze je
Mandant/Gruppe mit Quelle und Gültigkeit, eine Auflösungsschicht mit
definierter Fehlerlogik und Bewertungsläufe über Zeiträume statt Einzeltage.
Das ist ein Umbau des Engine-Kerns, kein weiteres Regelpaket.

**BL-4: Geschlossene Enums an allen lohnrelevanten Erweiterungspunkten.**
`SurchargeKind` (3 Arten, `surcharge/types.ts:10`), `account_kind` (3 Konten,
DB-Enum), `PayrollCategory` (4, `payroll/types.ts:13`), `absence_type` (3,
DB-Enum). Jede C-/D-/E-Anforderung (40 %-Regel, 150 %-Tage, Bewertungsarten,
Jahres-/Wertguthabenkonto, neue Abwesenheitsarten mit Flags) erzwingt heute
Schema- UND Codeänderung. Nachrüstbar nur über konfigurierbare Kataloge
(Bewertungsarten, Lohnarten, Kontoarten, Abwesenheitsarten je Mandant) — das
ändert Datenmodell und Bewertungspfad.

**BL-5: Es gibt kein Geldmodell.**
Nirgends im System existiert ein Geldbetrag. C-06 (50 €/25 €-Grenzen, zwei
Ausgabefelder), I-01 (Rückstellungen), C-11 (Lohnarten sinnvoll) brauchen eine
Grundsatzentscheidung zur Repräsentation (DB `numeric`, im Code Dezimal-String/
Cent-Integer — niemals Float, Spec-Verbot) BEVOR der C-Schnitt beginnt.

**BL-6: Bruchminuten (Float-Dauern) in der Kernberechnung.**
`intervalMinutes` liefert `ms / 60000` ungerundet (`arbzg/engine.ts:13-19`) —
bei sekundengenauen Stempeln entstehen Float-Minuten, die durch alle Summen
laufen (verstößt gegen „Zeitdauern niemals als Float"). Zusammen mit B-12 muss
die Politik „erst bewerten, dann runden" mit definiertem Rundungspunkt einmal
zentral festgelegt werden — bevor Zuschläge auf diesen Werten rechnen.

**BL-7: Kein Periodenbegriff (Abrechnungsmonat).**
Freeze (F-03), Retro-Differenzen (F-04), reproduzierbarer „Datenstand" (F-05),
K-02-Monatszuordnung und E-09-Eskalation „vor Cut-off" referenzieren alle eine
Abrechnungsperiode mit Lebenszyklus (offen → in Freigabe → eingefroren), die es
nicht gibt. Nachträgliches Einziehen ist Schema- und Prozessänderung zugleich.

---

## 2. Umsetzungsplan in Schnitten (mit Abhängigkeiten)

Deckungsgleich mit der vorgegebenen Phase-2-Reihenfolge; keine Abweichung nötig.
**Schnitt 0 (B-02) wurde am 2026-07-08 genehmigt und umgesetzt** (strikte
Schwellen, Satz 2 + 3, Netto-Bezugsgröße) — siehe Tabellenzeile B-02.

**Schnitt 1 — Fundament (K-01, K-06, K-02/K-03-Basis, A-04, G-01; plus B-12-Basis, A-03).**
Einsatzort-Entität (IANA-Zeitzone, Bundesland; Zuordnung Mitarbeiter↔Einsatzort
mit Gültigkeit) · zentrale Abstraktion „lokaler Arbeitstag" (ersetzt UTC-dayWhere
überall) · Schicht- statt Tagesfaltung + Stempel-Validierung gegen offene
Schicht (macht Nachtschichten erfassbar) · DST-Tests (K-01-AK) ·
Integer-Minuten + zentrale Rundungsstelle (BL-6, Basis B-12) · `late_entry`
+ Pflicht-reason (A-03) · Audit-Lücken schließen (alt→neu-Payload, fehlende
Trails wie work_time_models; A-04/G-01 sind größtenteils vorhanden — Deltas).
Abhängig von: Antworten auf Fragen 4, 7. Alles Weitere hängt hieran.

**Schnitt 2 — Engine-Struktur (B-08, B-09, B-10).**
Persistente, mandantenfähige Regelsätze (DB) mit valid_from/valid_to und Quelle
(law/collective_agreement/works_agreement/individual) · `collective_agreement`-
Entität, Aktivierungszwang für Abweichungen (B-08) · Auflösungsschicht mit
Günstigkeitsprinzip und explizitem Konfliktfehler (B-09) · Bewertungslauf über
Zeiträume (Grundlage für Durchschnitte) · Reprocessing-Gerüst, das Neubewertungen
als Läufe protokolliert (Differenz-ERZEUGUNG kommt erst mit F-04/Schnitt 5).
Abhängig von: Schnitt 1 (lokaler Tag), Frage 5.

**Schnitt 3 — Regeln (B-01, B-03..B-07, B-11..B-13; B-02 bereits in Schnitt 0 erledigt).**
B-01/B-04 Ausgleichsdurchschnitte (konfigurierbar Monate/Wochen; Nachtarbeitnehmer kürzer)
· B-03 live verdrahten + 10h-Ausnahme · B-05 zweite Nachtzeit-Definition ·
B-06 Sonntagszählung + Ersatzruhetag-Fristen · B-07 Geburtsdatum + JArbSchG-
Paket (Frage 8) · B-11 Wochenmax parallel, je Mitarbeitergruppe · B-12
Rundungsmodus je Mandant + Audit-Sichtbarkeit · B-13 FK-Benachrichtigung.
Abhängig von: Schnitt 2 (Regelmodell), Schnitt 1 (Tagesbegriff, Gruppen).

**Schnitt 4 — Zuschläge (C-01..C-11 inkl. C-03a/C-04a, K-04).**
Zeitscheiben-Pipeline aus echten Stempeln (Schnitt 1) in lokaler Zeit →
Zuschlags-Engine · Regelmodell erweitern: bedingte Fenster/Fortwirkungen
(C-02, C-03a, C-04a als EINE Mechanik „Fenster 0–4 Uhr Folgetag bei Aufnahme
vor 0 Uhr"), Sondertage mit Teiltagsbeginn (C-04/C-05), Kumulationsmatrix (C-07)
· Geldmodell (BL-5)
+ Grundlohngrenzen mit getrennten Feldern steuerfrei/SV-frei (C-06) ·
Feiertagskalender an Einsatzort binden + Gemeinde-Ausnahmen (C-08) ·
Bewertungsarten-Katalog (C-09) · Mehrarbeit/Überstunden-Zähler (C-10) ·
Lohnartenmapping persistieren + Admin-UI (C-11). K-04-Tests auf reale Pipeline.
Abhängig von: Schnitte 1–3; Fragen 3, 9.

**Schnitt 5 — Periode, Freeze, Retro (F-03, F-04; F-05-Härtung, E-09-Kopplung, K-02-Regel).**
Perioden-Entität mit Freigabekette MA→FK→HR (F-03) · DB-Sperre für eingefrorene
Zeiträume (Trigger analog Append-only) · Retro: Korrektur nach Freeze erzeugt
Differenzbuchung im Folgemonat, Ursprungsmonat reproduzierbar (F-04, nutzt
Reprocessing aus Schnitt 2) · Exportinhalt aufbewahren/Datenstand fixieren
(F-05) · K-02-Zuordnungsregel konfigurierbar, ohne stillen Default (Frage 6) ·
E-09: offene Anträge blockieren Freeze oder erzwingen dokumentierte Entscheidung.
Abhängig von: Schnitt 1 (Audit), Schnitt 2 (Reprocessing), Schnitt 4 (Lohnarten
für Differenzbuchungen).

**Schnitt 6 — Rest nach Prio (M vor S vor K).**
M: Urlaubs-Engine E-01..E-05, E-07 (Arten+Flags) · D-01 (Kappung/Verfall als
Buchungssätze), D-04 (source befüllen) · G-03 (MiLoG-Klasse, je Datenart),
G-04 (7-Tage-Report), G-05 (auditor-Rolle + Prüfexport) · H-01 (Auswertungs-
verbot + k≥5, inkl. Dashboard), H-02 (Matrix-Tests), H-04 (Art.-15-Export) ·
I-01 (Rückstellungen; braucht Geldmodell), I-02 (Orgeinheit/Filter) · F-01
(sobald DATEV-Spec vorliegt — Frage 1).
S: D-02, D-03, E-06 (Gateway-Adapter), E-08, F-02 (Adapter-Interface), G-06,
H-03, H-05 (AVV/at-rest), I-03, J-03, J-04 (v1), J-05, K-05.
K: I-04.

---

## 3. Offene fachliche Fragen

> **Antworten vom 2026-07-08 (Go-Freigabe) sind eingearbeitet:** B-02-Semantik
> bestätigt und als Schnitt 0 vorgezogen (inkl. § 4 Satz 2 + 3); Einsatzort →
> ADR-0016; Ereignisquelle/Projektion → ADR-0017; Abrechnungstag vs. Splittung →
> ADR-0018; Geld = `numeric`/Decimal (nie `number`), Rundung erst am Ende je
> Lohnart+Periode (B-12), Sekunden→Minuten ist eine Rundungsregel unter B-12;
> BL-4 über mandantenbezogene Referenztabellen mit geseedeten gesetzlichen
> Arten (keine freien Strings); H-01 umfasst auch das Admin-Dashboard;
> Geburtsdatum für B-07 freigegeben; F-01: offizielle DATEV-Spezifikation wird
> beschafft — bis dahin kanonische Lohnartensätze + Adapter-Interface bauen,
> KEIN DATEV-Layout. Spec-Nachtrag C-03a/C-04a aufgenommen (79 Anforderungen).
> Die ursprünglichen Fragen bleiben unten zur Nachvollziehbarkeit stehen.

1. **F-01 / DATEV:** CLAUDE.md §9 verbietet, DATEV-Feldlayouts zu erfinden; die
   offizielle Schnittstellenbeschreibung (LODAS bzw. Lohn und Gehalt,
   Bewegungsdaten) liegt nicht in `docs/compliance/` vor. Wer beschafft sie, und
   gibt es einen DATEV-Testmandanten für das AK? Bis dahin bleibt F-01 blockiert
   (der generische Export bleibt Zwischenstand).
2. **B-02-Grenzen:** Die bestehende Implementierung+Tests behaupten „ab 6:00 h →
   30 min, ab 9:00 h → 45 min"; das AK (und mein Verständnis von § 4 ArbZG:
   „mehr als") verlangt 6:00→0 und 9:00→30. Ich werde auf die AK-Semantik
   umstellen — bitte bestätigen. Und: darf ich diesen Fix vorziehen (vor
   Schnitt 1), da er aktive Fehlbewertungen produziert?
3. **Geldrepräsentation (C-06/I-01):** Mein Vorschlag: DB `numeric(12,2)` bzw.
   Cent-genau, im Code Dezimal-Strings mit einer kleinen Money-Hilfsschicht
   (keine Floats, keine Binär-Dezimal-Konvertierung). Einverstanden, oder gibt
   es eine Vorgabe (z. B. Cent-Integer)?
4. **Einsatzort-Modell (K-06/C-08):** Reicht ein Einsatzort je Mitarbeiter mit
   Gültigkeitshistorie (Standardfall), oder muss der Einsatzort je Zeiteintrag
   übersteuerbar sein (Bau/Montage: mehrere Orte am selben Tag, ggf. mit
   unterschiedlichen Feiertagen)? Das entscheidet über das Datenmodell in
   Schnitt 1.
5. **Branchen-Ausnahmen (B-03 10 h-Ruhezeit, B-05 Bäcker 22–5):** Abbildung als
   Regelsatz-Parameter je Mandant/Mitarbeitergruppe mit TV-Referenzpflicht
   (B-08) — okay? Oder gibt es eine definierte Branchenliste, die das System
   kennen soll?
6. **K-02-Konfiguration:** AK verlangt „kein impliziter Default". Heißt das:
   Pflichtwahl bei Mandanten-Einrichtung (System verweigert Periodenrechnung
   ohne getroffene Wahl)? Und gilt die Wahl mandantweit oder je
   Mitarbeitergruppe/TV?
7. **Doppelmodell stamp_events / time_entries:** Für die Zeitscheiben-Pipeline
   plane ich, Zeitscheiben aus `stamp_events` abzuleiten (dort passiert die
   reale Erfassung) und `time_entries` darauf zu konsolidieren. Alternativ
   bleiben beide parallel. Präferenz?
8. **B-07 / Geburtsdatum:** JArbSchG-Automatik erfordert das Geburtsdatum als
   neues Stammdatum (personenbezogen; Datensparsamkeit bisher bewusst schlank).
   Einverständnis zur Aufnahme (nur Datum, Zweckbindung dokumentiert)?
9. **Rechtsstände/Zahlenwerte:** Ich übernehme sämtliche Sätze, Fenster und
   Grenzen (25 %/40 %/50 %/125 %/150 %, 50 €/25 €, Fristen) EXAKT aus dem
   Spec-Dokument als Testreferenz und aktualisiere nichts eigenmächtig —
   Bestätigung genügt.
10. **H-01-Reichweite:** Gilt das Auswertungsverbot auch für das bestehende
    Admin-Dashboard (Feed „Letzte Stempelungen" ist personenscharf) und den
    Verstoßreport? Dann schaltet das Flag diese Ansichten auf aggregiert/
    anonymisiert (k ≥ 5) um — das verändert bestehende Funktionen sichtbar.
