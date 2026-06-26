// OpenTelemetry-Bootstrap. MUSS vor dem Laden der instrumentierten Bibliotheken
// (HTTP/Express/pg) ausgeführt werden – daher als erster Import in main.ts. Aktiv
// nur, wenn OTEL_EXPORTER_OTLP_ENDPOINT gesetzt ist (Opt-in, datensparsam).
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'zeitvault-api';

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Datensparsamkeit: Datei-Tracing aus; keine sensiblen Inhalte tracen.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.once('SIGTERM', () => {
    void sdk.shutdown();
  });
}
