"use client";

/**
 * KAS — kerangka modul: judul, aksi global, dan navigasi antar-bagian.
 *
 * ── Kenapa layout, bukan tab di satu berkas
 *
 * Sebelum ini seluruh modul hidup dalam SATU berkas 1.537 baris dengan tiga
 * tab. Yang rusak dari itu bukan cuma ukurannya:
 *
 *   • Tab tak ada di URL — muat ulang kembali ke Akun Kas, dan "lihat
 *     pengeluaran yang menunggu" tak bisa dikirim sebagai tautan.
 *   • Membuka Akun Kas tetap mengunduh kode ketiga tab, termasuk pemuat
 *     pengeluaran yang menembak lima endpoint sekaligus.
 *   • Tiga tab terbuka semuanya bertuliskan "Kas" di bilah tab peramban.
 *
 * Rute nyata memperbaiki ketiganya, dan Next.js memberi pemecahan kode per
 * rute tanpa diminta. Polanya mengikuti `keuangan/layout.tsx` persis — modul
 * kedua yang dipecah tak boleh memperkenalkan pola ketiga.
 *
 * ── Kenapa tombol aksi di layout
 *
 * "Transfer" dan "Catat Pengeluaran" adalah aksi terhadap MODUL, bukan
 * terhadap bagian yang sedang dibuka — itu sebabnya di versi tab pun keduanya
 * berada di atas deretan tab. Menaruhnya di sini membuat keduanya tetap
 * terjangkau dari bagian mana pun, termasuk dari halaman Akun Kas tempat
 * orang baru menyadari saldonya tipis.
 *
 * ── Lencana: pernah direncanakan di sini, TIDAK jadi
 *
 * Bagian ini dulu berjudul "Kenapa lencana dimuat di sini" dan menjelaskan
 * `/api/v1/cash/summary` sebagai satu panggilan yang menjawab seluruh modul.
 * Penjelasannya benar sebagai rancangan, tetapi lencananya tak pernah dirender
 * — layout ini tidak memuat navigasi bagian. Yang tersisa hanya permintaannya.
 *
 * Dibuang 2026-08-11 (lihat catatan di badan fungsi). Bagian ini dipertahankan
 * dalam bentuk terkoreksi, bukan dihapus: penjelasan yang menyatakan sesuatu
 * ADA padahal sudah tidak lebih berbahaya daripada tak ada penjelasan sama
 * sekali — pembaca berikutnya akan mencarinya dan menyimpulkan ia rusak.
 */

import { useCallback, useState } from "react";
import { ArrowRightLeft, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { JudulBagian } from "@/components/judul-bagian";
import { CreateExpenseModal, CreateTransferModal } from "./_bersama/modal";
import type { CashAccount } from "./_bersama/tipe";

export default function KasLayout({ children }: { children: React.ReactNode }) {
  // ADR-004: capability, bukan nama jabatan. Diverifikasi ke `requirePermission`
  // di `routes/v1/cash.ts` — bukan ditebak dari nama tombolnya.
  const bolehTransfer = useIzin("cash:transfer:create");

  // `ringkas` DIBUANG bersama `muatRingkas` dan tiga pemanggilnya.
  //
  // `/api/v1/cash/summary` dipanggil saat layout dimuat DAN sesudah tiap
  // transfer/pengeluaran berhasil — hasilnya disimpan, lalu tak pernah dibaca
  // satu kali pun. Rencananya lencana navigasi (komentarnya masih menyebut
  // "lencana"), tetapi layout ini tak merender navigasi bagian.
  //
  // Endpoint-nya GET murni, jadi tak ada efek samping server yang hilang.
  // Yang dibuang adalah PERMINTAANNYA, bukan sekadar variabelnya: menghapus
  // `ringkas` sambil membiarkan fetch berjalan menghijaukan lint tanpa
  // memperbaiki apa pun — dan permintaan sia-sia itu jadi permanen karena tak
  // ada lagi yang menandainya.
  const [akun, setAkun] = useState<CashAccount[]>([]);
  const [bukaTransfer, setBukaTransfer] = useState(false);
  const [bukaPengeluaran, setBukaPengeluaran] = useState(false);


  const muatAkun = useCallback(() => {
    return api.get<{ accounts: CashAccount[] }>("/api/v1/cash/accounts")
      .then((r) => setAkun(r.data.accounts))
      .catch(() => {});
  }, []);



  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      <JudulBagian
        cadangan="Manajemen Kas"
        aksi={<>
            {bolehTransfer && (
              <button onClick={() => setBukaTransfer(true)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}>
                <ArrowRightLeft size={14} /> Transfer
              </button>
            )}
            <button onClick={() => setBukaPengeluaran(true)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
              borderRadius: 6, border: "none", background: "var(--grad-aksen)", color: "var(--surface)",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
            >
              <Plus size={14} /> Catat Pengeluaran
            </button>
        </>}
      />

      <div className="rise rise-2" style={{
        background: "var(--surface)", border: `1px solid ${C.border}`,
        borderRadius: 14, boxShadow: "var(--naik-1)", overflow: "hidden",
      }}>

        {/* Padding isi ADA DI SINI, satu tempat untuk seluruh bagian — pelajaran
            langsung dari `keuangan/layout.tsx`, tempat tiap bagian sempat
            menyediakan paddingnya sendiri dan menghasilkan tiga jarak berbeda. */}
        <div style={{ padding: "20px 24px 24px" }}>
          {children}
        </div>
      </div>

      {bukaTransfer && bolehTransfer && (
        <CreateTransferModal
          accounts={akun}
          onClose={() => setBukaTransfer(false)}
          onSuccess={() => { setBukaTransfer(false); void muatAkun(); }}
          onNeedAccounts={muatAkun}
        />
      )}
      {bukaPengeluaran && (
        <CreateExpenseModal
          accounts={akun.filter(a => a.type === "petty_cash" && a.is_active)}
          onClose={() => setBukaPengeluaran(false)}
          onSuccess={() => { setBukaPengeluaran(false); void muatAkun(); }}
          onNeedAccounts={muatAkun}
        />
      )}
    </div>
  );
}
