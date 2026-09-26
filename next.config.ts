import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The extension popup frames this route, so it has to be
        // embeddable from a chrome-extension:// origin. Scoped to
        // /popup alone — nothing else in the app should be frameable,
        // since a wallet that can be silently embedded is a wallet that
        // can be clickjacked.
        source: "/popup",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' chrome-extension: moz-extension:;",
          },
        ],
      },
      {
        source: "/((?!popup).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
