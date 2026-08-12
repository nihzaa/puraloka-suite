"use client";

/**
 * SERTIFIKAT IPC — Interim Payment Certificate (INTI #2)
 *
 * ── Yang dijawab halaman ini
 *
 * "Waktu termin ini ditagih, progresnya berapa, dan siapa yang mengakuinya?"
 *
 * Gerbang progres sudah ada di API — ia menolak termin `on_progress` yang
 * ditagih sebelum ambangnya tercapai. Tapi **angkanya tak pernah disimpan**.
 * Enam bulan kemudian `projects.progress_pct` sudah bergerak, dan saat owner
 * mempersoalkan sebuah termin, yang tersedia hanya progres HARI INI.
 *
 * Diukur 2026-08-07: 40 termin (18 dibayar · 7 tertagih), 26 invoice,
 * Rp 4,88 miliar nilai kontrak — nol sertifikat.
 *
 * ── Tiga hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Progres 100% bukan "seluruh nilai kontrak cair".** Retensi tetap
 *    ditahan sampai masa pemeliharaan lewat. Menampilkan "100% → Rp X penuh"
 *    membuat orang mengira uangnya sudah boleh diminta.
 *
 * 2. **Nilai periode negatif bukan "nol".** Ia berarti progres yang diakui
 *    sekarang LEBIH RENDAH daripada yang sudah ditagih — entah dikoreksi
 *    turun, entah ada penagihan ganda. Membulatkannya ke nol menghapus
 *    satu-satunya gejala.
 *
 * 3. **Nilai bersih negatif tidak disembunyikan.** Potongan yang melebihi hak
 *    tagih periode ini adalah uang yang harus dibawa ke periode berikutnya;
 *    memaksanya ke nol membuatnya lenyap tanpa jejak.
 *
 * Ketiganya dikunci di `apps/api/src/lib/sertifikat-ipc.ts` — 15 test,
 * 7 mutasi tertangkap. Halaman ini menampilkannya, bukan menghitung ulang.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck2, RefreshCw, TriangleAlert, Lock } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type StatusIpc = "draft" | "disetujui" | "ditagihkan" | "ditolak" | "batal";

type Peringatan =
  | "periode_negatif" | "potongan_melebihi_hak" | "prestasi_penuh" | "tak_ada_yang_ditagih";

type Hitung = {
  nilai_prestasi: number;
  nilai_periode: number;
  retensi: number;
  potongan_dp: number;
  potongan_lain: number;
  nilai_bersih: number;
  retensi_kumulatif_estimasi: number;
  peringatan: Peringatan[];
  layak_diajukan: boolean;
};

type Sertifikat = {
  id: string;
  nomor: string;
  tanggal: string | null;
  status: StatusIpc;
  progres_diakui_pct: number | string;
  nilai_kontrak: number | string;
  retensi_pct: number | string;
  kumulatif_sebelumnya: number | string;
  potongan_dp: number | string;
  potongan_lain: number | string;
  potongan_lain_alasan: string | null;
  catatan: string | null;
  disetujui_pada: string | null;
  invoice_id: string | null;
  proyek: { id: string; name: string } | null;
  termin: { id: string; termin_number: number; label: string | null; amount: number | string } | null;
  penyetuju: { id: string; name: string } | null;
  hitung: Hitung;
};

const rupiah = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === ""
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency", currency: "IDR", maximumFractionDigits: 0,
      }).format(Number(n));

const tanggalTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const persen = (n: number | string) => `${Number(n).toFixed(1)}%`;

const STATUS_META: Record<StatusIpc, { label: string; warna: string; bg: string; border: string }> = {
  draft:      { label: "Draft",      warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
  disetujui:  { label: "Disetujui",  warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  ditagihkan: { label: "Ditagihkan", warna: "var(--info)",    bg: "var(--info-bg)",    border: "var(--info-border)" },
  ditolak:    { label: "Ditolak",    warna: "var(--danger)",  bg: "var(--danger-bg)",  border: "var(--danger-border)" },
  batal:      { label: "Batal",      warna: "var(--text-muted)", bg: "var(--surface-subtle)", border: "var(--border)" },
};

/**
 * Tiap peringatan punya KATA dan kalimat penjelasnya, bukan hanya warna.
 *
 * WCAG 1.4.1: yang tak bisa membedakan warna, dan pembaca layar, sama-sama
 * hanya punya teks ini. Angka merah tanpa kalimat tak memberi tahu apa yang
 * harus dikerjakan — dan pada nilai tagihan, "apa yang harus dikerjakan"
 * adalah seluruh gunanya peringatan.
 */
