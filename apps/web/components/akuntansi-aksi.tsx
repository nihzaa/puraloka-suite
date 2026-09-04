"use client";

/**
 * AKUN BARU · STATUS INVOICE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * BAGAN AKUN YANG TAK BISA DITAMBAH ADALAH BAGAN AKUN ORANG LAIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `POST /gl/accounts` berdiri sejak GL-1c tanpa satu pun pemanggil. Tab
 * "Bagan Akun" menampilkan akun yang datang dari seed, dan tiap perusahaan
 * baru yang memakai aplikasi ini mewarisi bagan akun yang bukan miliknya —
 * tanpa cara menambahkan satu pun akun sendiri.
 *
 * Akibatnya bukan sekadar tak nyaman. Peta akun jurnal (`/akuntansi/
 * peta-akun`) menunjuk ke akun-akun ini; kalau akun yang dibutuhkan tak ada
 * dan tak bisa dibuat, penjurnalan otomatis berhenti dengan "peta akun belum
 * lengkap" yang tak punya jalan keluar.
 *
 * ── Tipe akun tak bisa diubah sesudah dibuat, dan itu DINYATAKAN
 *
 * Tipe menentukan akun itu muncul di neraca atau laba-rugi, dan saldo
 * normalnya debit atau kredit. Mengubahnya sesudah ada jurnal berarti
 * memindahkan angka dari satu laporan ke laporan lain — API tak
 * mengizinkannya, dan layar menyebutkannya SEBELUM disimpan, bukan sesudah.
 *
 * ── Induk wajib setipe, dan alasannya ditulis apa adanya
 *
 * API menolaknya dengan kalimat yang bagus: "induk bertipe beda membuat
 * laporan menjumlahkan aset ke dalam beban." Layar menyaring daftar induknya
 * mengikuti tipe yang dipilih — penolakan yang bisa dicegah sebelum diketik
 * lebih baik daripada yang dijelaskan sesudahnya.
 */

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  ModalDasar, TombolModal, KakiModal, gayaLabel, gayaInput, gayaGalat, pesanGalat,
} from "@/components/modal-dasar";
import { Pilihan } from "@/components/pilihan";

export type AkunRingkas = {
  id: string; code: string; name: string; type: string;
  parent_id: string | null;
};

/**
 * Lima tipe akun — diturunkan dari CHECK migrasi 167, bukan dikarang.
 *
 * Keterangannya menyebut LAPORAN tempat akun itu muncul, bukan definisi
 * akuntansi. Yang membuka layar ini sedang memutuskan tipe apa yang benar,
 * dan pertanyaan yang sebenarnya ia punya adalah "angka ini muncul di mana".
 */
const TIPE: Array<{ nilai: string; teks: string; jelas: string }> = [
  { nilai: "asset", teks: "Aset", jelas: "neraca · saldo normal debit" },
  { nilai: "liability", teks: "Liabilitas", jelas: "neraca · saldo normal kredit" },
  { nilai: "equity", teks: "Ekuitas", jelas: "neraca · saldo normal kredit" },
  { nilai: "revenue", teks: "Pendapatan", jelas: "laba-rugi · saldo normal kredit" },
  { nilai: "expense", teks: "Beban", jelas: "laba-rugi · saldo normal debit" },
];

