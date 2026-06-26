import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Typed Routes deaktiviert: vermeidet, dass next-env.d.ts an build-generierte
  // Typen (.next/types) gekoppelt wird, damit `tsc --noEmit` auch ohne
  // vorherigen Build (CI: typecheck vor build) gruen bleibt.
  typedRoutes: false,
};

export default nextConfig;
