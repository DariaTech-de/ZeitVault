# apps/mobile

**Zweck:** Native Mobile-Apps von ZeitVault für iOS und Android aus einer Codebasis – für Mitarbeitende. Ein-Tap-Bedienung (Kommen/Gehen, Pausen, Tagesübersicht, Salden, Urlaubsantrag, Push-Benachrichtigungen). Wichtig für Außendienst/Baustelle/Funklöcher.

**Geplanter Tech-Stack:** Expo SDK 56 (React Native 0.85, React 19.2, New Architecture + Hermes v1) auf Node.js 24 LTS / TypeScript 5.x. Teilt DTO-/Typdefinitionen mit dem Backend über `packages/types`. Token-basierte Auth (kurze Lebensdauer + Refresh) via Keycloak, biometrisches Entsperren, Zertifikats-Pinning, kein dauerhaftes Klartext-Caching sensibler Daten.

**Offline-First (MUSS):** Ein-/Ausstempeln funktioniert ohne Netz und synchronisiert konfliktfrei über eine lokale Queue gegen idempotente Sync-Endpunkte nach. GPS/Geofencing ist standardmäßig deaktiviert und nur per Betriebsvereinbarung aktivierbar (Mitbestimmung BetrVG Paragraf 87).

**Status:** Gerüst (B3). Vorhanden: Offline-First-Stempeloberfläche (`App.tsx`)
mit Kommen/Gehen/Pausen, lokaler Queue (AsyncStorage) und **idempotenter
Synchronisation** gegen `POST /api/stamp/sync`. Die Queue-Logik (Einreihen,
Idempotenz, Sync-Ergebnis anwenden) liegt geteilt und **getestet** in
`packages/domain` (`sync/queue.ts`); die Server-Idempotenz (clientEventId,
(tenant_id, client_event_id) eindeutig) ist gegen echtes Postgres verifiziert.

> Diese App ist **vom pnpm-Workspace ausgenommen** (`pnpm-workspace.yaml`), damit
> der verifizierte Build/CI nicht von der Expo-Toolchain abhängt und weil sie in
> dieser Umgebung **nicht auf einem Emulator lauffähig/verifizierbar** ist
> (gehört in die manuelle Abnahme). Aktivieren:
>
> 1. In `pnpm-workspace.yaml` die Zeile `"!apps/mobile"` entfernen.
> 2. `pnpm install` (zieht Expo SDK 56 / React Native 0.85).
> 3. `pnpm --filter @zeitvault/mobile start` und im Emulator/Gerät öffnen.

**Noch offen:** OIDC-Login (Keycloak) statt Demo-Identität, biometrisches
Entsperren, Zertifikats-Pinning, Push, Salden/Anträge. GPS/Geofencing bleibt
standardmäßig deaktiviert (BetrVG Paragraf 87).

**Architektur:** siehe [Paragraf 13 – Mobile Apps](../../docs/ARCHITEKTUR.md#13-mobile-apps-mitarbeitende).
