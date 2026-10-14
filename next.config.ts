import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["tesseract.js", "sharp"],
  turbopack: {
    root: path.join(process.cwd()),
  },
};

export default nextConfig;
