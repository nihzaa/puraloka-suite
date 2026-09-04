"use client";

/**
 * PROCUREMENT — primitif bersama seluruh bagian modul.
 *
 * ── Kenapa berkas ini ada
 *
 * Sampai 2026-08-07 modul ini hidup dalam SATU berkas 2.464 baris dengan
 * delapan tab. `Modal`, `Input`, `Select`, `Btn`, dan `Badge` didefinisikan di
 * puncaknya dan dipakai delapan tab di bawahnya. Begitu tab dipecah jadi rute,
 * kelimanya harus tinggal di satu tempat — kalau tidak, tiap halaman menyalin
 * versinya sendiri dan modul kembali punya lima `Modal` yang sedikit berbeda.
 *
 * Itu bukan kekhawatiran teoretis: `dasar.tsx` lahir persis karena 59 halaman
 * membangun kartu dan tabelnya masing-masing.
 *
 * ── Kenapa TIDAK semuanya diganti komponen `dasar.tsx`
 *
 * Tabel SUDAH diganti — `<Tabel>` dari `@/components/dasar` dipakai di seluruh
 * bagian, dan itu menghapus sembilan tabel HTML mentah sekaligus. Yang tetap
 * tinggal di sini adalah `Modal`/`Input`/`Select`/`Btn`: bentuknya sudah
 * dipakai puluhan tempat di modul ini dengan prop yang spesifik (`loading`,
 * `variant="danger"`), dan menukarnya di tengah pemecahan halaman berarti dua
 * perubahan berisiko bercampur dalam satu langkah.
 */

import { createPortal } from "react-dom";
import { X, RefreshCw } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { Pilihan, type PropsPilihan } from "@/components/pilihan";

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT
// ═══════════════════════════════════════════════════════════════════════════

export const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);

export const fmtDate = (s: string) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

/**
 * Rupiah ringkas untuk kartu KPI — "Rp 2,5 M", bukan "Rp 2.500.000.000".
 *
 * Angka penuh tak muat di kartu KPI dan memaksa ukuran fontnya turun sampai
 * tak terbaca. Di kartu, besaran yang penting; angka pastinya ada di daftar.
 */
export const fmtRingkas = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} jt`;
  if (abs >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} rb`;
  return `Rp ${n.toLocaleString("id-ID")}`;
};

// ═══════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════

export const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  draft:              { label: "Draft",         color: C.mid,     bg: "var(--surface-hover)" },
  submitted:          { label: "Diajukan",      color: C.warning, bg: C.warningBg },
  approved:           { label: "Disetujui",     color: C.success, bg: C.successBg },
  rejected:           { label: "Ditolak",       color: C.danger,  bg: C.dangerBg },
  partially_ordered:  { label: "Sebagian PO",   color: C.info,    bg: C.infoBg },
  fully_ordered:      { label: "Sudah PO",      color: C.success, bg: C.successBg },
  sent:               { label: "Terkirim",      color: C.info,    bg: C.infoBg },
  confirmed:          { label: "Dikonfirmasi",  color: C.success, bg: C.successBg },
  partially_received: { label: "Sebagian",      color: C.warning, bg: C.warningBg },
  fully_received:     { label: "Lunas Terima",  color: C.success, bg: C.successBg },
  cancelled:          { label: "Dibatalkan",    color: C.danger,  bg: C.dangerBg },
  unpaid:             { label: "Belum Bayar",   color: C.danger,  bg: C.dangerBg },
  partial:            { label: "Sebagian",      color: C.warning, bg: C.warningBg },
  paid:               { label: "Lunas",         color: C.success, bg: C.successBg },
};

