"use client";

import { useData } from "@/lib/data-cache";
import { CreditCard, Check, Lock, AlertTriangle, Info } from "lucide-react";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Tabel } from "@/components/dasar";
import { LayarKosong } from "@/components/layar-kosong";
// ⚠ Formatter BERSAMA, bukan Intl langsung: dua cara memformat rupiah akan
// menyimpang, dan pelanggan yang melihat dua angka berbeda untuk tagihan
// yang sama berhenti mempercayai keduanya. Dijaga `format-ratchet.mjs`.
import { formatRupiah, formatTanggal } from "@/lib/format";

/**
 * LANGGANAN SAYA — apa yang perusahaan ini bayar, dan tagihannya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-31: pelanggan tak punya tempat melihat tagihannya sendiri.
 * Layar billing yang ada milik konsol vendor — yang membukanya founder.
 *
 * Akibatnya berurutan: pelanggan tak tahu sudah bayar berapa dan jatuh tempo
 * kapan; lalu 30 hari sesudah lewat tempo akunnya jadi baca-saja dengan pesan
 * yang menyebut nomor tagihan — nomor yang tak pernah bisa ia periksa.
 *
 * Membekukan akun atas tagihan yang tak bisa dilihat pemiliknya adalah bentuk
 * penegakan yang paling mudah dibenci.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * URUTAN DI LAYAR — keadaan dulu, baru rincian
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang membuka halaman ini biasanya sedang mencari jawaban atas satu
 * pertanyaan mendesak: "kenapa saya tak bisa menyimpan?" atau "kurang bayar
 * berapa?". Jadi urutannya:
 *
 *   1. peringatan baca-saja (bila ada) — paling atas, tak bisa dilewatkan
 *   2. paket & total belum lunas — dua angka yang paling dicari
 *   3. daftar tagihan
 *   4. modul — konteks, bukan yang dicari
 *
 * Menaruh daftar modul di atas berarti orang yang akunnya beku harus
 * menggulir melewati 21 baris sebelum tahu kenapa.
 *
 * ── Arah visual
 *
 * Mengikuti `ARAH-VISUAL-2026.md`: navy sebagai satu-satunya aksen kuat
 * (§3d — satu aksen per layar), token `C` bersama yang punya riwayat WCAG,
 * kartu di atas `--bg`. Tak ada gaya baru yang diciptakan di sini.
 */

interface Tagihan {
  nomor: string;
  jumlah_idr: number;
  status: string;
  periode_mulai: string;
  periode_selesai: string;
  jatuh_tempo: string;
  dibayar_pada: string | null;
  cara_bayar: string | null;
}

interface Jawaban {
  paket: { kode: string | null; nama: string | null };
  keadaan: { bacaSaja: boolean; alasan: string | null; disegarkan: string | null };
  modul: { terbuka: string[]; tertutup: string[] };
  kuota: { kunci: string; batas: number | null }[];
  tagihan: Tagihan[];
  ringkasTagihan: { belumLunas: number; totalBelumLunas: number; caraBayar: string | null };
}

/** Nama modul untuk mata manusia. Kunci mentah di layar keputusan uang
 *  memaksa pengguna menebak — dan yang paling tak bisa menebak adalah
 *  pengguna berliterasi digital rendah (CLAUDE.md §8a.3). */
const NAMA_MODUL: Record<string, string> = {
  "modul.proyek": "Proyek",
  "modul.estimasi": "Estimasi & Anggaran",
  "modul.kontrak": "Kontrak",
  "modul.jadwal": "Perencanaan & Jadwal",
  "modul.lapangan": "Lapangan",
  "modul.keuangan": "Keuangan",
  "modul.akuntansi": "Akuntansi",
  "modul.rap": "RAP & Kendali Biaya",
  "modul.pengadaan": "Pengadaan",
  "modul.gudang": "Gudang & Material",
  "modul.mandor": "Mandor & Subkon",
  "modul.mitra": "Mitra & Vendor",
  "modul.uji_mutu": "Mutu (QA/QC)",
  "modul.k3_lingkungan": "K3 & Lingkungan",
  "modul.risiko": "Risiko & Kepatuhan",
  "modul.alat": "Alat & Aset",
  "modul.dokumen": "Dokumen",
  "modul.bi": "Pelaporan & BI",
  "modul.ai": "AI & Otomasi",
  "modul.crm": "CRM & Tender",
  "modul.sdm": "SDM & Payroll",
};

const NAMA_KUOTA: Record<string, string> = {
  "kuota.proyek_aktif": "Proyek aktif",
  "kuota.pengguna": "Pengguna",
  "kuota.penyimpanan_gb": "Penyimpanan (GB)",
};

/** Warna status tagihan — SELALU berpasangan dengan kata, tak pernah warna
 *  sendirian (WCAG 1.4.1). Pemakai yang tak membedakan merah dari abu tetap
 *  membaca statusnya. */
