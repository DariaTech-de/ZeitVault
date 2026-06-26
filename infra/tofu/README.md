# infra/tofu

**Zweck:** OpenTofu-Konfiguration von ZeitVault für die Cloud-Provisionierung – automatisierte Bereitstellung der SaaS-Infrastruktur in einem DE/EU-Rechenzentrum (Kubernetes, Datenbank, Objektspeicher, Netzwerk/WAF), inklusive automatisierter Backups und Monitoring/Alerting.

**Geplanter Tech-Stack:** OpenTofu 1.12 (MPL-2.0) statt Terraform – OSI-Lizenz, EU-/CRA-freundlich, integrierte State-Verschlüsselung, drop-in. Secrets über OpenBao (MPL-2.0) / SOPS, keine Klartext-Secrets im Repo. Datenresidenz ausschließlich DE/EU (keine Drittlandübermittlung ohne Garantien).

**Architektur-Hinweis:** Lizenz-Stabilität ist als Update-Risiko mitgedacht; foundation-geführte, permissive Bausteine vermeiden erzwungene Wechsel.

**Status:** Provider-neutrales Modul-Gerüst vorhanden (Phase 4 / E1): `versions.tf` (OpenTofu ≥ 1.12, State-Verschlüsselungsrahmen), `variables.tf` (inkl. erzwungener EU/DE-Datenresidenz), `main.tf` (Gerüst für Kubernetes, managed PostgreSQL 18, Objektspeicher/WORM, Netzwerk/WAF) und `outputs.tf`. Die konkreten Provider-/Modulblöcke werden je gewähltem EU-Provider gesetzt; Secrets ausschließlich über OpenBao/SOPS (ADR-0007).

Lokale Prüfung: `tofu fmt -check` bzw. `tofu validate` (nach Setzen der Provider).

**Architektur:** siehe [Paragraf 16 – Infrastruktur & DevOps](../../docs/ARCHITEKTUR.md#16-infrastruktur--devops) und [ADR-0007 (OSI-/permissive Bausteine)](../../docs/adr/0007-osi-permissive-bausteine.md).
