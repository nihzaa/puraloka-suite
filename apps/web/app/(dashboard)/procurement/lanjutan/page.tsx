"use client";

/**
 * PENGADAAN LANJUTAN (TUNDA kelompok F)
 *
 * ── Yang dijawab halaman ini
 *
 * Satu barang, dari kesepakatan sampai uangnya kembali: kontrak payung →
 * expediting → nota kredit.
 *
 * ── Empat hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Kontrak payung "aktif" yang kuotanya sudah habis.** Data nyata di
 *    basis: BO-2026-001 berstatus `aktif`, kedua itemnya nol sisa. PO
 *    berikutnya akan ditagih di luar harga kontrak, dan itu baru ketahuan
 *    saat tagihannya datang dengan harga berbeda.
 *
 * 2. **Telat yang diukur dari JANJI VENDOR, bukan kebutuhan kita.** Vendor
 *    menjanjikan tanggal yang sudah 12 hari lebih lambat dari yang kita
 *    butuhkan; barang datang "tepat janji" dan telat 19 hari sekaligus.
 *    Yang menghentikan pekerjaan adalah angka kedua.
 *
 * 3. **Nota kredit disetujui yang tak pernah diterapkan.** Rp 28,4 juta
 *    disepakati 30 hari lalu, tagihan penuh tetap dibayar. Uang hilang
 *    dengan seluruh persetujuan lengkap.
 *
 * 4. **Rata-rata keterlambatan.** Yang ditampilkan TERPARAH — sembilan PO
 *    tepat waktu dan satu tertahan tiga minggu punya rata-rata 2 hari.
 *
 * Keempatnya dikunci di `apps/api/src/lib/pengadaan-lanjutan.ts` — 29 test,
 * 16 mutasi tertangkap. Halaman ini menampilkannya, bukan menghitung ulang.
 *
 * ── Tata letak: tiga lapis (ARAH-VISUAL §5b)
 *
 * KEADAAN (4 KPI) → POLA (peringatan) → DETAIL (tabel).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackageSearch, RefreshCw, FileMinus, Truck, Boxes } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type StatusPayung = "aktif" | "kuota_habis" | "segera_berakhir" | "kedaluwarsa" | "belum_mulai" | "tak_aktif";

type ItemPayung = {
  id: string;
  uraian: string;
  satuan: string;
  harga_satuan: number | string;
  kuota: number | string;
  terpakai: number | string | null;
  sisa: number;
  persenTerpakai: number;
  habis: boolean;
  hampirHabis: boolean;
  nilaiTerpakai: number;
};

type Payung = {
  id: string;
  nomor: string;
  judul: string | null;
  pemasok_nama: string | null;
  berlaku_dari: string;
  berlaku_sampai: string;
  pagu_nilai: number | string | null;
  status: string;
  statusNyata: StatusPayung;
  sisaHari: number | null;
  itemDinilai: ItemPayung[];
  nilaiTerpakai: number;
  sisaPagu: number | null;
  aktifTapiTakBisaDipakai: boolean;
};

type Kiriman = {
  id: string;
  po_number: string | null;
  pemasok_nama: string | null;
  status: string;
  butuh_tanggal: string | null;
  janji_vendor: string | null;
  perkiraan_tiba: string | null;
  tiba_aktual: string | null;
  lokasi_terkini: string | null;
  sebab_tertahan: string | null;
  telatHari: number | null;
  telatDariJanji: number | null;
  janjiSudahTelat: boolean;
  kritis: boolean;
  sudahTiba: boolean;
};

type Nota = {
  id: string;
  nomor: string;
  tanggal: string | null;
  jenis: string;
  jumlah: number | string;
  jumlahAngka: number;
  alasan: string;
  status: string;
  pemasok_nama: string | null;
  alasan_tolak: string | null;
  umurSetujuHari: number | null;
  menggantung: boolean;
};

type Data = {
  tanggal: string;
  kontrakPayung: { kontrak: Payung[]; aktif: number; kuotaHabis: number; segeraBerakhir: number; aktifTapiTakBisaDipakai: number };
  expediting: { kiriman: Kiriman[]; telat: number; kritis: number; tertahan: number; janjiSudahTelat: number; telatTerparah: number | null };
  notaKredit: { nota: Nota[]; totalDisetujui: number; totalDiterapkan: number; nilaiMenggantung: number; menggantung: number };
};

const STATUS_PAYUNG: Record<StatusPayung, { label: string; warna: string; bg: string }> = {
  aktif:           { label: "Aktif",            warna: "var(--success)", bg: "var(--success-bg)" },
  kuota_habis:     { label: "Kuota habis",      warna: "var(--danger)",  bg: "var(--danger-bg)" },
  segera_berakhir: { label: "Segera berakhir",  warna: "var(--warning)", bg: "var(--warning-bg)" },
  kedaluwarsa:     { label: "Kedaluwarsa",      warna: "var(--danger)",  bg: "var(--danger-bg)" },
  belum_mulai:     { label: "Belum mulai",      warna: "var(--info)",    bg: "var(--info-bg)" },
  tak_aktif:       { label: "Tak aktif",        warna: "var(--text-secondary)", bg: "var(--surface-subtle)" },
};

const LABEL_KIRIM: Record<string, string> = {
  dipesan: "Dipesan", diproduksi: "Diproduksi", siap_kirim: "Siap kirim",
  dalam_perjalanan: "Dalam perjalanan", tiba: "Tiba", tertahan: "Tertahan",
  dibatalkan: "Dibatalkan",
};

const LABEL_NOTA: Record<string, string> = {
  retur_barang: "Retur barang", kurang_kirim: "Kurang kirim",
  salah_harga: "Salah harga", barang_rusak: "Barang rusak",
  potongan: "Potongan", lainnya: "Lainnya",
};

const STATUS_NOTA: Record<string, { label: string; warna: string; bg: string }> = {
  draft:      { label: "Draft",      warna: "var(--text-secondary)", bg: "var(--surface-subtle)" },
  diajukan:   { label: "Diajukan",   warna: "var(--info)",    bg: "var(--info-bg)" },
  disetujui:  { label: "Disetujui",  warna: "var(--warning)", bg: "var(--warning-bg)" },
  ditolak:    { label: "Ditolak",    warna: "var(--danger)",  bg: "var(--danger-bg)" },
  diterapkan: { label: "Diterapkan", warna: "var(--success)", bg: "var(--success-bg)" },
};

const tanggalTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const rupiah = (n: number | string | null) => {
  const v = n == null ? null : Number(n);
  if (v == null || !Number.isFinite(v)) return "—";
  return "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
};

const angkaRingkas = (n: number) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

const kartu: React.CSSProperties = {
  background: "var(--surface)",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  boxShadow: "var(--naik-1)",
};

/** Satu angka besar dengan penjelasannya. Lapis 1 pola ARAH-VISUAL §5b. */
function Kpi({ label, nilai, keterangan, warna }: {
  label: string; nilai: string; keterangan?: string; warna?: string;
}) {
  return (
    <div style={{ ...kartu, padding: "var(--pad-kartu-lega)", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{
        fontSize: 22, fontWeight: 700, marginTop: 4,
        color: warna ?? C.text, fontVariantNumeric: "tabular-nums",
      }}>
        {nilai}
      </div>
      {keterangan && (
        <div style={{ fontSize: 12, color: C.mid, marginTop: 2, lineHeight: 1.4 }}>{keterangan}</div>
      )}
    </div>
  );
}

function Peringatan({ ikon, judul, isi, nada }: {
  ikon: React.ReactNode; judul: string; isi: React.ReactNode; nada: "danger" | "warning";
}) {
  return (
    <div className="rise rise-3" style={{
      ...kartu, padding: "12px 16px", marginBottom: 12,
      borderColor: `var(--${nada}-border)`, background: `var(--${nada}-bg)`,
      display: "flex", gap: 10, alignItems: "flex-start",
    }}>
      <span style={{ color: `var(--${nada})`, flexShrink: 0, marginTop: 1, display: "flex" }}>{ikon}</span>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
        <strong style={{ color: `var(--${nada})` }}>{judul}</strong>
        <div style={{ marginTop: 2, color: C.mid }}>{isi}</div>
      </div>
    </div>
  );
}

/**
 * Batang kuota satu item kontrak payung.
 *
 * Sisa ditulis sebagai ANGKA di sebelah batangnya, bukan hanya warna —
 * warna sendirian tak boleh jadi satu-satunya pembawa makna (WCAG 1.4.1).
 */
function BatangKuota({ i }: { i: ItemPayung }) {
  // Batang menggambarkan SISA, bukan terpakai — searah dengan angka di
  // sebelahnya ("sisa 960 sak").
  //
  // Versi pertama menggambar `persenTerpakai`, sehingga item bersisa sedikit
  // punya batang HAMPIR PENUH sementara angkanya menyebut sisa kecil.
  // Pembacanya harus membalik sendiri, dan itu persis jenis beban yang
  // membuat orang salah baca layar yang sedang terburu-buru.
  const persen = Math.min(100, Math.max(0, 100 - i.persenTerpakai));
  const warna = i.habis ? "var(--danger)" : i.hampirHabis ? "var(--warning)" : "var(--aksen)";

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
        <span style={{ color: C.text }}>{i.uraian}</span>
        <span style={{
          color: i.habis ? "var(--danger)" : i.hampirHabis ? "var(--warning)" : C.mid,
          fontWeight: i.habis || i.hampirHabis ? 700 : 400,
          fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
        }}>
          {i.habis ? "habis" : `sisa ${angkaRingkas(i.sisa)} ${i.satuan}`}
        </span>
      </div>
      <div style={{
        height: 6, borderRadius: 3, background: "var(--surface-subtle)",
        marginTop: 4, overflow: "hidden",
      }}>
        <div style={{ width: `${persen}%`, height: "100%", background: warna }} />
      </div>
    </div>
  );
}

