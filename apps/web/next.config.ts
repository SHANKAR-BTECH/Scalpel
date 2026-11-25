import type { NextConfig } from "next";

// A server app: logins, a shared database (Neon Postgres when DATABASE_URL is set) and live updates.
const config: NextConfig = {
  transpilePackages: ["@scalpel/engine"],
  // Type checking runs separately (`pnpm typecheck`) with the repo's TypeScript version.
  typescript: { ignoreBuildErrors: true },
};

export default config;
