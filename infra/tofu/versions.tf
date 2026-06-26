# ZeitVault Cloud-Provisionierung (OpenTofu 1.12, MPL-2.0; ADR-0007).
# Datenresidenz ausschließlich DE/EU (keine Drittlandübermittlung ohne Garantien).
terraform {
  required_version = ">= 1.12.0"

  # OpenTofu-native State-Verschlüsselung. Schlüsselmaterial kommt aus der
  # Umgebung/OpenBao (kein Klartext im Repo, ADR-0007). Methode/Key-Provider
  # werden je Umgebung gesetzt; hier nur als Rahmen dokumentiert.
  # encryption {
  #   key_provider "..." "openbao" { ... }
  #   method "aes_gcm" "default" { keys = key_provider...openbao }
  #   state { method = method.aes_gcm.default }
  #   plan  { method = method.aes_gcm.default }
  # }

  # required_providers werden je gewähltem EU-Provider gesetzt (Platzhalter):
  # required_providers {
  #   kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.30" }
  #   helm       = { source = "hashicorp/helm",       version = "~> 2.14" }
  # }
}
