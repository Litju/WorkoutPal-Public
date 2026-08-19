import { withEve } from "eve/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@workoutpal/science-port"],
  transpilePackages: ["@workoutpal/ui"],
  outputFileTracingIncludes: {
    "/*": ["../../packages/science-port/engine/**/*"],
  },
};

export default withEve(nextConfig, { eveRoot: "agent" });
