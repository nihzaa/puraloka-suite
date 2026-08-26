"use client";

// ============================================================================
// Rekonsiliasi Bank — detail satu koran. Portal Admin/Direktur (Task 16,
// Tahap 3). Salinan APA ADANYA dari `pm-portal/keuangan/rekonsiliasi-bank/
// [id]/page.tsx` (Task 35 PM) — laporan 4-baris + baris koran belum cocok +
// form penyesuaian + tombol "Kunci Periode".
//
// ── GERBANG DITAMBAHKAN di sini — sumber PM tidak punya gerbang
//
// Pola PERSIS Task 15 GL (`gl/jurnal/[id]/page.tsx`) — `rekonsiliasi:manage`
// dan `rekonsiliasi:lock` adalah permission BERBEDA (bisa dipegang role
// berbeda suatu hari, meski saat ini direktur nol keduanya), jadi TIGA
// gerbang terpisah, bukan satu gabungan:
//   - "+ Penyesuaian"          → `rekonsiliasi:manage`
//   - "Cocokkan (dari usul)"   → `rekonsiliasi:manage`
//   - "Kunci Periode"          → `rekonsiliasi:lock`
// TIDAK DIRENDER (bukan `disabled`) saat direktur tak punya izin, pola sama
// `bolehApprove` Task 10 Change Order / `bolehPost`/`bolehVoid` Task 15 GL —
// JANGAN "perbaiki" jadi selalu tampil dengan asumsi "direktur biasanya
// subset admin". Direktur yang membuka koran TERBUKA tanpa `rekonsiliasi:
// manage`/`:lock` TETAP melihat laporan + baris belum cocok PENUH — hanya
// tombol aksi yang hilang total (keadaan SAH, baca-saja, bukan bug tampilan
// setengah-jadi).
//
// ── Atomisitas status (pelajaran Task 34 PM — VERIFIKASI, jangan asumsikan)
//
// `POST /rekonsiliasi/:id/kunci` ATOMIK: `rekonsiliasi-bank.ts:484-493`
// menyertakan `.eq('status', 'terbuka')` di WHERE update yang sama dengan
// `.eq('id', ...)` — dua panggilan kunci bersamaan tak bisa sama-sama
// berhasil, nol baris terpengaruh berarti sudah dikunci lebih dulu (409).
//
// `POST /rekonsiliasi/:id/cocokkan` TIDAK memakai pola WHERE status-lama
// yang sama (tak ada kolom status di baris yang diubah), tapi dijaga dua
// lapis lain: (1) `koranTerkunci()` pre-check menolak 409 kalau koran sudah
// `dikunci` SEBELUM insert dicoba, dan (2) `UNIQUE` constraint di DB
// (`cocok_...`, ditangkap sebagai kode 23505) mencegah baris/transaksi yang
// sama dicocokkan dua kali meski dua klik nyaris bersamaan lolos pre-check.
// Race window antara pre-check dan insert secara teori ada (koran bisa
// dikunci PERSIS di antara keduanya), tapi dampaknya dibatasi: hasilnya
// paling buruk SATU pencocokan tambahan tercatat sesudah kunci, bukan uang
// berpindah atau saldo salah — beda kelas dengan cacat void GL Task 34 yang
// bisa membatalkan transaksi finansial dua kali. Dicatat sebagai concern
// ringan di laporan, bukan diperbaiki di sini (backend di luar scope Task 16).
//
// `POST /rekonsiliasi/:id/penyesuaian` juga lewat `koranTerkunci()` +
// CHECK constraint DB (`penyesuaian_jenis_sah` — LIMA nilai termasuk
// `pajak_bunga`; `penyesuaian_lainnya_berketerangan` — "lainnya" wajib
// keterangan >= 10 huruf, ditegakkan backend via 23514, PESAN diteruskan
// apa adanya lewat `pesanGalat()`, TIDAK divalidasi ulang di klien selain
// required biasa).
//
// State galat AKSI (`galatAksi`) TERPISAH dari galat MUAT (`galat` dari
// useData) — pelajaran Task 31/32 PM.
//
// TANPA `useSearchParams` — id datang dari `useParams`, bukan query string,
// jadi halaman ini tak butuh <Suspense>.
//
// Satu-satunya beda TEKSTUAL dari sumber PM di luar gerbang: `padding: 16`
// (kartu laporan) diganti `padding: "var(--pad-kartu-lega)"` — NILAI SAMA
// (16px), murni literal→token supaya tak menambah pelanggaran
// `kerapatan-ratchet.mjs` (constraint global task ini). Tak ada perubahan
// visual maupun logic.
// ============================================================================

import { useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { Landmark, Lock, Link2 } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import { formatRupiah, formatTanggal } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import BottomSheet from "@/components/portal/BottomSheet";
import type { RespRekonsiliasiDetail, GalatApi } from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";

// `langganan`: pola PERSIS Task 10 — perubahan permission (login/switch
// company) tercermin tanpa reload.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const LABEL_JENIS_PENYESUAIAN: Record<string, string> = {
  biaya_admin: "Biaya Admin",
  jasa_giro: "Jasa Giro",
  pajak_bunga: "Pajak Bunga",
  koreksi_bank: "Koreksi Bank",
  lainnya: "Lainnya",
};

