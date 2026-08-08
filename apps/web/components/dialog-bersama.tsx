"use client";

// ============================================================================
// DIALOG BERSAMA — satu bentuk modal untuk seluruh dashboard.
//
// ══════════════════════════════════════════════════════════════════════════
// KENAPA KOMPONEN INI ADA
// ══════════════════════════════════════════════════════════════════════════
//
// Diukur 2026-08-08, enam modal di `components/`:
//
//     milestone-modal.tsx        293 baris   role=0  esc=0  <dialog>=0
//     progress-log-modal.tsx     664 baris   role=0  esc=0  <dialog>=0
//     termin-payment-modal.tsx   541 baris   role=0  esc=0  <dialog>=0
//     (dan tiga lainnya sama)
//
// Semuanya `<div style={{ position: 'fixed', inset: 0 }}>`. Artinya:
//
//   • **Fokus tidak terkunci.** Tab dari dalam modal berpindah ke elemen di
//     halaman DI BELAKANGNYA — yang tak terlihat dan tak bisa ditunjuk.
//   • **Esc tidak menutup.** Satu-satunya jalan keluar adalah menemukan
//     tombol X dengan mouse.
//   • **Pembaca layar tak diberi tahu ini dialog.** Ia membacanya sebagai
//     bagian biasa halaman, jadi tak ada pengumuman "masuk dialog" dan tak
//     ada batas yang jelas.
//
// ── Kenapa ini tak pernah berbunyi di CI
//
// `audit-a11y-runtime.mjs` memindai HALAMAN. Modal hanya ada di DOM setelah
// dibuka, dan penjaga itu tak pernah mengkliknya. Enam modal lolos bukan
// karena bersih, melainkan karena tak pernah dilihat.
//
// ── Kenapa `<dialog>` bawaan, bukan div + kode fokus sendiri
//
// `showModal()` memberi tiga hal yang paling sering salah kalau ditulis
// tangan, dan salahnya tak terlihat sampai seseorang memakai keyboard:
// fokus terkunci di dalam, lapisan teratas (di atas apa pun, tanpa perang
// z-index), dan Esc. Pola yang sama sudah terbukti di situs publik
// (`apps/web-publik`, axe 0 pelanggaran dengan dialog TERBUKA).
//
// ── Yang komponen ini TIDAK lakukan
//
// Ia tak mengatur isi. Form, tabel, dan tombolnya milik pemanggil — komponen
// ini hanya wadah yang benar. Enam modal lama sengaja TIDAK dipindahkan
// sekaligus: itu perubahan besar yang tak bisa ditinjau sungguh-sungguh dalam
// satu kali. Yang baru memakai ini; yang lama pindah saat berkasnya disentuh.
// ============================================================================

import { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export interface DialogBersamaProps {
  /** Dialog terbuka? Dikendalikan pemanggil. */
  terbuka: boolean;
  /** Dipanggil saat ditutup lewat JALUR APA PUN — tombol, Esc, atau backdrop. */
  onTutup: () => void;
  /** Judul dialog. WAJIB: ia yang menamai dialog untuk pembaca layar. */
  judul: string;
  /** Kalimat penjelas di bawah judul. */
  keterangan?: string;
  children: React.ReactNode;
  /** Tombol aksi di kaki dialog. */
  kaki?: React.ReactNode;
  /** Lebar maksimum isi. Default cukup untuk form satu kolom. */
  lebar?: number;
}

export function DialogBersama({
  terbuka, onTutup, judul, keterangan, children, kaki, lebar = 560,
}: DialogBersamaProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const idJudul = useId();
  const idKet = useId();

  // `showModal()`, bukan `open` atribut: hanya yang pertama memberi fokus
  // terkunci dan lapisan teratas. `open` saja merender dialog sebagai elemen
  // biasa dalam aliran halaman.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (terbuka && !d.open) d.showModal();
    if (!terbuka && d.open) d.close();
  }, [terbuka]);

  // Menyelaraskan state pemanggil saat dialog ditutup lewat Esc — jalur yang
  // TIDAK melewati tombol tutup kita. Tanpa ini, `terbuka` tetap `true` di
  // React sementara dialognya sudah tertutup, dan membukanya lagi tak bekerja.
  const onClose = useCallback(() => onTutup(), [onTutup]);

  return (
    <dialog
      ref={ref}
      className="dialog-bersama"
      aria-labelledby={idJudul}
      aria-describedby={keterangan ? idKet : undefined}
      onClose={onClose}
      onClick={(e) => {
        // Klik backdrop menutup. `e.target === e.currentTarget` benar HANYA
        // untuk backdrop, karena isinya dibungkus elemen sendiri.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      style={{ maxWidth: lebar }}
    >
      <div className="dialog-bersama-isi">
        <div className="dialog-bersama-kepala">
          <div>
            <h2 id={idJudul}>{judul}</h2>
            {keterangan && <p id={idKet}>{keterangan}</p>}
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Tutup"
            className="dialog-bersama-x"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="dialog-bersama-badan">{children}</div>

        {kaki && <div className="dialog-bersama-kaki">{kaki}</div>}
      </div>
    </dialog>
  );
}