export function Badge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? { label: status, color: C.mid, bg: "var(--surface-hover)" };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 99, fontSize: 11,
      fontWeight: 600, color: s.color, background: s.bg,
    }}>
      {s.label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KARTU
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kartu isi. Bisa diklik lewat `onClick` — TAPI jangan pakai itu kalau di
 * dalamnya ada kontrol lain.
 *
 * ── Kenapa ada peringatan ini
 *
 * Diukur 2026-08-07 (`audit-a11y-runtime`): 9 pelanggaran `nested-interactive`
 * di `/procurement/permintaan` dan `/procurement/pesanan`. Kartunya bisa
 * diklik untuk membuka detail, dan di dalamnya ada tombol Submit/Setujui/Tolak.
 *
 * `stopPropagation` menangani tetikus dengan benar, jadi tak ada gejala yang
 * terlihat. Tapi pembaca layar mengumumkan kontrol di dalam kontrol — dan
 * pengguna papan tik menemukan fokus berpindah ke tempat yang tak diumumkan
 * sama sekali.
 *
 * Kalau kartunya berisi tombol: JANGAN beri `onClick` di sini. Jadikan satu
 * elemen di dalamnya (biasanya nomor dokumen) sebagai tombol pembuka —
 * "buka MR-001" jauh lebih jelas diumumkan daripada "tombol" untuk seluruh
 * kartu.
 */
export function Card({ children, style, onClick }: {
  children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void;
}) {
  return (
    // `role`/`tabIndex`/`onKeyDown` hanya saat `onClick` diberikan: Card juga
    // dipakai sebagai pembungkus biasa, dan menandai wadah non-interaktif
    // sebagai tombol justru menyesatkan pembaca layar.
    <div
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "var(--pad-kartu-lega)", ...style }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();   // Spasi jangan menggulir halaman
          onClick();
        }
      }) : undefined}
    >
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kerangka modal.
 *
 * ⚠️ `useTutupEsc(onClose)` di baris pertama BUKAN kenyamanan — WCAG 2.1.2
 * "No Keyboard Trap" (Level A). Tanpa itu, pemakai papan tik terjebak: modal
 * terbuka, Tab berputar di dalamnya, dan satu-satunya jalan keluar adalah
 * mengambil tetikus.
 *
 * Ini pernah jadi regresi NYATA saat memecah halaman `/kas`: komentarnya ikut
 * tersalin dan menjanjikan Esc, tapi pemanggilannya tertinggal. `modal-esc-
 * ratchet.mjs` berlantai NOL justru karena itu.
 */
export function Modal({ title, onClose, children, width = 520 }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  useTutupEsc(onClose);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }} />
      <div style={{ position: "relative", background: C.surface, borderRadius: 14, width: "100%", maxWidth: width, maxHeight: "90vh", overflow: "auto", boxShadow: "var(--naik-3)" }}>
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: C.surface, zIndex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{title}</span>
          <button aria-label="Tutup" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.mid, padding: 4, borderRadius: 6 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDAN ISIAN
// ═══════════════════════════════════════════════════════════════════════════

export function Input({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
        {label}
        <input {...props} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, boxSizing: "border-box", outline: "none", marginTop: 4, background: props.disabled ? C.bg : C.surface, ...props.style }} />
      </label>
    </div>
  );
}

/*
  Pembungkus label + dropdown.

  Tipe props diubah dari `React.SelectHTMLAttributes<HTMLSelectElement>` ke
  `PropsPilihan` saat 209 select diganti: isinya kini komponen React, bukan
  elemen DOM, jadi meneruskan seluruh handler bertipe HTMLSelectElement tak
  lagi benar — dan tsc menolaknya, dengan alasan yang tepat.

  Nama fungsinya SENGAJA tetap `Select`: ia diimpor di banyak tempat, dan
  mengganti nama akan menyeret perubahan yang tak ada hubungannya dengan
  permintaan founder.
*/
export function Select({ label, children, ...props }: { label: string } & PropsPilihan) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4 }}>
        {label}
        <Pilihan {...props} style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, boxSizing: "border-box", marginTop: 4, background: C.surface }}>
          {children}
        </Pilihan>
      </label>
    </div>
  );
}