const GAYA_STATUS: Record<string, { latar: string; garis: string; teks: string; kata: string }> = {
  dibayar: { latar: C.successBorder, garis: C.greenBorder, teks: C.onSuccessBg, kata: "Lunas" },
  lewat_tempo: { latar: C.dangerBorder, garis: C.redBorder, teks: C.onDangerBg, kata: "Lewat tempo" },
  terkirim: { latar: C.subtle, garis: C.border, teks: C.mid, kata: "Menunggu pembayaran" },
  dibatalkan: { latar: C.subtle, garis: C.border, teks: C.muted, kata: "Dibatalkan" },
};

export default function LanggananPage() {
  const { data, memuat, galat } = useData<Jawaban>("/api/v1/langganan-saya");

  const ditolak =
    (galat as unknown as { response?: { status?: number } } | null)?.response?.status === 403;

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <KepalaHalaman judul="Langganan" ikon={<CreditCard size={19} />} />

      {memuat && (
        <p style={{ marginTop: "var(--gap-bagian)", fontSize: 13, color: C.mid }}>Memuat…</p>
      )}

      {ditolak && (
        <p style={{ marginTop: "var(--gap-bagian)", fontSize: 13, color: C.mid, lineHeight: 1.6, maxWidth: "62ch" }}>
          Keadaan langganan hanya bisa dilihat pengelola pengaturan perusahaan.
          Hubungi admin perusahaan Anda bila perlu memeriksanya.
        </p>
      )}

      {/* Galat MUAT dipisah dari galat aksi — satu state untuk keduanya
          membuat aksi yang berhasil menghapus pesan gagal muat
          (dijaga `uji-galat-muat-terpisah.mjs`). */}
      {galat && !ditolak && (
        <p style={{ marginTop: "var(--gap-bagian)", fontSize: 13, color: C.danger }}>
          Gagal memuat keadaan langganan.
        </p>
      )}

      {data && (
        <div style={{ marginTop: "var(--gap-bagian)", display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          {/* ── 1. Peringatan baca-saja — paling atas, tak bisa dilewatkan ── */}
          {data.keadaan.bacaSaja && (
            <div
              role="status"
              style={{
                display: "flex", gap: 11, alignItems: "flex-start",
                padding: "var(--pad-kartu)", borderRadius: 10,
                border: `1px solid ${C.redBorder}`, background: C.dangerBorder,
              }}
            >
              <AlertTriangle size={17} style={{ color: C.onDangerBg, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <div>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: C.onDangerBg }}>
                  Akun dibatasi sementara
                </p>
                <p style={{ margin: "5px 0 0", fontSize: 13, lineHeight: 1.6, color: C.onDangerBg, maxWidth: "64ch" }}>
                  {data.keadaan.alasan}
                </p>
              </div>
            </div>
          )}

          {/* ── 2. Paket & total belum lunas — dua angka yang paling dicari ── */}
          <div style={{ display: "grid", gap: "var(--gap-grid)", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div style={{ padding: "var(--pad-kartu)", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface }}>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, letterSpacing: "0.02em" }}>PAKET</p>
              <p style={{ margin: "6px 0 0", fontSize: 19, fontWeight: 600, color: C.text }}>
                {data.paket.nama ?? "Belum berlangganan"}
              </p>
              {!data.paket.nama && (
                <p style={{ margin: "5px 0 0", fontSize: 12.5, color: C.mid, lineHeight: 1.55 }}>
                  Seluruh modul terbuka. Hubungi kami bila ingin menetapkan paket.
                </p>
              )}
            </div>

            <div style={{ padding: "var(--pad-kartu)", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface }}>
              <p style={{ margin: 0, fontSize: 12, color: C.muted, letterSpacing: "0.02em" }}>BELUM DIBAYAR</p>
              {/* `tabular-nums` supaya digit sejajar — angka uang yang bergeser
                  antar baris lebih sulit dibandingkan sekilas. */}
              <p style={{ margin: "6px 0 0", fontSize: 19, fontWeight: 600, color: data.ringkasTagihan.belumLunas > 0 ? C.danger : C.text, fontVariantNumeric: "tabular-nums" }}>
                {formatRupiah(data.ringkasTagihan.totalBelumLunas)}
              </p>
              <p style={{ margin: "5px 0 0", fontSize: 12.5, color: C.mid }}>
                {data.ringkasTagihan.belumLunas === 0
                  ? "Tidak ada tagihan tertunggak"
                  : `${data.ringkasTagihan.belumLunas} tagihan menunggu pembayaran`}
              </p>
            </div>
          </div>

          {/* Cara bayar — hanya bila diisi. Bagian kosong yang tetap tampil
              memberi kesan sistemnya belum selesai. */}
          {data.ringkasTagihan.caraBayar && (
            <div style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "var(--pad-kartu)", borderRadius: 10, border: `1px solid ${C.infoBorder}`, background: C.blueBorder }}>
              <Info size={16} style={{ color: C.onInfoBg, flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.onInfoBg }}>Cara pembayaran</p>
                <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.65, color: C.onInfoBg, whiteSpace: "pre-line" }}>
                  {data.ringkasTagihan.caraBayar}
                </p>
              </div>
            </div>
          )}

          {/* ── 3. Daftar tagihan ─────────────────────────────────────────── */}
          <div>
            <h2 style={{ margin: "0 0 9px", fontSize: 14, fontWeight: 600, color: C.text }}>Tagihan</h2>
            <Tabel
              caption="Riwayat tagihan langganan"
              data={data.tagihan}
              kunciBaris={(t) => t.nomor}
              berpermukaan
              kosong={
                <LayarKosong
                  judul="Belum ada tagihan"
                  ikon={<CreditCard size={20} aria-hidden="true" />}
                  apa="Tagihan langganan terbit otomatis tiap awal periode, dan muncul di sini beserta jatuh temponya."
                  kenapa={
                    data.paket.nama
                      ? "Periode pertama paket Anda belum ditagih, atau tagihannya masih disiapkan."
                      : "Perusahaan ini belum punya paket langganan, jadi belum ada yang ditagih."
                  }
                  aksi={{ label: "Lihat pengaturan perusahaan", href: "/pengaturan/perusahaan" }}
                />
              }
              // Baris yang MENUNTUT tindakan ditandai. Tanpa ini, tagihan
              // lewat tempo terlihat sama dengan yang lunas sampai mata
              // sampai ke kolom status paling kanan.
              tandaiBaris={(t) => (t.status === "lewat_tempo" ? C.dangerBorder : undefined)}
              kolom={[
                { kunci: "nomor", judul: "Nomor", kepalaBaris: true, render: (t) => t.nomor },
                {
                  kunci: "periode",
                  judul: "Periode",
                  render: (t) => `${formatTanggal(t.periode_mulai)} – ${formatTanggal(t.periode_selesai)}`,
                },
                { kunci: "jatuh", judul: "Jatuh tempo", render: (t) => formatTanggal(t.jatuh_tempo) },
                { kunci: "jumlah", judul: "Jumlah", rata: "kanan", render: (t) => formatRupiah(t.jumlah_idr) },
                {
                  kunci: "status",
                  judul: "Status",
                  render: (t) => {
                    // Kata, bukan warna sendirian (WCAG 1.4.1).
                    const g = GAYA_STATUS[t.status] ?? GAYA_STATUS.terkirim;
                    return (
                      <span style={{ display: "inline-block", padding: "var(--pad-lencana)", borderRadius: 999, fontSize: 12, fontWeight: 500, background: g.latar, border: `1px solid ${g.garis}`, color: g.teks, whiteSpace: "nowrap" }}>
                        {g.kata}
                      </span>
                    );
                  },
                },
              ]}
              // Total di `<tfoot>`, bukan baris data terakhir: yang duduk di
              // `<tbody>` diumumkan pembaca layar sebagai baris biasa.
              total={
                data.ringkasTagihan.belumLunas > 0
                  ? [
                      { kunci: "label", isi: "Belum dibayar", rentang: 3 },
                      { kunci: "jumlah", isi: formatRupiah(data.ringkasTagihan.totalBelumLunas), rata: "kanan" },
                      { kunci: "kosong", isi: "" },
                    ]
                  : undefined
              }
            />
          </div>

          {/* ── 4. Modul — konteks, bukan yang dicari ─────────────────────── */}
          {(data.modul.terbuka.length > 0 || data.modul.tertutup.length > 0) && (
            <div>
              <h2 style={{ margin: "0 0 9px", fontSize: 14, fontWeight: 600, color: C.text }}>Modul</h2>
              <div style={{ display: "grid", gap: 7, gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
                {data.modul.terbuka.map((k) => (
                  <div key={k} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: C.text }}>
                    <Check size={14} style={{ color: C.success, flexShrink: 0 }} aria-hidden="true" />
                    <span>{NAMA_MODUL[k] ?? k}</span>
                  </div>
                ))}
                {data.modul.tertutup.map((k) => (
                  <div key={k} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 13, color: C.muted }}>
                    <Lock size={13} style={{ flexShrink: 0 }} aria-hidden="true" />
                    <span>{NAMA_MODUL[k] ?? k}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Kuota — angka yang membatasi, ditampilkan apa adanya. */}
          {data.kuota.length > 0 && (
            <div>
              <h2 style={{ margin: "0 0 9px", fontSize: 14, fontWeight: 600, color: C.text }}>Batas</h2>
              <div style={{ display: "grid", gap: 7, gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}>
                {data.kuota.map((k) => (
                  <div key={k.kunci} style={{ fontSize: 13, color: C.mid }}>
                    {NAMA_KUOTA[k.kunci] ?? k.kunci}:{" "}
                    <strong style={{ color: C.text, fontWeight: 600 }}>
                      {/* NULL = TAK TERBATAS, bukan nol. Menampilkan "0" pada
                          paket termahal adalah kebalikan dari yang benar. */}
                      {k.batas === null ? "Tak terbatas" : k.batas}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
