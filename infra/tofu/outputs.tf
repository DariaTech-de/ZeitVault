output "environment" {
  description = "Provisionierte Umgebung."
  value       = var.environment
}

output "name" {
  description = "Abgeleiteter Ressourcen-Basisname."
  value       = local.name
}

output "data_residency" {
  description = "Bestätigte Datenresidenz (EU/DE)."
  value       = var.data_residency
}

# Weitere Outputs (kube-config-Referenz, DB-Endpunkt, Bucket-Name) werden mit
# den konkreten Modulblöcken in main.tf ergänzt. Geheime Werte werden NICHT als
# Output ausgegeben, sondern verbleiben in OpenBao (ADR-0007).
