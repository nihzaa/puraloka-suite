import type { MetadataRoute } from "next";
import { NAVY } from "@/lib/warna-merek";
import { ambilMerek } from "@/lib/merek-perusahaan";

/**
 * Manifest PWA — dinamis per-tenant (nama app dari company), BUKAN
 * public/manifest.json statis. Ikon menunjuk app/icon-192 dan
 * app/icon-512 (Task 1) yang sama-sama generate dari logo per-company.
 *
 * `start_url` ke /pm-portal: layout portal itu sendiri yang redirect ke
 * /login kalau belum ada sesi (pm-portal/layout.tsx) — start_url tak
 * perlu tahu status login.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { nama } = await ambilMerek();

  return {
    name: `${nama} Suite`,
    short_name: nama,
    description: "Manajemen konstruksi, dari lapangan sampai laporan.",
    start_url: "/pm-portal",
    display: "standalone",
    background_color: NAVY,
    theme_color: NAVY,
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
