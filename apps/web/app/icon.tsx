import { ImageResponse } from "next/og";
import { NAVY, DI_ATAS_NAVY } from "@/lib/warna-merek";

/**
 * FAVICON — logo perusahaan yang diunggah, bukan lambang statis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA RUTE, BUKAN BERKAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-09: *"saya minta favicon nya ganti dengan logo yg diupload
 * perusahaan"*.
 *
 * `app/icon.svg` (yang digantikan berkas ini) adalah lambang Puraloka yang
 * dipahat tetap. Itu benar selama aplikasinya dipakai satu perusahaan — dan
 * salah begitu ia dijual sebagai SaaS multi-tenant, karena tiap tenant
 * mengunggah logonya sendiri.
 *
 * Next.js memungut `app/icon.tsx` sebagai rute yang MENGHASILKAN gambar,
 * jadi ia bisa membaca basis data saat diminta.
 *
 * ── Kenapa TIDAK memakai logo sebagai gambar apa adanya
 *
 * Logo perusahaan diunggah dalam bentuk apa pun — PNG lebar, JPG transparan
 * palsu, SVG raksasa. Favicon dirender 16px, dan logo memanjang di 16px jadi
 * garis tak terbaca.
 *
 * Jadi logonya dipasang DI DALAM kotak berwarna merek: `objectFit: contain`
 * menjaga proporsinya, latar navy memberi bentuk yang tetap terbaca di tab
 * peramban terang maupun gelap.
 *
 * ── Kalau logo tak ada / gagal dimuat
 *
 * Jatuh ke inisial nama perusahaan di atas kotak navy — bukan kotak kosong.
 * Tab tanpa ikon terbaca sebagai halaman yang gagal dimuat, dan itu kesan
 * pertama yang mahal.
 *
 * ── Kenapa `revalidate` satu jam
 *
 * Logo perusahaan hampir tak pernah berubah; memanggil DB tiap kali favicon
 * diminta berarti satu query untuk tiap tab yang dibuka. Satu jam cukup
 * pendek supaya penggantian logo terlihat di hari yang sama, dan cukup
 * panjang supaya biayanya nol dalam pemakaian normal.
 */

export const runtime = "nodejs";
export const revalidate = 3600;
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/*
  Warna diambil dari `lib/warna-merek.ts`, BUKAN ditulis di sini.

  `hex-ratchet` menangkapnya (48 → 50), dan penjaga itu benar: hex yang
  ditulis langsung membuat white-label per tenant mustahil. Berkas
  `warna-merek.ts` dibuat justru untuk kasus seperti ini — tempat yang
  secara teknis TAK BISA memakai `var(--token)` karena dirender di server
  sebelum CSS mana pun ada. `uji-token-merek.mjs` menjaganya tetap sinkron
  dengan `globals.css`.
*/

/**
 * Ambil logo + nama perusahaan dari API.
 *
 * Lewat HTTP, bukan koneksi DB langsung: `apps/web` tak punya kredensial
 * basis data sama sekali, dan memberinya kredensial hanya demi favicon
 * berarti membuka jalur baru ke DB dari lapisan yang selama ini tak
 * memilikinya.
 */
async function ambilMerek(): Promise<{ logo: string | null; nama: string }> {
  const basis = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  try {
    const r = await fetch(`${basis}/api/v1/public/merek`, {
      next: { revalidate: 3600 },
    });
    if (!r.ok) return { logo: null, nama: "Puraloka" };
    const j = (await r.json()) as { logo_url?: string | null; nama?: string };
    return { logo: j.logo_url ?? null, nama: j.nama || "Puraloka" };
  } catch {
    // Favicon TIDAK BOLEH menggagalkan render halaman. Kegagalan jaringan
    // apa pun jatuh ke inisial.
    return { logo: null, nama: "Puraloka" };
  }
}

export default async function Icon() {
  const { logo, nama } = await ambilMerek();
  const inisial = nama.trim().charAt(0).toUpperCase() || "P";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: NAVY,
          // Sudut membulat mengikuti bentuk ikon aplikasi modern; di 16px ia
          // nyaris tak terlihat, tetapi di 64px (tab yang di-pin) terasa.
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logo}
            alt=""
            width={52}
            height={52}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 700,
              color: DI_ATAS_NAVY,
              letterSpacing: "-0.02em",
            }}
          >
            {inisial}
          </div>
        )}
      </div>
    ),
    size,
  );
}
