import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Claude reads the synthetic sample images from disk when a joiner uploads one.
  outputFileTracingIncludes: { "/api/employee": ["./public/samples/**/*"] },
  reactStrictMode: true,
};

export default nextConfig;
