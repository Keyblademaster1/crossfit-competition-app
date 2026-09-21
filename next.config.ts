import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end tests build their own copy into a different folder, so
  // running them does not disturb a dev server you already have open.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* config options here */
};

export default nextConfig;
