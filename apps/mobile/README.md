# apps/mobile

**Zweck:** Native Mobile-Apps von ZeitVault für iOS und Android aus einer Codebasis – für Mitarbeitende. Ein-Tap-Bedienung (Kommen/Gehen, Pausen, Tagesübersicht, Salden, Urlaubsantrag, Push-Benachrichtigungen). Wichtig für Außendienst/Baustelle/Funklöcher.

**Geplanter Tech-Stack:** Expo SDK 56 (React Native 0.85, React 19.2, New Architecture + Hermes v1) auf Node.js 24 LTS / TypeScript 5.x. Teilt DTO-/Typdefinitionen mit dem Backend über `packages/types`. Token-basierte Auth (kurze Lebensdauer + Refresh) via Keycloak, biometrisches Entsperren, Zertifikats-Pinning, kein dauerhaftes Klartext-Caching sensibler Daten.

**Offline-First (MUSS):** Ein-/Ausstempeln funktioniert ohne Netz und synchronisiert konfliktfrei über eine lokale Queue gegen idempotente Sync-Endpunkte nach. GPS/Geofencing ist standardmäßig deaktiviert und nur per Betriebsvereinbarung aktivierbar (Mitbestimmung BetrVG Paragraf 87).

**Status:** Funktional und **im Workspace typgeprüft** (`pnpm typecheck`). Enthält:

- **Anmeldung:** OIDC (Keycloak, Authorization Code + PKCE über
  `expo-auth-session`) im Modus `oidc`; im Modus `dev` (lokal/Sandbox) eine
  Demo-Identität über Header. Steuerung via `EXPO_PUBLIC_AUTH_MODE`. Der
  angemeldete Mitarbeiter wird über `GET /api/me` aufgelöst (`src/auth.ts`).
- **Tagesübersicht:** aktueller Stempelstatus, gearbeitete/pausierte Minuten und
  ArbZG-Befunde aus `GET /api/stamp/today` (`src/api.ts`).
- **Offline-First-Stempeln:** Kommen/Gehen/Pausen ohne Netz, lokale Queue
  (AsyncStorage) und **idempotente Synchronisation** gegen `POST /api/stamp/sync`.
  Die Queue-Logik liegt geteilt und **getestet** in `packages/domain`
  (`sync/queue.ts`); die Server-Idempotenz ist gegen echtes Postgres verifiziert.
- **Biometrisches Entsperren:** `expo-local-authentication` (best effort; ohne
  Hardware/Enrollment übersprungen).

> **Verifikationsgrenze dieser Umgebung:** Typecheck und Lint laufen mit; ein
> tatsächlicher **Emulator-/Gerätelauf** (sowie ein realer OIDC-Login gegen
> Keycloak) gehört in die manuelle Abnahme – dafür `pnpm --filter
> @zeitvault/mobile start` ausführen und im Emulator/Gerät öffnen.

**Konfiguration (`EXPO_PUBLIC_*`):** `API_BASE_URL` (Android-Emulator:
`http://10.0.2.2:3000`), `AUTH_MODE` (`oidc`/`dev`), `OIDC_ISSUER`,
`OIDC_CLIENT_ID`, `TENANT_ID`, `USER_ID` (Dev-Subject). GPS/Geofencing bleibt
standardmäßig deaktiviert (BetrVG Paragraf 87).

**Noch offen (extern):** Zertifikats-Pinning, Push-Benachrichtigungen, Salden-/
Antragsansichten, EAS-Buildpipeline.

**Architektur:** siehe [Paragraf 13 – Mobile Apps](../../docs/ARCHITEKTUR.md#13-mobile-apps-mitarbeitende).