export default function PengadaanLanjutanPage() {
  const [data, setData] = useState<Data | null>(null);
  const [galat, setGalat] = useState("");
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  // Pemuatan dilacak lewat putaran yang datanya sudah tiba, bukan bendera
  // boolean yang dinyalakan di badan efek — bendera memicu render bertingkat.
  const [putaranTiba, setPutaranTiba] = useState(-1);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<Data>("/api/v1/pengadaan-lanjutan", { signal: ac.signal })
      .then((r) => { setData(r.data); setGalat(""); })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat data pengadaan"); })
      .finally(() => { if (!ac.signal.aborted) setPutaranTiba(muatUlangKe); });
    return () => ac.abort();
  }, [muatUlangKe]);

  const memuat = putaranTiba !== muatUlangKe;
  const muatUlang = useCallback(() => setMuatUlangKe((n) => n + 1), []);

  const kolomKiriman: Array<Kolom<Kiriman>> = useMemo(() => [
    {
      kunci: "po", judul: "PO", kepalaBaris: true,
      render: (k) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>
            {k.po_number ?? "—"}
          </span>
          {k.pemasok_nama && (
            <span style={{ display: "block", fontSize: 11, color: C.muted }}>{k.pemasok_nama}</span>
          )}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Keadaan",
      render: (k) => (
        <span>
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            color: k.status === "tertahan" ? "var(--danger)"
              : k.sudahTiba ? "var(--success)" : "var(--info)",
            background: k.status === "tertahan" ? "var(--danger-bg)"
              : k.sudahTiba ? "var(--success-bg)" : "var(--info-bg)",
          }}>
            {LABEL_KIRIM[k.status] ?? k.status}
          </span>
          {k.lokasi_terkini && (
            <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 3 }}>
              {k.lokasi_terkini}
            </span>
          )}
          {k.sebab_tertahan && (
            <span style={{ display: "block", fontSize: 11, color: "var(--danger)", marginTop: 3 }}>
              {k.sebab_tertahan}
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "butuh", judul: "Kita butuh", rata: "kanan",
      render: (k) => <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{tanggalTerbaca(k.butuh_tanggal)}</span>,
    },
    {
      kunci: "janji", judul: "Janji vendor", rata: "kanan",
      render: (k) => (
        // Dua tanggal berbeda dengan sengaja: yang di PO adalah KEBUTUHAN
        // kita, yang di sini JANJI vendor. Vendor yang menjanjikan tanggal
        // lebih lambat dari kebutuhan bukan vendor yang mengecewakan —
        // yang salah penjadwalannya, dan itu percakapan yang berbeda.
        <span style={{ whiteSpace: "nowrap", color: k.janjiSudahTelat ? "var(--warning)" : C.mid }}>
          {tanggalTerbaca(k.janji_vendor)}
          {k.janjiSudahTelat && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
              sudah lebih lambat dari kebutuhan
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "telat", judul: "Telat (dari kebutuhan)", rata: "kanan",
      render: (k) => {
        if (k.telatHari == null) {
          return <span style={{ color: C.muted, fontSize: 12 }}>tak bisa dihitung</span>;
        }
        if (k.telatHari <= 0) {
          return <span style={{ color: "var(--success)", fontWeight: 600 }}>tepat waktu</span>;
        }
        return (
          <span style={{
            fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            color: k.kritis ? "var(--danger)" : "var(--warning)",
          }}>
            {k.telatHari} hari
            {k.telatDariJanji != null && k.telatDariJanji !== k.telatHari && (
              <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: C.mid }}>
                {k.telatDariJanji <= 0 ? "tepat janji vendor" : `${k.telatDariJanji} hari dari janji`}
              </span>
            )}
          </span>
        );
      },
    },
  ], []);

  const kolomNota: Array<Kolom<Nota>> = useMemo(() => [
    {
      kunci: "nomor", judul: "Nomor", kepalaBaris: true,
      render: (n) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{n.nomor}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>
            {n.pemasok_nama ?? "—"} · {LABEL_NOTA[n.jenis] ?? n.jenis}
          </span>
        </span>
      ),
    },
    {
      kunci: "jumlah", judul: "Nilai", rata: "kanan",
      render: (n) => (
        <span style={{
          fontWeight: 700, fontVariantNumeric: "tabular-nums",
          color: n.menggantung ? "var(--danger)" : C.text,
        }}>
          {rupiah(n.jumlahAngka)}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (n) => {
        const meta = STATUS_NOTA[n.status] ?? STATUS_NOTA.draft;
        return (
          <span>
            <span style={{
              padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
              color: meta.warna, background: meta.bg,
            }}>
              {meta.label}
            </span>
            {n.menggantung && (
              // Disetujui, tapi potongannya belum mengurangi tagihan apa pun.
              <span style={{ display: "block", fontSize: 11, color: "var(--danger)", fontWeight: 700, marginTop: 3 }}>
                belum diterapkan — {n.umurSetujuHari} hari
              </span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "alasan", judul: "Alasan",
      render: (n) => (
        <span style={{ fontSize: 12, color: C.mid, lineHeight: 1.45 }}>
          {n.alasan.slice(0, 110)}{n.alasan.length > 110 ? "…" : ""}
          {n.alasan_tolak && (
            <span style={{ display: "block", color: "var(--danger)", marginTop: 3 }}>
              Ditolak: {n.alasan_tolak.slice(0, 90)}{n.alasan_tolak.length > 90 ? "…" : ""}
            </span>
          )}
        </span>
      ),
    },
  ], []);

  const kosongSeluruhnya =
    !data ||
    (data.kontrakPayung.kontrak.length === 0 &&
      data.expediting.kiriman.length === 0 &&
      data.notaKredit.nota.length === 0);

  return (
    // Token lebar TETAP dipakai (konvensi repo, ditegakkan
    // `tata-letak-ratchet.mjs`) — tapi TANPA judul sendiri: judul halaman
    // datang dari `procurement/layout.tsx`.
    //
    // Versi pertama menambahkan <h2> di sini, dan hasilnya DUA judul
    // bertumpuk: "Pengadaan & Persediaan" dari layout, lalu "Pengadaan
    // Lanjutan" dari sini. Ketahuan dari memotret halamannya.
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <div>
          <p style={{ fontSize: 13, color: C.mid, margin: 0, maxWidth: "68ch", lineHeight: 1.55 }}>
            Satu barang dari kesepakatan sampai uangnya kembali: <strong>kontrak
            payung</strong> mengunci harga &amp; kuota di muka, <strong>expediting</strong> melacak
            barangnya, <strong>nota kredit</strong> mengoreksi tagihan yang keliru.
            Kontrak berstatus &ldquo;aktif&rdquo; yang kuotanya habis tetap ditandai — PO
            berikutnya akan ditagih di luar harga kontrak.
          </p>
        </div>
        <button
          type="button"
          onClick={muatUlang}
          disabled={memuat}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, cursor: memuat ? "default" : "pointer", opacity: memuat ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Muat ulang
        </button>
      </div>

      {galat && (
        <div role="alert" style={{
          ...kartu, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat data pengadaan…
        </div>
      ) : kosongSeluruhnya ? (
        <Kosong
          ikon={<PackageSearch size={28} />}
          judul="Belum ada kontrak payung atau pelacakan kiriman"
          sebab={
            <>
              Kontrak payung mengunci harga dan kuota di muka, sehingga PO tinggal
              menariknya — tanpa negosiasi ulang tiap kali. Expediting mencatat
              barangnya sekarang di mana dan telat berapa hari dari yang dibutuhkan,
              bukan dari yang dijanjikan vendor.
            </>
          }
        />
      ) : (
        <>
          {/* Lapis 1 — keadaan */}
          <div className="rise rise-2" style={{
            display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap", marginBottom: "var(--gap-bagian)",
          }}>
            <Kpi
              label="Kontrak tak bisa dipakai"
              nilai={String(data.kontrakPayung.aktifTapiTakBisaDipakai)}
              warna={data.kontrakPayung.aktifTapiTakBisaDipakai > 0 ? "var(--danger)" : "var(--success)"}
              keterangan={
                data.kontrakPayung.aktifTapiTakBisaDipakai > 0
                  ? "status aktif, kuota/masa berlakunya habis"
                  : `${data.kontrakPayung.aktif} kontrak siap ditarik`
              }
            />
            <Kpi
              label="Telat terparah"
              nilai={data.expediting.telatTerparah != null ? `${data.expediting.telatTerparah} hari` : "—"}
              warna={(data.expediting.telatTerparah ?? 0) > 0 ? "var(--danger)" : undefined}
              keterangan={`${data.expediting.telat} kiriman telat · ${data.expediting.tertahan} tertahan`}
            />
            <Kpi
              label="Janji vendor sudah telat"
              nilai={String(data.expediting.janjiSudahTelat)}
              warna={data.expediting.janjiSudahTelat > 0 ? "var(--warning)" : undefined}
              keterangan="dijanjikan lebih lambat dari kebutuhan"
            />
            <Kpi
              label="Potongan belum diterapkan"
              nilai={rupiah(data.notaKredit.nilaiMenggantung)}
              warna={data.notaKredit.nilaiMenggantung > 0 ? "var(--danger)" : undefined}
              keterangan={`${data.notaKredit.menggantung} nota disetujui, tagihan penuh dibayar`}
            />
          </div>

          {/* Lapis 2 — peringatan */}
          {data.kontrakPayung.aktifTapiTakBisaDipakai > 0 && (
            <Peringatan
              nada="danger"
              ikon={<Boxes size={16} aria-hidden="true" />}
              judul={`${data.kontrakPayung.aktifTapiTakBisaDipakai} kontrak payung berstatus "aktif" padahal kuota atau masa berlakunya habis`}
              isi={
                <>
                  Memperbarui statusnya adalah langkah manual yang mudah terlupa. PO
                  yang menariknya akan <strong>ditagih di luar harga kontrak</strong>, dan
                  itu baru ketahuan saat tagihannya datang dengan harga berbeda.
                  Perpanjang kontraknya, atau ubah statusnya.
                </>
              }
            />
          )}

          {data.notaKredit.menggantung > 0 && (
            <Peringatan
              nada="danger"
              ikon={<FileMinus size={16} aria-hidden="true" />}
              judul={`${rupiah(data.notaKredit.nilaiMenggantung)} potongan disetujui tapi belum mengurangi tagihan`}
              isi={
                <>
                  Potongannya sudah disepakati dengan persetujuan lengkap — tapi
                  tagihan penuh tetap dibayar selama nota kreditnya belum diterapkan.
                  Uang hilang <strong>tanpa satu pun kolom berteriak</strong>.
                </>
              }
            />
          )}

          {data.expediting.janjiSudahTelat > 0 && (
            <Peringatan
              nada="warning"
              ikon={<Truck size={16} aria-hidden="true" />}
              judul={`${data.expediting.janjiSudahTelat} kiriman: vendor menjanjikan tanggal yang SUDAH lebih lambat dari kebutuhan`}
              isi={
                <>
                  Vendor yang menepati janjinya di sini tetap membuat pekerjaan telat —
                  yang salah bukan vendornya, melainkan <strong>penjadwalannya</strong>.
                  Ini percakapan yang berbeda dari vendor yang ingkar janji, dan
                  keduanya butuh tindakan yang berbeda pula.
                </>
              }
            />
          )}

          {/* Lapis 2b — kontrak payung sebagai kartu */}
          {data.kontrakPayung.kontrak.length > 0 && (
            <div className="rise rise-3" style={{ marginBottom: "var(--gap-bagian)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Boxes size={15} aria-hidden="true" style={{ color: C.mid }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Kontrak payung
                </h3>
                <span style={{ fontSize: 12, color: C.mid }}>
                  — sisa kuota per item, bukan hanya status kontraknya
                </span>
              </div>
              <div style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap" }}>
                {data.kontrakPayung.kontrak.map((k) => {
                  const meta = STATUS_PAYUNG[k.statusNyata];
                  return (
                    <div key={k.id} style={{
                      ...kartu, padding: "var(--pad-kartu-lega)", flex: "1 1 330px", minWidth: 310,
                      borderColor: k.aktifTapiTakBisaDipakai ? "var(--danger-border)" : C.border,
                      background: k.aktifTapiTakBisaDipakai ? "var(--danger-bg)" : "var(--surface)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                            {k.nomor}
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                            {k.judul} · {k.pemasok_nama ?? "—"}
                          </div>
                        </div>
                        <span style={{
                          padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                          color: meta.warna, background: meta.bg, whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {meta.label}
                        </span>
                      </div>

                      {k.aktifTapiTakBisaDipakai && (
                        <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 700, marginTop: 6 }}>
                          tercatat &ldquo;aktif&rdquo; — PO berikutnya ditagih di luar harga kontrak
                        </div>
                      )}

                      <div style={{ marginTop: 10 }}>
                        {k.itemDinilai.map((i) => <BatangKuota key={i.id} i={i} />)}
                      </div>

                      <div style={{
                        fontSize: 11, color: C.mid, marginTop: 10, lineHeight: 1.5,
                        display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap",
                      }}>
                        <span>
                          berlaku s.d. {tanggalTerbaca(k.berlaku_sampai)}
                          {k.sisaHari != null && k.sisaHari >= 0 && ` · ${k.sisaHari} hari lagi`}
                        </span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          terpakai {rupiah(k.nilaiTerpakai)}
                          {k.sisaPagu != null && ` · sisa pagu ${rupiah(k.sisaPagu)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lapis 3 — detail */}
          {data.expediting.kiriman.length > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Expediting &amp; logistik
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Telat dihitung dari <strong>kebutuhan kita</strong>, bukan dari janji
                  vendor — keduanya ditampilkan supaya selisihnya terlihat.
                </p>
              </div>
              <Tabel
                caption="Pelacakan kiriman PO beserta keterlambatan terhadap kebutuhan dan terhadap janji vendor"
                kolom={kolomKiriman}
                data={data.expediting.kiriman}
                kunciBaris={(k) => k.id}
                tandaiBaris={(k) => (k.kritis ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}

          {data.notaKredit.nota.length > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Nota kredit
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Disetujui {rupiah(data.notaKredit.totalDisetujui)} · sudah diterapkan{" "}
                  {rupiah(data.notaKredit.totalDiterapkan)}. Selisihnya belum mengurangi
                  tagihan apa pun.
                </p>
              </div>
              <Tabel
                caption="Nota kredit beserta nilai, status persetujuan, dan apakah potongannya sudah diterapkan"
                kolom={kolomNota}
                data={data.notaKredit.nota}
                kunciBaris={(n) => n.id}
                tandaiBaris={(n) => (n.menggantung ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
