# infra/docker

**Zweck:** Docker-Compose-Setup von ZeitVault für das Betriebsmodell „Self-Hosted klein“ (On-Premises) – Inbetriebnahme in Minuten aus demselben Satz signierter Container-Images, der auch in der Cloud läuft. Unterschiede zur Cloud werden ausschließlich über Konfiguration (Env) gesteuert, nie über getrennte Code-Branches.

**Geplanter Tech-Stack:** Docker + Compose; Dienste App (NestJS 11), PostgreSQL 18 (RLS aktiv), Valkey 9.x, SeaweedFS/MinIO, Keycloak 26.6 und OpenBao. Base-Images per Digest gepinnt für reproduzierbare Builds.

**Architektur-Hinweis:** Self-Hosted läuft als Mandant mit `tenant_id 'default'` bei deaktivierter SaaS-Registrierung/Abrechnung; RLS bleibt auch im Single-Tenant-Betrieb aktiv.

**Status:** Platzhalter – Implementierung folgt in Phase 0 gemäß Paragraf 18.

**Architektur:** siehe [Paragraf 16 – Infrastruktur & DevOps](../../docs/ARCHITEKTUR.md#16-infrastruktur--devops).