const PERINGATAN_META: Record<Peringatan, { judul: string; sebab: string; nada: "bahaya" | "waspada" | "kabar" }> = {
  periode_negatif: {
    judul: "Progres yang diakui lebih rendah dari yang sudah ditagih",
    sebab: "Entah progres dikoreksi turun, entah ada termin yang tertagih dua kali. Periksa sertifikat-sertifikat sebelumnya sebelum ini diajukan — mengajukannya berarti menagih sesuatu yang sudah dibayar.",
    nada: "bahaya",
  },
  potongan_melebihi_hak: {
    judul: "Potongan melebihi hak tagih periode ini",
    sebab: "Kelebihannya tidak hilang — ia harus dibawa ke sertifikat berikutnya. Kalau dibiarkan, potongan itu terpakai dua kali.",
    nada: "waspada",
  },
  prestasi_penuh: {
    judul: "Prestasi sudah 100% — tapi ini bukan pelunasan",
    sebab: "Retensi tetap ditahan sampai masa pemeliharaan lewat. Nilai bersih di bawah adalah yang cair sekarang, bukan sisa seluruh kontrak.",
    nada: "kabar",
  },
  tak_ada_yang_ditagih: {
    judul: "Tak ada yang bisa ditagih periode ini",
    sebab: "Progres yang diakui sama dengan yang sudah ditagih. Sertifikat ini sah dicatat, tapi belum ada nilai yang bisa diajukan.",
    nada: "kabar",
  },
};

