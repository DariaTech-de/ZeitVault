# apps/mobile

**Zweck:** Native Mobile-Apps von ZeitVault für iOS und Android aus einer Codebasis – für Mitarbeitende. Ein-Tap-Bedienung (Kommen/Gehen, Pausen, Tagesübersicht, Salden, Urlaubsantrag, Push-Benachrichtigungen). Wichtig für Außendienst/Baustelle/Funklöcher.

**Geplanter Tech-Stack:** Expo SDK 56 (React Native 0.85, React 19.2, New Architecture + Hermes v1) auf Node.js 24 LTS / TypeScript 5.x. Teilt DTO-/Typdefinitionen mit dem Backend über `packages/types`. Token-basierte Auth (kurze Lebensdauer + Refresh) via Keycloak, biometrisches Entsperren, Zertifikats-Pinning, kein dauerhaftes Klartext-Caching sensibler Daten.

**Offline-First (MUSS):** Ein-/Ausstempeln funktioniert ohne Netz und synchronisiert konfliktfrei über eine lokale Queue gegen idempotente Sync-Endpunkte nach. GPS/Geofencing ist standardmäßig deaktiviert und nur per Betriebsvereinbarung aktivierbar (Mitbestimmung BetrVG Paragraf 87).

**Status:** Platzhalter – Implementierung folgt in Phase 1 gemäß Paragraf 18.

**Architektur:** siehe [Paragraf 13 – Mobile Apps](../../docs/ARCHITEKTUR.md#13-mobile-apps-mitarbeitende).
