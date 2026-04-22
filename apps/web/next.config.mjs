/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The editor + Tiptap + dnd-kit chunks are large; transpile our workspace
  // packages so Next properly bundles their ESM output.
  transpilePackages: [
    '@lettera/core',
    '@lettera/editor',
    '@lettera/renderer',
    '@lettera/sdk',
    '@lettera/blocks-standard',
  ],
};

export default nextConfig;
