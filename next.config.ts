import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root to THIS folder.
    // Without this, Next found stray lockfiles (C:\package-lock.json,
    // ~/pnpm-lock.yaml) and wrongly inferred the root as C:\, which stopped it
    // from resolving our route files (everything 404'd). See the Turbopack
    // "Root directory" docs for why files outside the root aren't resolved.
    root: __dirname,
  },
};

export default nextConfig;
