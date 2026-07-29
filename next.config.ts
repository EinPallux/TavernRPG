import type { NextConfig } from 'next';

/**
 * TavernRPG is a client-rendered, local-first game (docs/tech/architecture.md §1):
 * no server runtime, no database — Vercel serves it as static output.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Game art is copied into public/assets by scripts/sync-assets.mjs and served
  // statically; Next's image optimizer is unnecessary for a static deploy.
  images: { unoptimized: true },
  // Type errors must fail the build; linting is its own CI step (`npm run lint`).
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
