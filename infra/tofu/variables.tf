variable "environment" {
  description = "Umgebungsname (z. B. staging, production)."
  type        = string
}

variable "region" {
  description = "Provider-Region. MUSS in der EU liegen (Datenresidenz DE/EU)."
  type        = string
  default     = "eu-central-1"
}

variable "data_residency" {
  description = "Erlaubte Datenresidenz; ausschließlich EU/DE zulässig."
  type        = string
  default     = "EU"

  validation {
    condition     = contains(["EU", "DE"], var.data_residency)
    error_message = "Datenresidenz muss EU oder DE sein (keine Drittlandübermittlung ohne Garantien)."
  }
}

variable "cluster_name" {
  description = "Name des Kubernetes-Clusters."
  type        = string
  default     = "zeitvault"
}

variable "postgres_version" {
  description = "PostgreSQL-Major (LTS/aktuell stabil; ADR-0003)."
  type        = string
  default     = "18"
}

variable "object_storage_bucket" {
  description = "Bucket/Objektspeicher für Export- und WORM-Ablage (Ledger)."
  type        = string
  default     = "zeitvault-worm"
}

variable "tags" {
  description = "Gemeinsame Tags/Labels für provisionierte Ressourcen."
  type        = map(string)
  default     = {}
}
