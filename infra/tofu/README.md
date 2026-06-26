# infra/tofu

**Zweck:** OpenTofu-Konfiguration von ZeitVault für die Cloud-Provisionierung – automatisierte Bereitstellung der SaaS-Infrastruktur in einem DE/EU-Rechenzentrum (Kubernetes, Datenbank, Objektspeicher, Netzwerk/WAF), inklusive automatisierter Backups und Monitoring/Alerting.

**Geplanter Tech-Stack:** OpenTofu 1.12 (MPL-2.0) statt Terraform – OSI-Lizenz, EU-/CRA-freundlich, integrierte State-Verschlüsselung, drop-in. Secrets über OpenBao (MPL-2.0) / SOPS, keine Klartext-Secrets im Repo. Datenresidenz ausschließlich DE/EU (keine Drittlandübermittlung ohne Garantien).

**Architektur-Hinweis:** Lizenz-Stabilität ist als Update-Risiko mitgedacht; foundation-geführte, permissive Bausteine vermeiden erzwungene Wechsel.

**Status:** Platzhalter – Implementierung folgt in Phase 0 gemäß Paragraf 18.

**Architektur:** siehe [Paragraf 16 – Infrastruktur & DevOps](../../docs/ARCHITEKTUR.md#16-infrastruktur--devops) und [ADR-0007 (OSI-/permissive Bausteine)](../../docs/adr/0007-osi-permissive-bausteine.md).