export function ModalAkunBaru({ akun, onClose, onSukses }: {
  akun: readonly AkunRingkas[];
  onClose: () => void;
  onSukses: () => void;
}) {
  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [tipe, setTipe] = useState("asset");
  const [induk, setInduk] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  // Induk disaring mengikuti tipe. API menolak induk bertipe beda; menyaring
  // di sini berarti pilihan yang pasti ditolak tak pernah ditawarkan.
  const indukTersedia = useMemo(
    () => akun.filter((a) => a.type === tipe), [akun, tipe]);

  // Kode kembar ditolak basis (uq per company). Diperiksa di layar supaya
  // penolakannya muncul saat mengetik, bukan sesudah menekan simpan.
  const kodeTerpakai = useMemo(
    () => akun.some((a) => a.code.trim().toLowerCase() === kode.trim().toLowerCase()),
    [akun, kode]);

  const halangan =
    !kode.trim() ? "Kode akun wajib diisi."
    : kodeTerpakai ? `Kode "${kode.trim()}" sudah dipakai akun lain di badan usaha ini.`
    : !nama.trim() ? "Nama akun wajib diisi."
    : null;

  function gantiTipe(t: string) {
    setTipe(t);
    // Induk DILEPAS saat tipe berganti. Membiarkannya membuat muatan terkirim
    // dengan induk bertipe lain — ditolak API dengan galat yang terbaca
    // seperti kesalahan sistem, padahal layar yang membiarkannya.
    setInduk("");
  }

  async function simpan() {
    if (halangan || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.post("/api/v1/gl/accounts", {
        code: kode.trim(),
        name: nama.trim(),
        type: tipe,
        // Kosong dikirim `null`, bukan "": string kosong akan tersimpan
        // sebagai induk yang tak ada, dan hirarki bagan akun jadi rusak
        // tanpa gejala di layar.
        parent_id: induk || null,
        description: keterangan.trim() || null,
      });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal membuat akun."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-akun-baru" judul="Akun baru" lebar={560} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(110px,0.6fr) 1fr", gap: 12 }}>
        <div>
          <label htmlFor="ab-kode" style={gayaLabel}>Kode</label>
          <input id="ab-kode" value={kode} style={gayaInput} placeholder="1122"
            onChange={(e) => setKode(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ab-nama" style={gayaLabel}>Nama akun</label>
          <input id="ab-nama" value={nama} style={gayaInput}
            placeholder="Piutang Retensi" onChange={(e) => setNama(e.target.value)} />
        </div>
      </div>

      <div>
        <label htmlFor="ab-tipe" style={gayaLabel}>Tipe</label>
        <Pilihan id="ab-tipe" value={tipe} style={gayaInput}
          onChange={(e) => gantiTipe(e.target.value)}>
          {TIPE.map((t) => (
            <option key={t.nilai} value={t.nilai}>{t.teks} — {t.jelas}</option>
          ))}
        </Pilihan>
        <p style={{ fontSize: "var(--t-kecil)", color: C.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
          <strong>Tipe tak bisa diubah sesudah akun dipakai.</strong> Ia menentukan
          akun ini muncul di neraca atau laba-rugi — menggesernya belakangan berarti
          memindahkan angka dari satu laporan ke laporan lain.
        </p>
      </div>

      <div>
        <label htmlFor="ab-induk" style={gayaLabel}>Induk (opsional)</label>
        <Pilihan id="ab-induk" value={induk} style={gayaInput}
          onChange={(e) => setInduk(e.target.value)}>
          <option value="">— tanpa induk —</option>
          {indukTersedia.map((a) => (
            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
          ))}
        </Pilihan>
        <p style={{ fontSize: "var(--t-kecil)", color: C.muted, margin: "4px 0 0", lineHeight: 1.45 }}>
          Hanya akun bertipe sama yang bisa jadi induk. Induk bertipe beda membuat
          laporan menjumlahkan aset ke dalam beban.
        </p>
      </div>

      <div>
        <label htmlFor="ab-ket" style={gayaLabel}>Keterangan</label>
        <input id="ab-ket" value={keterangan} style={gayaInput}
          placeholder="kapan akun ini dipakai"
          onChange={(e) => setKeterangan(e.target.value)} />
      </div>

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        {halangan && (
          <span style={{
            fontSize: "var(--t-kecil)", color: C.mid, marginRight: "auto",
            maxWidth: "40ch", lineHeight: 1.45, alignSelf: "center",
          }}>{halangan}</span>
        )}
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!!halangan || kirim}>
          {kirim ? "Menyimpan…" : "Buat akun"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS INVOICE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Invoice bisa dibuat dan dibayar sejak awal, tapi statusnya tak pernah bisa
 * digerakkan: `PATCH /finance/invoices/:id/status` tak punya pemanggil.
 *
 * Dua akibatnya nyata:
 *
 *   • Invoice DRAFT tak pernah bisa dinyatakan terkirim. Saringan "Terkirim"
 *     di layar daftar selamanya kosong, dan tak ada cara membedakan tagihan
 *     yang sudah di tangan klien dari yang masih disiapkan.
 *
 *   • Invoice yang SALAH TERBIT tak bisa dibatalkan. Satu-satunya jalan
 *     adalah membiarkannya menua jadi "jatuh tempo" — lalu ia ikut dalam
 *     angka piutang dan umur tagihan, dan menjelaskan bahwa "yang itu
 *     sebetulnya batal" jadi pekerjaan lisan yang berulang tiap bulan.
 *
 * API hanya menerima tiga status: `draft`, `sent`, `cancelled`. `paid` dan
 * `partial` DITURUNKAN dari pembayaran, bukan disetel tangan — dan itu
 * dinyatakan di layar, karena tanpa itu tak ada yang mengerti kenapa dua
 * status yang terlihat di daftar tak ada di sini.
 */
const STATUS_INVOICE: Array<{ nilai: string; teks: string; jelas: string }> = [
  { nilai: "draft", teks: "Draft", jelas: "masih disiapkan, belum dikirim ke klien" },
  { nilai: "sent", teks: "Terkirim", jelas: "sudah di tangan klien, menunggu dibayar" },
  { nilai: "cancelled", teks: "Batal", jelas: "tak ditagihkan — keluar dari piutang" },
];

export function ModalStatusInvoice({ invoice, onClose, onSukses }: {
  invoice: { id: string; invoice_number: string; status: string; amount_paid: number | string };
  onClose: () => void;
  onSukses: () => void;
}) {
  const [status, setStatus] = useState(
    STATUS_INVOICE.some((s) => s.nilai === invoice.status) ? invoice.status : "draft");
  const [kirim, setKirim] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const sudahDibayar = Number(invoice.amount_paid) > 0;

  // Membatalkan invoice yang SUDAH ada uangnya masuk membuat pembayaran itu
  // menggantung: uangnya tercatat, tagihannya tidak. Ditahan di layar karena
  // API tak menahannya — dan yang membatalkannya biasanya tak tahu ada
  // pembayaran parsial di baris itu.
  const batalPadahalDibayar = status === "cancelled" && sudahDibayar;

  const halangan =
    status === invoice.status ? "Status belum berubah."
    : batalPadahalDibayar
      ? "Invoice ini sudah menerima pembayaran. Membatalkannya membuat uang yang "
        + "sudah masuk menggantung tanpa tagihan — kembalikan dulu pembayarannya."
      : null;

  async function simpan() {
    if (halangan || kirim) return;
    setKirim(true); setGalat(null);
    try {
      await api.patch(`/api/v1/finance/invoices/${invoice.id}/status`, { status });
      onSukses();
    } catch (e) {
      setGalat(pesanGalat(e, "Gagal mengubah status invoice."));
    } finally { setKirim(false); }
  }

  return (
    <ModalDasar judulId="judul-status-invoice" lebar={520} onClose={onClose}
      judul={`Status ${invoice.invoice_number}`}>
      <div>
        <label htmlFor="si-status" style={gayaLabel}>Status</label>
        <Pilihan id="si-status" value={status} style={gayaInput}
          onChange={(e) => setStatus(e.target.value)}>
          {STATUS_INVOICE.map((s) => (
            <option key={s.nilai} value={s.nilai}>{s.teks} — {s.jelas}</option>
          ))}
        </Pilihan>
      </div>

      <p style={{ margin: 0, fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.5 }}>
        <strong>Lunas</strong> dan <strong>parsial</strong> tidak ada di daftar ini
        dengan sengaja: keduanya diturunkan dari pembayaran yang tercatat, bukan
        disetel tangan. Menyetelnya manual akan membuat status berbeda dari jumlah
        uang yang benar-benar masuk.
      </p>

      {batalPadahalDibayar && (
        <div role="alert" style={{
          padding: "10px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.55,
          background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
          color: "var(--on-warning-bg)",
        }}>
          Invoice ini sudah menerima pembayaran. Membatalkannya meninggalkan uang
          yang tercatat masuk tanpa tagihan yang menjelaskannya.
        </div>
      )}

      {galat && <div role="alert" style={gayaGalat}>{galat}</div>}

      <KakiModal>
        {halangan && !batalPadahalDibayar && (
          <span style={{
            fontSize: "var(--t-kecil)", color: C.mid, marginRight: "auto",
            maxWidth: "40ch", lineHeight: 1.45, alignSelf: "center",
          }}>{halangan}</span>
        )}
        <TombolModal onClick={onClose}>Batal</TombolModal>
        <TombolModal utama onClick={simpan} mati={!!halangan || kirim}>
          {kirim ? "Menyimpan…" : "Simpan status"}
        </TombolModal>
      </KakiModal>
    </ModalDasar>
  );
}
