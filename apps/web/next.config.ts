import type { NextConfig } from "next";

// Static export: the whole site is plain files built from data/demo.json. No server, no database.
const config: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Type checking runs separately (`pnpm typecheck`) with the repo's TypeScript version.
  typescript: { ignoreBuildErrors: true },
};

export default config;
