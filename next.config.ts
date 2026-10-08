import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WASM build of Postgres; keep it out of the server bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  // Files API routes read from disk at runtime, which the bundler can't see:
  // migrations (applied on first connection), PGlite's WASM build, and the sample
  // document images Claude reads when a joiner uploads one.
  outputFileTracingIncludes: {
    "/api/**": [
      "./drizzle/**/*",
      "./node_modules/@electric-sql/pglite/dist/pglite.wasm",
      "./node_modules/@electric-sql/pglite/dist/pglite.data",
      "./node_modules/@electric-sql/pglite/dist/initdb.wasm",
    ],
    "/api/employee": ["./public/samples/**/*"],
  },
  // The local embedded database is never part of a deployment.
  outputFileTracingExcludes: { "*": ["./.data/**/*"] },
  reactStrictMode: true,
};

export default nextConfig;
