import type { NextConfig } from "next";
import path from "node:path";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  // Deploy VPS (2026-08-29). Tanpa ini image Docker harus memuat SELURUH
  // node_modules monorepo — ratusan MB, mayoritas dependensi build yang tak
  // pernah dipakai saat runtime. `standalone` menyalin hanya yang benar-benar
  // di-import, jadi image-nya kecil dan permukaan serangnya jauh lebih sempit.
  //
  // ⚠ Konsekuensi yang mudah terlewat: `next start` TIDAK dipakai lagi di
  // produksi — yang dijalankan `node .next/standalone/apps/web/server.js`,
  // dan berkas statis (`.next/static`, `public/`) harus DISALIN manual ke
  // sebelahnya. Dockerfile-nya melakukan itu; kalau halaman tampil tanpa CSS,
  // itu penyebabnya.
  output: "standalone",
  // Monorepo: root jejak berkas ada di akar repo, bukan apps/web. Tanpa ini
  // Next menebak sendiri dan bisa melewatkan berkas paket workspace.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["@react-pdf/renderer"],
  allowedDevOrigins: ["192.168.1.13", "192.168.1.14"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
