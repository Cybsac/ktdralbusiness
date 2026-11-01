/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { instrumentationHook: true },
  output: "standalone", // Mantenemos standalone para imágenes más ligeras en Docker
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "upmqzhfnigsihpcclsao.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  eslint: {
    // Permitir build aunque existan errores de lint (para smoke tests rápidos)
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["luxon"], // Transpilar luxon para compatibilidad con SSR
  async redirects() {
    return [
      {
        source: "/redeem/:path*",
        destination: "/r/:path*",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/reservatucumple",
        destination: "/marketing/birthdays/reservar",
      },
    ];
  },
};
export default function configuration(phase) {
  // Workers inherit this flag: scheduled storage maintenance must never run during a build.
  if (phase === "phase-production-build") {
    process.env.NEXT_BUILD = "1";
    process.env.NEXT_PHASE = phase;
  }
  return nextConfig;
}
