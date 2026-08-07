"use client";

// ============================================================================
// PENANDA DATA DARI CACHE — sisi BACA dari F4-3 (TUNDA kelompok G).
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI WAJIB ADA
// ══════════════════════════════════════════════════════════════════════════
//
// `cache-baca.ts` membuat halaman TETAP TERBACA tanpa sinyal. Tanpa penanda,
// itu justru berbahaya: yang membacanya melihat daftar material lengkap dan
// mengira sedang melihat keadaan hari ini — padahal MR yang disetujui dua jam
// lalu tak ada di sana.
//
// Data lama yang tak ditandai lebih berbahaya daripada layar kosong. Layar
// kosong membuat orang mencari sinyal; data lama membuat orang mengambil
// keputusan.
//
// ── Kenapa dua tingkat, bukan satu
//
// Cache berumur 3 menit dan cache berumur 3 hari sama-sama "bukan hari ini",
// tapi menuntut tindakan berbeda: yang pertama boleh dipakai bekerja, yang
// kedua harus dicari sinyalnya dulu. Ambangnya `AMBANG_BASI_MENIT` (60), dan
// dinyatakan lewat warna DAN kata — bukan warna saja (WCAG 1.4.1).
// ============================================================================

import { WifiOff, CloudOff } from "lucide-react";
import { C } from "@/lib/warna-ui";
import { labelUsia } from "@/lib/cache-baca";

export interface PenandaCacheProps {
  /** `false` bila data baru saja diambil dari jaringan — komponen tak dirender. */
  dariCache: boolean;
  /** Usia data dalam menit. */
  usiaMenit: number | null;
  /** `true` bila melewati ambang basi. */
  basi: boolean;
  /** Apa yang sedang ditampilkan, mis. "Permintaan material". */
  perihal?: string;
}

/**
 * Pita penanda bahwa data berasal dari cache, bukan dari server.
 *
 * Dirender HANYA saat `dariCache` — saat jaringan berhasil, tak ada yang
 * perlu diperingatkan, dan pita permanen akan diabaikan orang persis saat ia
 * paling perlu dibaca.
 */
export function PenandaCache({ dariCache, usiaMenit, basi, perihal }: PenandaCacheProps) {
  if (!dariCache) return null;

  const nada = basi ? "danger" : "warning";
  const Ikon = basi ? CloudOff : WifiOff;

  return (
    <div
      role="status"
      style={{
        background: `var(--${nada}-bg)`,
        border: `1px solid var(--${nada}-border)`,
        borderRadius: 12,
        padding: "10px 14px",
        marginBottom: "var(--gap-bagian)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Ikon size={16} aria-hidden="true" style={{ color: `var(--${nada})`, flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
        <strong style={{ color: `var(--${nada})` }}>
          {basi
            ? `Data tersimpan, sudah lama — ${labelUsia(usiaMenit)}`
            : `Data tersimpan — diambil ${labelUsia(usiaMenit)}`}
        </strong>
        <div style={{ marginTop: 2, color: C.mid }}>
          {basi ? (
            <>
              {perihal ?? "Daftar ini"} ditampilkan dari simpanan di perangkat karena
              server tak bisa dihubungi, dan simpanannya <strong>sudah lewat satu jam</strong>.
              Perubahan yang terjadi sesudah itu tidak terlihat di sini — cari sinyal
              sebelum mengambil keputusan yang sulit dibatalkan.
            </>
          ) : (
            <>
              {perihal ?? "Daftar ini"} ditampilkan dari simpanan di perangkat karena
              server tak bisa dihubungi. Perubahan yang terjadi sesudah waktu di atas
              belum terlihat.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