export default function AdminDetailRekonsiliasiBankPage() {
  // `rekonsiliasi:manage`/`rekonsiliasi:lock` HANYA admin (pola sama Task 15
  // GL) — direktur NOL untuk keduanya. TIGA gerbang terpisah karena keduanya
  // permission BERBEDA yang bisa saja suatu hari dipegang role berbeda pula.
  const bolehKelola = useSyncExternalStore(langganan, () => hasPermission("rekonsiliasi:manage"), () => false);
  const bolehKunci = useSyncExternalStore(langganan, () => hasPermission("rekonsiliasi:lock"), () => false);

  const params = useParams<{ id: string }>();
  const id = params.id;
  const [sheetPenyesuaian, setSheetPenyesuaian] = useState(false);
  const [formPenyesuaian, setFormPenyesuaian] = useState({ jenis: "biaya_admin", keterangan: "", nominal: "" });
  const [mencocokkan, setMencocokkan] = useState<string | null>(null);
  const [mengunci, setMengunci] = useState(false);
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  const url = id ? `/api/v1/rekonsiliasi/${id}` : null;
  const { data, memuat, galat } = useData<RespRekonsiliasiDetail>(url);

  async function cocokkanDariUsul(barisId: string, sumber: string, sumberId: string) {
    setMencocokkan(barisId);
    setGalatAksi(null);
    try {
      await api.post(`/api/v1/rekonsiliasi/${id}/cocokkan`, {
        baris_id: barisId,
        sumber_tabel: sumber,
        sumber_id: sumberId,
      });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mencocokkan"));
    } finally {
      setMencocokkan(null);
    }
  }

  async function kirimPenyesuaian() {
    if (!formPenyesuaian.keterangan.trim() || !formPenyesuaian.nominal) {
      setGalatAksi("Keterangan dan nominal wajib diisi.");
      return;
    }
    if (formPenyesuaian.jenis === "lainnya" && formPenyesuaian.keterangan.trim().length < 10) {
      // Backend menegakkan ini (23514 → 400), tapi menjawabnya di klien
      // lebih dulu menghindarkan satu round-trip yang pasti gagal.
      setGalatAksi('Jenis "Lainnya" wajib keterangan minimal 10 karakter.');
      return;
    }
    if (Number(formPenyesuaian.nominal) === 0) {
      setGalatAksi("Nominal tak boleh nol.");
      return;
    }
    setMengirim(true);
    setGalatAksi(null);
    try {
      await api.post(`/api/v1/rekonsiliasi/${id}/penyesuaian`, {
        jenis: formPenyesuaian.jenis,
        keterangan: formPenyesuaian.keterangan.trim(),
        nominal: Number(formPenyesuaian.nominal),
      });
      setSheetPenyesuaian(false);
      setFormPenyesuaian({ jenis: "biaya_admin", keterangan: "", nominal: "" });
      invalidasi(url ?? "");
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mencatat penyesuaian"));
    } finally {
      setMengirim(false);
    }
  }

  async function kunciPeriode() {
    setMengunci(true);
    setGalatAksi(null);
    try {
      await api.post(`/api/v1/rekonsiliasi/${id}/kunci`, {});
      invalidasi(url ?? "");
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengunci periode"));
    } finally {
      setMengunci(false);
    }
  }

  if (memuat) return <SkeletonCard tinggi={220} />;
  if (galat || !data) {
    return (
      <EmptyState
        icon={Landmark}
        judul="Gagal memuat"
        deskripsi={pesanGalat(galat as GalatApi, "Rekonsiliasi tidak ditemukan.")}
      />
    );
  }

  const { koran, baris, laporan, usul } = data;
  const barisBelumCocok = baris.filter((b) => !b.sudah_cocok);
  const usulPerBaris = new Map(usul.map((u) => [u.baris_id, u]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{koran.nama_akun}</h1>

      <div
        style={{
          background: laporan.tuntas ? "var(--success-bg)" : "var(--surface)",
          borderRadius: 16,
          padding: "var(--pad-kartu-lega)",
          border: `1px solid ${laporan.tuntas ? "var(--success-border)" : "var(--border)"}`,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Laporan Rekonsiliasi
        </h2>
        {(
          [
            ["Saldo Bank", laporan.saldo_bank],
            ["+ Setoran Dalam Perjalanan", laporan.setoran_dalam_perjalanan],
            ["− Cek/Transfer Beredar", -laporan.cek_beredar],
            ["± Penyesuaian", laporan.penyesuaian],
          ] as const
        ).map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
            <span style={{ color: "var(--text-secondary)" }}>{label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatRupiah(val)}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            fontWeight: 700,
            borderTop: "1px solid var(--border)",
            paddingTop: 6,
            marginTop: 4,
          }}
        >
          <span>Saldo Buku Seharusnya</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatRupiah(laporan.saldo_buku_seharusnya)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
          <span style={{ color: "var(--text-secondary)" }}>Saldo Buku (aktual)</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatRupiah(laporan.saldo_buku)}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 14,
            fontWeight: 700,
            color: laporan.tuntas ? "var(--success)" : "var(--danger)",
            marginTop: 6,
          }}
        >
          <span>Selisih</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatRupiah(laporan.selisih)}</span>
        </div>
      </div>

      {galatAksi && (
        <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {galatAksi}
        </div>
      )}

      {koran.status === "terbuka" && (bolehKelola || bolehKunci) && (
        <div style={{ display: "flex", gap: 8 }}>
          {bolehKelola && (
            <button
              type="button"
              onClick={() => setSheetPenyesuaian(true)}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: "var(--portal-radius-pill)",
                fontSize: 13,
                fontWeight: 700,
                border: "1px solid var(--navy)",
                background: "var(--surface)",
                color: "var(--navy)",
                cursor: "pointer",
              }}
            >
              + Penyesuaian
            </button>
          )}
          {bolehKunci && (
            <button
              type="button"
              onClick={() => void kunciPeriode()}
              disabled={mengunci}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                minHeight: 44,
                borderRadius: "var(--portal-radius-pill)",
                fontSize: 13,
                fontWeight: 700,
                border: "none",
                background: mengunci ? "var(--surface-subtle)" : "var(--navy)",
                color: mengunci ? "var(--text-muted)" : "var(--on-navy)",
                cursor: mengunci ? "default" : "pointer",
              }}
            >
              <Lock size={14} aria-hidden="true" /> {mengunci ? "Mengunci…" : "Kunci Periode"}
            </button>
          )}
        </div>
      )}

      <div>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 10px" }}>
          Baris Belum Cocok ({barisBelumCocok.length})
        </h2>
        {barisBelumCocok.length === 0 && (
          <EmptyState icon={Landmark} judul="Semua baris cocok" deskripsi="Tidak ada baris koran yang menunggu pencocokan." />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {barisBelumCocok.map((b) => {
            const u = usulPerBaris.get(b.id);
            return (
              <div
                key={b.id}
                style={{ background: "var(--surface)", borderRadius: 12, padding: 12, border: "1px solid var(--border)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--text-primary)" }}>{b.keterangan}</span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: Number(b.kredit) > 0 ? "var(--success)" : "var(--danger)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {Number(b.kredit) > 0 ? `+${formatRupiah(b.kredit)}` : `−${formatRupiah(b.debit)}`}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{formatTanggal(b.tanggal)}</div>
                {u && koran.status === "terbuka" && bolehKelola && (
                  <button
                    type="button"
                    onClick={() => void cocokkanDariUsul(b.id, u.sumber, u.sumber_id)}
                    disabled={mencocokkan === b.id}
                    style={{
                      marginTop: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      minHeight: 36,
                      padding: "0 12px",
                      borderRadius: "var(--portal-radius-pill)",
                      fontSize: 12,
                      fontWeight: 700,
                      border: "none",
                      background: mencocokkan === b.id ? "var(--surface-subtle)" : "var(--info-bg)",
                      color: mencocokkan === b.id ? "var(--text-muted)" : "var(--navy)",
                      cursor: mencocokkan === b.id ? "default" : "pointer",
                    }}
                  >
                    <Link2 size={13} aria-hidden="true" />{" "}
                    {mencocokkan === b.id
                      ? "Mencocokkan…"
                      : `Cocokkan (${u.keyakinan === "persis" ? "persis" : `dekat, selisih ${u.selisih_hari} hari`})`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {bolehKelola && (
        <BottomSheet terbuka={sheetPenyesuaian} onTutup={() => setSheetPenyesuaian(false)} judul="Catat Penyesuaian">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jenis</span>
              <select
                value={formPenyesuaian.jenis}
                onChange={(e) => setFormPenyesuaian((f) => ({ ...f, jenis: e.target.value }))}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
              >
                {Object.entries(LABEL_JENIS_PENYESUAIAN).map(([nilai, label]) => (
                  <option key={nilai} value={nilai}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Keterangan * {formPenyesuaian.jenis === "lainnya" && "(minimal 10 karakter)"}
              </span>
              <input
                value={formPenyesuaian.keterangan}
                onChange={(e) => setFormPenyesuaian((f) => ({ ...f, keterangan: e.target.value }))}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                Nominal * (negatif = mengurangi)
              </span>
              <input
                type="number"
                value={formPenyesuaian.nominal}
                onChange={(e) => setFormPenyesuaian((f) => ({ ...f, nominal: e.target.value }))}
                style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
              />
            </label>
            {galatAksi && (
              <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
                {galatAksi}
              </div>
            )}
            <button
              type="button"
              onClick={() => void kirimPenyesuaian()}
              disabled={mengirim}
              style={{
                minHeight: 48,
                borderRadius: "var(--portal-radius-pill)",
                fontSize: 14,
                fontWeight: 700,
                border: "none",
                background: mengirim ? "var(--surface-subtle)" : "var(--navy)",
                color: mengirim ? "var(--text-muted)" : "var(--on-navy)",
                cursor: mengirim ? "default" : "pointer",
              }}
            >
              {mengirim ? "Mencatat…" : "Catat Penyesuaian"}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