export function Btn({ children, variant = "primary", loading, ...props }: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // Tombol utama memakai GRADASI, sama dengan seluruh aplikasi.
  //
  // Sebelumnya `C.navy` rata. Bedanya halus per tombol, tetapi seluruh modul
  // pengadaan (8 halaman) jadi satu-satunya wilayah yang tombol utamanya
  // terlihat berbeda dari modul lain — dan yang berpindah antar modul
  // membacanya sebagai dua aplikasi yang ditempel, bukan satu.
  //
  // `--on-aksen` menggantikan `--surface`: teks tombol harus dipasangkan
  // dengan latar tombolnya, bukan dengan latar kartu. Keduanya kebetulan
  // sama-sama terang di mode terang, dan BERBEDA di mode gelap.
  const styles = {
    primary:   { background: "var(--grad-aksen)", color: "var(--on-aksen)", border: "none" },
    secondary: { background: C.surface,  color: C.text,           border: `1px solid ${C.border}` },
    danger:    { background: C.dangerBg, color: C.danger,         border: `1px solid ${C.danger}` },
  };
  return (
    <button disabled={loading || props.disabled} {...props} style={{ ...styles[variant], padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: loading || props.disabled ? "not-allowed" : "pointer", opacity: loading || props.disabled ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6, ...props.style }}>
      {loading ? <RefreshCw size={14} aria-hidden="true" style={{ animation: "spin 1s linear infinite" }} /> : null}{children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// KEADAAN MEMUAT
// ═══════════════════════════════════════════════════════════════════════════

/** Keadaan memuat yang seragam — dulu ditulis ulang di delapan tab. */
export function Memuat({ teks = "Memuat..." }: { teks?: string }) {
  return <div style={{ textAlign: "center", padding: 48, color: C.muted }}>{teks}</div>;
}

/**
 * Petak abu-abu selagi kartu KPI dimuat.
 *
 * Tingginya DIPAKU 118px agar sama dengan `KartuKPI` yang sudah terisi —
 * kerangka yang lebih pendek membuat seluruh halaman melompat saat data tiba,
 * dan lompatan itu memindahkan tombol tepat sebelum orang mengkliknya.
 */
export function KerangkaKpi({ jumlah = 4 }: { jumlah?: number }) {
  return (
    <>
      {Array.from({ length: jumlah }, (_, i) => (
        <div key={i} aria-hidden="true" style={{
          height: 118, borderRadius: 14,
          background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
        }} />
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GALAT
// ═══════════════════════════════════════════════════════════════════════════

/** Pesan error dari axios tanpa `any` — bentuknya dipersempit, bukan dipercaya. */
export function pesanError(e: unknown, bawaan: string): string {
  const r = (e as { response?: { data?: { error?: string } } })?.response;
  return r?.data?.error ?? bawaan;
}

// ═══════════════════════════════════════════════════════════════════════════
// PEMUATAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Menunda `setState` pemuat keluar dari fase render.
 *
 * ── Kenapa ini ada
 *
 * Pola `useEffect(() => { muat(); }, [muat])` dengan `muat()` yang diawali
 * `setLoading(true)` memanggil setState SINKRON dari badan effect. Itu memicu
 * render bertingkat — halaman merender, effect jalan, setState, halaman
 * merender lagi, semuanya sebelum satu piksel pun berubah. Pada modul dengan
 * sembilan halaman yang masing-masing memuat begitu dipasang, tiap satu
 * membayar render tambahan.
 *
 * `await tundaSatuTick()` di baris pertama pemuat memindahkannya ke luar fase
 * render dengan satu baris dan penundaan nol milidetik.
 *
 * ── Yang JUJUR harus disebut: ini tidak menyenangkan `react-hooks/set-state-
 *    in-effect`
 *
 * Aturan itu menelusuri pemanggilan secara STATIS dan melihat `setLoading` di
 * badan `muat`, tanpa memperhitungkan bahwa ia berada sesudah `await`. Jadi
 * warning-nya tetap muncul. Perbaikan runtime-nya nyata, penilaian lint-nya
 * tidak berubah — dan menuliskannya begini lebih jujur daripada mengklaim
 * penjaga hijau. Pola yang sama ada di `/kas` (`kas/akun/page.tsx:49`), yang
 * juga membawa warning ini.
 */
export function tundaSatuTick(): Promise<void> {
  return new Promise((selesai) => { setTimeout(selesai, 0); });
}

/** Kotak galat merah di dalam modal & halaman. */
export function KotakGalat({ pesan }: { pesan: string }) {
  return (
    <div role="alert" style={{
      background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 6,
      padding: "8px 12px", fontSize: 13, color: C.danger,
    }}>{pesan}</div>
  );
}
