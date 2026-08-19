import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Forces firebase-admin to be BUNDLED rather than left external.
   *
   * Next ships firebase-admin in its default serverExternalPackages list, so it is
   * normally loaded with a plain Node require() at runtime. Its dependency tree
   * contains two ESM-only packages, jose@6 and node-fetch@3 (nested under
   * google-auth-library), and require() of an ES module only works from Node 22.12
   * onward. On an older runtime every server function died at import with
   * ERR_REQUIRE_ESM, which returned 500 for every page and route while static
   * assets kept serving.
   *
   * Listing it here is the documented-by-code way out: Next filters
   * transpilePackages back OUT of the external list, defaults included
   * (see optOutBundlingPackages in next/dist/build/webpack-config.js). Bundling
   * means the ESM imports are resolved at build time, so this holds on any Node
   * version rather than depending on the platform's default.
   */
  transpilePackages: ["firebase-admin"],

  images: {
    // YouTube serves thumbnails and avatars from these hosts. Allow-listing them
    // lets next/image optimise and lazy-load them properly instead of shipping raw
    // <img> tags, which is what the lint rule is warning about.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "i9.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "yt3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
