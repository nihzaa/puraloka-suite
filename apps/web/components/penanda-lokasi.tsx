"use client";

/**
 * PENANDA LOKASI — menampilkan koordinat foto dan seberapa jauh dari proyek.
 *
 * ── Yang dijaga di komponen ini
 *
 * **Tiga keadaan, bukan dua.** "Di lokasi", "jauh dari lokasi", dan **"tak
 * diketahui"** — yang terakhir bukan varian dari yang kedua. Foto tanpa
 * koordinat, atau dengan GPS yang meleset lebih jauh daripada radius proyek,
 * TIDAK BOLEH ditampilkan sebagai "jauh dari lokasi": itu tuduhan, dan
 * tuduhan yang salah merusak kepercayaan pada seluruh sistem.
 *
 * **Akurasi selalu disebut.** Titik yang meleset 300 m dan titik yang meleset
 * 5 m terlihat sama di peta. Menyebut "±300 m" adalah satu-satunya cara
 * pembaca tahu seberapa jauh ia boleh menyimpulkan.
 */

import { MapPin, MapPinOff, TriangleAlert } from "lucide-react";
import { C } from "@/lib/warna-ui";

export interface LokasiFoto {
  lintang: number | null;
  bujur: number | null;
  akurasi_m: number | null;
  sumber_lokasi: "perangkat" | "exif" | "manual" | null;
}

export interface AcuanProyek {
  lintang: number | null;
  bujur: number | null;
  radius_lokasi_m: number | null;
}

/** Salinan `jarakMeter` dari `apps/api/src/lib/geotag.ts`.
 *
 * Digandakan dengan sengaja: menariknya dari API berarti satu permintaan
 * jaringan untuk setiap foto di galeri, dan rumusnya sepuluh baris yang tak
 * akan berubah. Kalau suatu hari ia berubah, `uji-geotag-sinkron.mjs`
 * memerahkan CI — itu yang menjaga keduanya tetap sama. */
function jarakMeter(
  a: { lintang: number; bujur: number },
  b: { lintang: number; bujur: number },
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lintang - a.lintang);
  const dLng = rad(b.bujur - a.bujur);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lintang)) * Math.cos(rad(b.lintang)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

function jarakTerbaca(m: number): string {
  // Dibulatkan ke puluhan di bawah 1 km: GPS ponsel tak pernah setepat satu
  // meter, dan "347 m" memberi kesan presisi yang tak dimiliki angkanya.
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

const SUMBER_LABEL: Record<string, string> = {
  perangkat: "GPS saat memotret",
  exif: "dari metadata berkas",
  manual: "diketik manual — bukan bukti lokasi",
};

export function PenandaLokasi({ foto, proyek, ringkas = false }: {
  foto: LokasiFoto;
  proyek?: AcuanProyek | null;
  /** Bentuk pendek untuk kartu foto; bentuk penuh untuk tampilan detail. */
  ringkas?: boolean;
}) {
  const punya = foto.lintang != null && foto.bujur != null;

  if (!punya) {
    return (
      <span title="Foto ini diunggah tanpa koordinat — bisa karena sinyal GPS tak ada, atau izin lokasi ditolak."
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 11, color: C.muted,
        }}>
        <MapPinOff size={11} aria-hidden="true" />
        {ringkas ? "—" : "tanpa lokasi"}
      </span>
    );
  }

  const radius = proyek?.radius_lokasi_m ?? 500;
  const punyaAcuan = proyek?.lintang != null && proyek?.bujur != null;
  const jarak = punyaAcuan
    ? jarakMeter(
        { lintang: foto.lintang!, bujur: foto.bujur! },
        { lintang: proyek!.lintang!, bujur: proyek!.bujur! },
      )
    : null;

  // Akurasi lebih besar dari radius → titiknya tak bisa membedakan dalam dari
  // luar. Hasilnya "tak bisa dinilai", bukan "di luar".
  const akurasiCukup = foto.akurasi_m == null || foto.akurasi_m <= radius;
  const diLokasi = jarak != null && akurasiCukup ? jarak <= radius : null;

  const warna =
    diLokasi === true ? C.green
    : diLokasi === false ? C.yellow
    : C.mid;

  const judul = [
    `${foto.lintang!.toFixed(6)}, ${foto.bujur!.toFixed(6)}`,
    foto.akurasi_m != null ? `akurasi ±${Math.round(foto.akurasi_m)} m` : "akurasi tak diketahui",
    foto.sumber_lokasi ? SUMBER_LABEL[foto.sumber_lokasi] : null,
    !punyaAcuan ? "proyek belum punya titik acuan" : null,
    diLokasi === null && punyaAcuan && !akurasiCukup
      ? `akurasi lebih besar dari radius proyek (${radius} m) — jarak tak bisa disimpulkan`
      : null,
  ].filter(Boolean).join(" · ");

  if (ringkas) {
    return (
      <span title={judul} style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        fontSize: 11, color: warna, fontVariantNumeric: "tabular-nums",
      }}>
        {diLokasi === false
          ? <TriangleAlert size={11} aria-hidden="true" />
          : <MapPin size={11} aria-hidden="true" />}
        {jarak != null ? jarakTerbaca(jarak) : "ada lokasi"}
      </span>
    );
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 3,
      fontSize: 11.5, color: C.mid,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: warna }}>
        {diLokasi === false
          ? <TriangleAlert size={12} aria-hidden="true" />
          : <MapPin size={12} aria-hidden="true" />}
        <strong>
          {diLokasi === true ? "Di lokasi proyek"
            : diLokasi === false ? `${jarakTerbaca(jarak!)} dari lokasi proyek`
            : !punyaAcuan ? "Ada koordinat"
            : "Lokasi tak bisa dipastikan"}
        </strong>
      </span>

      <span style={{ fontVariantNumeric: "tabular-nums", color: C.muted }}>
        {foto.lintang!.toFixed(6)}, {foto.bujur!.toFixed(6)}
        {foto.akurasi_m != null && <> · ±{Math.round(foto.akurasi_m)} m</>}
      </span>

      {/* Sumber koordinat disebut karena derajat kepercayaannya berbeda.
          Yang diketik manual bukan bukti — dan itu harus terbaca, bukan
          disamarkan jadi pin yang terlihat sama dengan GPS. */}
      {foto.sumber_lokasi && (
        <span style={{
          fontSize: 11,
          color: foto.sumber_lokasi === "manual" ? C.yellow : C.muted,
        }}>{SUMBER_LABEL[foto.sumber_lokasi]}</span>
      )}

      {!punyaAcuan && (
        <span style={{ fontSize: 11, color: C.muted }}>
          Isi titik acuan proyek untuk membandingkan jaraknya.
        </span>
      )}
      {punyaAcuan && !akurasiCukup && (
        <span style={{ fontSize: 11, color: C.muted }}>
          Akurasi GPS ({Math.round(foto.akurasi_m!)} m) lebih besar dari radius
          proyek ({radius} m) — jarak tak bisa disimpulkan.
        </span>
      )}
    </div>
  );
}
