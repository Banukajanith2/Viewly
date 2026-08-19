import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
