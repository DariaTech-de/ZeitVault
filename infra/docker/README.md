# infra/docker

**Zweck:** Docker-Compose-Setup von ZeitVault für das Betriebsmodell „Self-Hosted klein" (On-Premises) – Inbetriebnahme in Minuten aus demselben Satz Container-Images, der auch in der Cloud läuft. Unterschiede zur Cloud werden ausschließlich über Konfiguration (Env) gesteuert, nie über getrennte Code-Branches (ADR-0010).

## Inhalt

- [`docker-compose.yml`](docker-compose.yml) – Stack: `postgres` (PostgreSQL 18, RLS aktiv), `valkey`, `keycloak`, `openbao`, `seaweedfs` sowie die Anwendungsdienste `api` und `ledger`.
- [`Dockerfile.api`](Dockerfile.api) / [`Dockerfile.ledger`](Dockerfile.ledger) – mehrstufige Builds (Build-Kontext = Repo-Root).
- [`postgres-init/`](postgres-init) – legt beim ersten Start die getrennte Ledger-Datenbank `zeitvault_ledger` an (Vertrauensgrenze, ADR-0006).

## Schnellstart (lokal)

```bash
# Stack starten
docker compose -f infra/docker/docker-compose.yml up -d --build

# Schema/Migrationen anwenden (RLS, Trigger)
pnpm --filter @zeitvault/api    db:migrate
pnpm --filter @zeitvault/ledger db:migrate
```

- API: <http://localhost:3000/api> · OpenAPI: <http://localhost:3000/api/docs>
- Ledger: <http://localhost:3001> · OpenAPI: <http://localhost:3001/docs>
- Keycloak: <http://localhost:8080> · OpenBao: <http://localhost:8200>

## Hinweise

- **Image-Tags** sind Beispiele. In Produktion werden Base-Images **per Digest gepinnt** (ADR-0003), und `keycloak`/`openbao` laufen **nicht** im Dev-Modus.
- Self-Hosted läuft als Mandant `tenant_id = 'default'`; RLS bleibt auch im Single-Tenant-Betrieb aktiv (ADR-0004).
- Für große Installationen: Helm/Kubernetes statt Compose (siehe [`../helm`](../helm)).

**Architektur:** siehe [Paragraf 16 – Infrastruktur & DevOps](../../docs/ARCHITEKTUR.md).
