# Provisionierungs-Gerüst der SaaS-Infrastruktur in einem DE/EU-Rechenzentrum:
# Kubernetes-Cluster, managed PostgreSQL 18 (RLS), Objektspeicher (WORM),
# Netzwerk/WAF, Backups und Monitoring/Alerting (ARCHITEKTUR.md Paragraf 16).
#
# Bewusst provider-neutrales Gerüst: die konkreten Ressourcen-/Modulblöcke werden
# je gewähltem EU-Provider gesetzt. Secrets ausschließlich über OpenBao/SOPS,
# nie im Repo (ADR-0007). Datenresidenz EU/DE (Variable data_residency).

locals {
  name = "${var.cluster_name}-${var.environment}"
  common_tags = merge(var.tags, {
    "app"            = "zeitvault"
    "environment"    = var.environment
    "data-residency" = var.data_residency
    "managed-by"     = "opentofu"
  })
}

# --- Kubernetes-Cluster (EU-Region) ---------------------------------------
# module "kubernetes" {
#   source  = "..." # EU-Provider-spezifisches Modul
#   name     = local.name
#   region   = var.region
#   tags     = local.common_tags
# }

# --- Managed PostgreSQL 18 (RLS bleibt aktiv) ------------------------------
# module "postgres" {
#   source           = "..."
#   name             = "${local.name}-db"
#   engine_version   = var.postgres_version
#   region           = var.region
#   multi_az         = true
#   backup_retention = 35
#   tags             = local.common_tags
# }

# --- Objektspeicher (WORM für Ledger/Exporte) ------------------------------
# module "object_storage" {
#   source        = "..."
#   bucket        = var.object_storage_bucket
#   region        = var.region
#   object_lock   = true # WORM
#   versioning    = true
#   tags          = local.common_tags
# }

# --- Netzwerk/WAF, Backups, Monitoring/Alerting ----------------------------
# module "edge" {
#   source = "..."
#   waf    = true
#   tags   = local.common_tags
# }
