"use client";

/**
 * KERANGKA MODAL FORM — satu bentuk untuk semua aksi tulis.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Menutup modul-modul "etalase" (`docs/execution/KEMATANGAN-MODUL.md`) berarti
 * menambahkan banyak form dalam waktu singkat. Dua berkas pertama
 * (`kepatuhan-aksi.tsx`, lalu `pengadaan-lanjutan-aksi.tsx`) sudah menyalin
 * kerangka yang sama persis: latar `rgba(0,0,0,0.4)`, `role="dialog"`,
 * `useTutupEsc`, gaya label & input, kotak galat.
 *
 * Salinan ketiga adalah titik di mana salinan-salinan itu mulai menyimpang —
 * dan yang menyimpang pertama biasanya `useTutupEsc`, karena ia satu baris yang
 * mudah terlewat saat menyalin. Repo ini sudah pernah kehilangan jalan keluar
 * papan tik di 36 modal sekaligus (JOURNAL 2026-08-01); `modal-esc-ratchet`
 * menjaga KEBERADAAN panggilannya, dan kerangka bersama membuatnya mustahil
 * terlewat sejak awal.
 *
 * ── Yang SENGAJA tidak dijadikan bersama
 *
 * Isi form-nya. Tiap modul punya aturan sendiri tentang kolom mana yang wajib,
 * kapan tombol simpan mati, dan kalimat apa yang menjelaskan penolakannya —
 * dan aturan itulah yang bernilai. Kerangka yang mencoba menyeragamkan isi
 * akan memaksa aturan yang berbeda dituliskan sebagai konfigurasi, yang selalu
 * berakhir lebih sulit dibaca daripada form yang ditulis apa adanya.
 */

import { useCallback, useEffect, useRef } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { C } from "@/lib/warna-ui";

export const gayaLabel: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 4,
};

export const gayaInput: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box",
  background: "var(--surface)", color: C.text, fontFamily: "inherit",
};

export const gayaGalat: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.5,
  background: C.redBg, border: `1px solid ${C.redBorder}`, color: C.onDangerBg,
};

/**
 * Ambil kalimat galat dari balasan API.
 *
 * Pesan server DIDAHULUKAN atas kalimat bawaan, dan itu keputusan yang
 * disengaja: rute-rute di repo ini menulis penolakan yang menjelaskan sebabnya
 * beserta jalan keluarnya ("pemutus harus orang lain", "sisa kuota tinggal
 * 40"). Menggantinya dengan kalimat umum di layar membuang keterangan yang
 * paling berguna, dan pemakai tinggal menebak.
 */
export function pesanGalat(e: unknown, bawaan: string) {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? bawaan;
}

/**
 * Kerangka modal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * `<dialog>` BAWAAN, BUKAN DIV BERLAPIS — dan itu koreksi, bukan pilihan gaya
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Versi pertama komponen ini menggambar `<div style={{ position: 'fixed',
 * inset: 0 }}>` sendiri, dan `audit-modal-dialog` MERAH karenanya — 39 dari
 * ambang 37. Dua tambahan itu milik saya: berkas ini dan `/keuangan/ipc`.
 *
 * Penjaganya benar, dan alasannya persis yang membuat komponen bersama ini
 * ada: `showModal()` memberi tiga hal yang paling sering salah kalau ditulis
 * tangan, dan salahnya TAK TERLIHAT sampai seseorang memakai papan tik —
 *
 *   • fokus terkunci di dalam dialog (Tab tak lolos ke halaman di belakang)
 *   • lapisan teratas, tanpa perang z-index
 *   • Esc menutup
 *
 * Ironinya lengkap: berkas ini dibuat untuk memastikan `useTutupEsc` tak
 * terlupa, lalu menulis ulang dua hal lain yang seharusnya juga tak perlu
 * diingat siapa pun.
 *
 * `useTutupEsc` TETAP dipanggil meski `<dialog>` sudah menangani Esc sendiri.
 * Keduanya memanggil `onClose` yang sama, jadi rangkap di sini tak berakibat —
 * dan `modal-esc-ratchet` menjaga KEBERADAAN panggilannya, bukan keperluannya.
 *
 * ── Kenapa tak memakai `DialogBersama` langsung
 *
 * `DialogBersama` membawa kepala dialog beserta tombol X ber-label "Tutup".
 * Beberapa form di sini punya tombol kaki bernama "Tutup" juga, dan dua tombol
 * bernama sama dalam satu dialog membingungkan pembaca layar. Yang dipakai
 * ulang adalah KELASNYA (`.dialog-bersama`, termasuk `::backdrop`-nya), bukan
 * kepalanya — jadi bentuk dan latarnya tetap satu di seluruh dashboard.
 */
