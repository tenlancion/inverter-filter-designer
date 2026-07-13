import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/inverter-filter-designer",
  assetPrefix: "/inverter-filter-designer",
  images: { unoptimized: true },
};

export default nextConfig;