const NADA: Record<"bahaya" | "waspada" | "kabar", { warna: string; bg: string; border: string }> = {
  bahaya:  { warna: "var(--danger)",  bg: "var(--danger-bg)",  border: "var(--danger-border)" },
  waspada: { warna: "var(--warning)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
  kabar:   { warna: "var(--info)",    bg: "var(--info-bg)",    border: "var(--info-border)" },
};

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
    <div style={{ ...kartu, padding: "12px 16px", flex: "1 1 190px", minWidth: 175 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{
        fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4, lineHeight: 1.1,
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

export default function SertifikatIpcPage() {
  const [daftar, setDaftar] = useState<Sertifikat[]>([]);
  const [terpilih, setTerpilih] = useState("");
  const [galat, setGalat] = useState("");
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  // Pemuatan dilacak lewat putaran yang datanya sudah tiba, bukan bendera
  // boolean yang dinyalakan di badan efek — bendera memaksa setState sinkron
  // dan memicu render bertingkat.
  const [putaranTiba, setPutaranTiba] = useState(-1);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ sertifikat: Sertifikat[] }>("/api/v1/sertifikat-ipc", { signal: ac.signal })
      .then((r) => { setDaftar(r.data.sertifikat ?? []); setGalat(""); })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat sertifikat IPC"); })
      .finally(() => { if (!ac.signal.aborted) setPutaranTiba(muatUlangKe); });
    return () => ac.abort();
  }, [muatUlangKe]);

  const memuat = putaranTiba !== muatUlangKe;
  const muatUlang = useCallback(() => setMuatUlangKe((n) => n + 1), []);

  // Pilihan awal jatuh ke sertifikat yang paling PERLU TINDAKAN, bukan yang
  // paling baru.
  //
  // API mengurutkan `tanggal DESC`. Kebetulan itu membuka sertifikat paling
  // bermasalah — dan kebetulan bukan alasan yang bisa diandalkan: begitu ada
  // sertifikat baru yang sehat, yang bermasalah tenggelam di daftar dan tak
  // ada yang membukanya lagi.
  //
  // `periode_negatif` didahulukan atas `potongan_melebihi_hak`: yang pertama
  // berarti menagih sesuatu yang sudah dibayar, yang kedua "hanya" salah
  // urutan potongan.
  const awal = useMemo(() => {
    const berat = (s: Sertifikat) =>
      s.hitung.peringatan.includes("periode_negatif") ? 0
      : s.hitung.peringatan.includes("potongan_melebihi_hak") ? 1
      : 2;
    return [...daftar].sort((a, b) => berat(a) - berat(b))[0];
  }, [daftar]);

  const aktif = useMemo(
    () => daftar.find((s) => s.id === terpilih) ?? awal,
    [daftar, terpilih, awal],
  );

  /** Berapa sertifikat yang menuntut tindakan — dipakai memberi tahu KENAPA
   *  layar membuka di sini, bukan membiarkannya tampak sebagai keadaan biasa. */
  const perluTindakan = useMemo(
    () => daftar.filter((s) =>
      s.hitung.peringatan.includes("periode_negatif") ||
      s.hitung.peringatan.includes("potongan_melebihi_hak")).length,
    [daftar],
  );

  const kolom: Array<Kolom<Sertifikat>> = useMemo(() => [
    {
      kunci: "nomor", judul: "Nomor", kepalaBaris: true,
      render: (s) => <span style={{ fontWeight: 600, color: C.text }}>{s.nomor}</span>,
    },
    {
      kunci: "proyek", judul: "Proyek",
      render: (s) => <span style={{ color: C.mid }}>{s.proyek?.name ?? "—"}</span>,
    },
    {
      kunci: "progres", judul: "Progres diakui", rata: "kanan",
      render: (s) => persen(s.progres_diakui_pct),
    },
    {
      kunci: "periode", judul: "Nilai periode", rata: "kanan",
      render: (s) => (
        <span style={{ color: s.hitung.nilai_periode < 0 ? "var(--danger)" : C.text }}>
          {rupiah(s.hitung.nilai_periode)}
        </span>
      ),
    },
    {
      kunci: "retensi", judul: "Retensi ditahan", rata: "kanan",
      render: (s) => <span style={{ color: C.mid }}>{rupiah(s.hitung.retensi)}</span>,
    },
    {
      kunci: "bersih", judul: "Boleh ditagih", rata: "kanan",
      render: (s) => (
        <span style={{
          fontWeight: 700,
          color: s.hitung.nilai_bersih < 0 ? "var(--danger)" : C.text,
        }}>
          {rupiah(s.hitung.nilai_bersih)}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (s) => (
        <span style={{
          padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          color: STATUS_META[s.status].warna, background: STATUS_META[s.status].bg,
        }}>
          {STATUS_META[s.status].label}
        </span>
      ),
    },
    {
      kunci: "penyetuju", judul: "Diakui oleh",
      render: (s) => s.penyetuju
        ? <span style={{ color: C.mid, fontSize: 12 }}>{s.penyetuju.name}</span>
        : <span style={{ color: C.muted }}>belum</span>,
    },
  ], []);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
          Sertifikat IPC
        </h2>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Berapa progres yang <strong>diakui</strong> saat sebuah termin ditagih, siapa
          yang mengakuinya, dan berapa yang boleh cair setelah retensi dan potongan.
          Tanpa sertifikat, angka itu ikut bergerak bersama progres — dan enam bulan
          kemudian tak ada yang bisa menjawab berapa dasarnya waktu itu.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          ...kartu, padding: "10px 14px", marginBottom: 16,
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat sertifikat…
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<FileCheck2 size={28} />}
          judul="Belum ada sertifikat IPC"
          sebab={
            <>
              Sertifikat IPC membekukan progres yang diakui saat termin ditagih —
              beserta retensi, potongan, dan siapa yang mengakuinya. Itulah yang
              ditanyakan saat owner mempersoalkan sebuah tagihan, dan yang selama
              ini ikut berubah setiap kali progres proyek bergerak.
            </>
          }
        />
      ) : !aktif ? null : (
        <>
          {/* Pemilih + muat ulang */}
          <div className="rise rise-2" style={{
            ...kartu, padding: "12px 16px", marginBottom: 16,
            display: "flex", gap: "var(--gap-bagian)", alignItems: "flex-end", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 280, flex: "1 1 320px" }}>
              <label htmlFor="ipc-pilih" style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>
                Sertifikat
              </label>
              <select
                id="ipc-pilih" value={aktif.id}
                onChange={(e) => setTerpilih(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`,
                  borderRadius: 6, fontSize: 13, background: "var(--surface)", color: C.text,
                }}
              >
                {daftar.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nomor} — {s.proyek?.name ?? "—"} · {persen(s.progres_diakui_pct)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button" onClick={muatUlang}
              style={{
                marginLeft: "auto", padding: "8px 12px", borderRadius: 6,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.mid, fontSize: 12, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <RefreshCw size={12} aria-hidden="true" /> Muat ulang
            </button>
          </div>

          {/* Kenapa layar membuka di sini — tanpa kalimat ini, sertifikat
              bermasalah yang terbuka lebih dulu terbaca sebagai keadaan biasa. */}
          {perluTindakan > 0 && !terpilih && (
            <div className="rise rise-2" style={{
              ...kartu, padding: "10px 14px", marginBottom: 16,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
              fontSize: 13, color: C.text, lineHeight: 1.55,
            }}>
              <strong style={{ color: "var(--warning)" }}>
                {perluTindakan} sertifikat menuntut pemeriksaan
              </strong>
              {" "}— layar dibuka pada yang paling berat lebih dulu, bukan yang paling baru.
            </div>
          )}

          {/* Kepala sertifikat */}
          <div className="rise rise-2b" style={{ ...kartu, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{aktif.nomor}</span>
              {/* Status sebagai KATA, bukan hanya warna (WCAG 1.4.1). */}
              <span style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: STATUS_META[aktif.status].warna,
                background: STATUS_META[aktif.status].bg,
                border: `1px solid ${STATUS_META[aktif.status].border}`,
              }}>
                {STATUS_META[aktif.status].label}
              </span>
            </div>
            <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>
              {aktif.proyek?.name ?? "—"} · terbit {tanggalTerbaca(aktif.tanggal)}
              {aktif.termin && ` · termin ${aktif.termin.termin_number}${aktif.termin.label ? ` (${aktif.termin.label})` : ""}`}
              {aktif.penyetuju && ` · diakui oleh ${aktif.penyetuju.name}`}
            </div>
          </div>

          {/* Lapis 1: keadaan */}
          <div className="rise rise-3" style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap", marginBottom: 16 }}>
            <Kpi
              label="Progres diakui"
              nilai={persen(aktif.progres_diakui_pct)}
              keterangan={`dari kontrak ${rupiah(aktif.nilai_kontrak)}`}
            />
            <Kpi
              label="Nilai periode"
              nilai={rupiah(aktif.hitung.nilai_periode)}
              warna={aktif.hitung.nilai_periode < 0 ? "var(--danger)" : undefined}
              keterangan={
                Number(aktif.kumulatif_sebelumnya) > 0
                  ? `sudah ditagih ${rupiah(aktif.kumulatif_sebelumnya)}`
                  : "belum ada penagihan sebelumnya"
              }
            />
            <Kpi
              label="Retensi ditahan"
              nilai={rupiah(aktif.hitung.retensi)}
              keterangan={`${persen(aktif.retensi_pct)} · total tertahan ± ${rupiah(aktif.hitung.retensi_kumulatif_estimasi)}`}
            />
            <Kpi
              label="Boleh ditagih"
              nilai={rupiah(aktif.hitung.nilai_bersih)}
              warna={aktif.hitung.nilai_bersih < 0 ? "var(--danger)" : "var(--success)"}
              keterangan={
                aktif.hitung.layak_diajukan
                  ? "sesudah retensi & potongan"
                  : "belum layak diajukan — lihat peringatan"
              }
            />
          </div>

          {/* Peringatan — tiap satu punya kalimat, bukan hanya warna */}
          {aktif.hitung.peringatan.map((p) => {
            const meta = PERINGATAN_META[p];
            const nada = NADA[meta.nada];
            return (
              <div key={p} className="rise rise-3" style={{
                ...kartu, padding: "12px 16px", marginBottom: 12,
                borderColor: nada.border, background: nada.bg,
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                {p === "prestasi_penuh"
                  ? <Lock size={16} aria-hidden="true" style={{ color: nada.warna, flexShrink: 0, marginTop: 1 }} />
                  : <TriangleAlert size={16} aria-hidden="true" style={{ color: nada.warna, flexShrink: 0, marginTop: 1 }} />}
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                  <strong style={{ color: nada.warna }}>{meta.judul}</strong>
                  <div style={{ marginTop: 2, color: C.mid }}>{meta.sebab}</div>
                </div>
              </div>
            );
          })}

          {/* Rincian potongan — hanya bila ada */}
          {(Number(aktif.potongan_dp) > 0 || Number(aktif.potongan_lain) > 0) && (
            <div className="rise rise-3" style={{ ...kartu, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.mid, marginBottom: 6 }}>
                Potongan periode ini
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
                {Number(aktif.potongan_dp) > 0 && (
                  <span style={{ color: C.text }}>
                    Uang muka: <strong>{rupiah(aktif.potongan_dp)}</strong>
                  </span>
                )}
                {Number(aktif.potongan_lain) > 0 && (
                  <span style={{ color: C.text }}>
                    Lain-lain: <strong>{rupiah(aktif.potongan_lain)}</strong>
                    {aktif.potongan_lain_alasan && (
                      <span style={{ color: C.mid }}> — {aktif.potongan_lain_alasan}</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Lapis 3: detail seluruh sertifikat */}
          <div className="rise rise-4" style={{ ...kartu, padding: "4px 4px 0", overflow: "hidden" }}>
            <Tabel<Sertifikat>
              caption="Seluruh sertifikat IPC beserta nilai periode, retensi, dan yang boleh ditagih"
              kolom={kolom}
              data={daftar}
              kunciBaris={(s) => s.id}
              tandaiBaris={(s) => (s.id === aktif.id ? "var(--surface-hover)" : undefined)}
            />
          </div>
        </>
      )}
    </div>
  );
}
