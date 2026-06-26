// OpenTelemetry-Bootstrap des Audit-Ledger-Dienstes. Vor den instrumentierten
// Modulen laden (erster Import in main.ts). Aktiv nur bei gesetztem
// OTEL_EXPORTER_OTLP_ENDPOINT (Opt-in, datensparsam).
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  process.env.OTEL_SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? 'zeitvault-ledger';

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();

  process.once('SIGTERM', () => {
    void sdk.shutdown();
  });
}
