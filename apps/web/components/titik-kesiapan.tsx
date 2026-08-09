"use client";

/**
 * TITIK KESIAPAN — penanda status halaman di sidebar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder 2026-08-09: *"untuk semua menu/submenu yg ada di taksonomi juga
 * daftarkan ada ke sidebar, dan untuk status kesiapan halamannya berikan
 * label dulu aja biar keliatan, nanti kalo udh selesai baru nanti nya bisa
 * dihapus lagi"*.
 *
 * Migrasi 232 R-3 dulu melarang menu tanpa halaman, dengan alasan yang sah:
 * menu yang belum dibangun mengecewakan saat diklik. Permintaan di atas
 * kebalikannya — supaya yang belum digarap tak terlupa.
 *
 * Keduanya bisa dipenuhi sekaligus dengan MENANDAI alih-alih menyembunyikan:
 * orang tahu sebelum mengklik, dan yang belum ada tetap terlihat di peta.
 *
 * ── Kenapa titik, bukan badge teks
 *
 * Sidebar hanya 196px. Badge "Rencana" memakan ~54px — cukup untuk memotong
 * nama menu seperti "Rekonsiliasi Material" tepat di bagian yang
 * membedakannya. Titik 6px tak mengubah tinggi baris maupun titik potong
 * teks.
 *
 * ── Warna BUKAN satu-satunya pembawa makna (WCAG 1.4.1)
 *
 * Tiap titik punya `title` dan `aria-label` yang menyebut statusnya dengan
 * kata. Pemakai yang tak bisa membedakan abu dari kuning tetap mendapat
 * informasinya — dan itu bukan kasus langka pada layar laptop murah di bawah
 * cahaya lapangan.
 */

const GAYA: Record<string, { warna: string; kata: string }> = {
  // `hidup` sengaja TIDAK punya entri — lihat komponen di bawah.
  sebagian: { warna: "var(--warning)", kata: "Sebagian fitur belum ada" },
  rencana: { warna: "var(--text-muted)", kata: "Halaman belum dibangun" },
};

export function TitikKesiapan({ kesiapan }: { kesiapan?: string | null }) {
  /*
    Halaman yang HIDUP tak diberi titik sama sekali.

    Godaannya memberi titik hijau supaya "lengkap", tetapi 90 dari 102 menu
    berstatus hidup — sembilan puluh titik hijau adalah kebisingan yang
    membuat dua belas titik yang benar-benar berarti tenggelam.

    Penanda hanya berguna kalau ia menandai sesuatu yang MENYIMPANG.
  */
  const g = kesiapan ? GAYA[kesiapan] : undefined;
  if (!g) return null;

  return (
    <span
      title={g.kata}
      aria-label={g.kata}
      role="img"
      style={{
        width: 6, height: 6, borderRadius: "50%",
        background: g.warna, flexShrink: 0,
        // `marginInlineStart: auto` mendorongnya ke ujung kanan baris tanpa
        // memaksa lebar tetap — nama menu tetap memakai seluruh sisa ruang.
        marginInlineStart: "auto",
      }}
    />
  );
}
