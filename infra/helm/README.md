# infra/helm

**Zweck:** Helm-Chart von ZeitVault für das Betriebsmodell „groß“ auf Kubernetes (Self-Hosted/Cloud) – horizontal skalierbar, mit Health-/Readiness-Probes und rollierenden Updates. Nutzt denselben Satz signierter Container-Images wie das Compose-Setup; Unterschiede ausschließlich über Helm-Values, nie über getrennte Code-Branches.

**Geplanter Tech-Stack:** Helm-Chart auf Kubernetes; deployt App (NestJS 11), getrennten Audit-Ledger-Service, PostgreSQL 18 (RLS), Valkey 9.x, Objektspeicher (EU-Provider-S3 bzw. SeaweedFS/MinIO), Keycloak 26.6, OpenBao. Chart-Versionen fixiert für reproduzierbare Deployments.

**Architektur-Hinweis:** Beide Betriebsmodelle nutzen identische Images; Mandantenfähigkeit über `tenant_id` + RLS bleibt durchgängig aktiv.

**Status:** Platzhalter – Implementierung folgt in Phase 0 gemäß Paragraf 18.

**Architektur:** siehe [Paragraf 16 – Infrastruktur & DevOps](../../docs/ARCHITEKTUR.md#16-infrastruktur--devops).
