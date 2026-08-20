import { ImageResponse } from "next/og";
import { NAVY, DI_ATAS_NAVY } from "@/lib/warna-merek";
import { ambilMerek } from "@/lib/merek-perusahaan";

/**
 * Ikon PWA 192×192 — dipakai manifest.json untuk "Add to Home Screen".
 * Pola SAMA PERSIS dengan app/icon.tsx (favicon 64×64): logo per-tenant,
 * jatuh ke inisial+navy kalau tak ada. JANGAN ganti ke logo statis
 * Puraloka — itu salah untuk tenant lain (lihat komentar app/icon.tsx
 * untuk alasan lengkapnya).
 */

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET() {
  const { logo, nama } = await ambilMerek();
  const inisial = nama.trim().charAt(0).toUpperCase() || "P";
  const size = 192;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: logo ? DI_ATAS_NAVY : NAVY,
          borderRadius: 42,
          overflow: "hidden",
        }}
      >
        {logo ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logo}
            alt=""
            width={size * 0.9}
            height={size * 0.9}
            style={{ objectFit: "contain" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              fontSize: 120,
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
    { width: size, height: size },
  );
}
