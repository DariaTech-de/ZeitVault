# infra/helm

**Zweck:** Helm-Chart von ZeitVault für das Betriebsmodell „groß“ auf Kubernetes (Self-Hosted/Cloud) – horizontal skalierbar, mit Health-/Readiness-Probes und rollierenden Updates. Nutzt denselben Satz signierter Container-Images wie das Compose-Setup; Unterschiede ausschließlich über Helm-Values, nie über getrennte Code-Branches.

**Geplanter Tech-Stack:** Helm-Chart auf Kubernetes; deployt App (NestJS 11), getrennten Audit-Ledger-Service, PostgreSQL 18 (RLS), Valkey 9.x, Objektspeicher (EU-Provider-S3 bzw. SeaweedFS/MinIO), Keycloak 26.6, OpenBao. Chart-Versionen fixiert für reproduzierbare Deployments.

**Architektur-Hinweis:** Beide Betriebsmodelle nutzen identische Images; Mandantenfähigkeit über `tenant_id` + RLS bleibt durchgängig aktiv.

**Status:** Basis-Chart vorhanden (Phase 4 / E1). Enthält `Chart.yaml`, `values.yaml` und Templates für API- und Ledger-Deployment inkl. Service, Health-/Readiness-Probes, Security-Context (non-root, read-only FS, gedroppte Capabilities) und Konfiguration. Geheimnisse stammen aus einem extern verwalteten Secret (`existingSecret`, über OpenBao/External-Secrets befüllt) – keine Klartext-Secrets in den Values (ADR-0007). SaaS-Flags/Betriebsmodell über Values (ADR-0010). PostgreSQL, Valkey, Keycloak und Objektspeicher werden als externe Abhängigkeiten erwartet.

Lokale Prüfung: `helm lint infra/helm` bzw. `helm template infra/helm`.

**Architektur:** siehe [Paragraf 16 – Infrastruktur & DevOps](../../docs/ARCHITEKTUR.md#16-infrastruktur--devops).