export function ModalDasar({ judulId, judul, lebar, onClose, children }: {
  judulId: string;
  judul: string;
  /** Lebar maksimum dalam px. Bawaan 520. */
  lebar?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useTutupEsc(onClose);
  const ref = useRef<HTMLDialogElement>(null);

  // `showModal()`, bukan atribut `open`: hanya yang pertama memberi fokus
  // terkunci dan lapisan teratas. `open` saja merender dialog sebagai elemen
  // biasa dalam aliran halaman — terlihat sama, berperilaku sama sekali beda.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  // Menyelaraskan state pemanggil saat dialog ditutup lewat Esc — jalur yang
  // TIDAK melewati tombol mana pun. Tanpa ini, pemanggil tetap menganggapnya
  // terbuka dan membukanya lagi tak bekerja.
  const tutup = useCallback(() => onClose(), [onClose]);

  // TIDAK ada tutup-lewat-klik-backdrop di sini, dan itu disengaja.
  //
  // `DialogBersama` mengizinkannya karena isinya sering cuma bacaan. Yang
  // dibungkus kerangka INI hampir selalu form berisi ketikan — nilai
  // penawaran, alasan penolakan klaim, tempelan rekening koran sepanjang
  // seratus baris. Satu klik meleset di tepi layar membuang semuanya tanpa
  // satu pun konfirmasi.
  //
  // Jalan keluarnya tetap dua: Esc (ditangani `<dialog>` sendiri, plus
  // `useTutupEsc`) dan tombol Batal — keduanya tindakan yang disengaja.
  return (
    <dialog
      ref={ref}
      className="dialog-bersama"
      aria-labelledby={judulId}
      onClose={tutup}
      style={{ maxWidth: lebar ?? 520 }}
    >
      <div style={{
        padding: 20, maxHeight: "88vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <h2 id={judulId} style={{
          margin: 0, fontSize: 15, fontWeight: 700, color: C.text,
          fontFamily: "var(--font-display)",
        }}>{judul}</h2>
        {children}
      </div>
    </dialog>
  );
}

/**
 * Tombol modal.
 *
 * `mati` memakai `disabled` sungguhan, bukan sekadar warna kelabu: tombol yang
 * hanya TAMPAK mati tetap bisa ditekan papan tik, dan form yang menolak lewat
 * warna saja tak menolak siapa pun yang tak memakai tetikus.
 */
export function TombolModal({ utama, onClick, mati, children }: {
  utama?: boolean; onClick: () => void; mati?: boolean; children: React.ReactNode;
}) {
  const hidup = !mati;
  return (
    <button type="button" onClick={onClick} disabled={mati} style={{
      padding: "8px 16px", borderRadius: 6, fontSize: 13,
      fontWeight: utama ? 600 : 400,
      border: utama ? "none" : `1px solid ${C.border}`,
      background: utama ? (hidup ? "var(--grad-aksen)" : "var(--surface-hover)") : "var(--surface)",
      color: utama ? (hidup ? "var(--on-aksen)" : C.muted) : C.mid,
      cursor: hidup ? "pointer" : "not-allowed",
    }}>{children}</button>
  );
}

/** Baris tombol di kaki modal — Batal selalu kiri, aksi utama selalu kanan. */
export function KakiModal({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 2 }}>
      {children}
    </div>
  );
}
