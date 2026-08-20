/**
 * Ambil logo + nama perusahaan dari API — dipakai favicon (`app/icon.tsx`)
 * dan ikon PWA (`app/icon-192/route.tsx`, `app/icon-512/route.tsx`,
 * `app/manifest.ts`). SATU fungsi, tiga konsumen — supaya ikon app dan
 * favicon tak pernah menampilkan logo yang berbeda untuk company yang sama.
 *
 * Lewat HTTP, bukan koneksi DB langsung: `apps/web` tak punya kredensial
 * basis data sama sekali.
 */
export async function ambilMerek(): Promise<{ logo: string | null; nama: string }> {
  const basis = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const r = await fetch(`${basis}/api/v1/public/merek`, {
      next: { revalidate: 3600 },
    });
    if (!r.ok) return { logo: null, nama: "Puraloka" };
    const j = (await r.json()) as { logo_url?: string | null; nama?: string };
    return { logo: j.logo_url ?? null, nama: j.nama || "Puraloka" };
  } catch {
    // Ikon TIDAK BOLEH menggagalkan render halaman. Kegagalan jaringan
    // apa pun jatuh ke inisial.
    return { logo: null, nama: "Puraloka" };
  }
}
