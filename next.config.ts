import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit reads its own font metrics off disk at construction time.
  // Bundling it rewrites those paths and the read fails, so leave it
  // resolving from node_modules.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
