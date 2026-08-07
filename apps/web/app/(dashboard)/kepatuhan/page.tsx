"use client";

/**
 * KEPATUHAN & K3 (TUNDA kelompok E)
 *
 * ── Yang dijawab halaman ini
 *
 * "Pihak ini boleh bekerja hari ini, atau tidak?"
 *
 * Tiga sudut dijawab BERSAMAAN: kinerjanya, dokumennya, dan izin kerjanya.
 * Menjawabnya di layar terpisah membuat jawaban yang bertentangan hidup
 * berdampingan — dan itulah cacat yang halaman ini ada untuk menutupnya.
 *
 * ── Empat hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Subkon berskor tinggi dengan asuransi MATI.** Data nyata di basis:
 *    PT Baja Perkasa berskor 89,1 — tertinggi — dan asuransi CAR-nya mati 98
 *    hari lalu. Layar yang hanya membaca skor akan merekomendasikannya.
 *
 * 2. **Centang hijau atas dokumen kedaluwarsa.** Kolom `terverifikasi` hanya
 *    menyatakan seseorang PERNAH memeriksanya — bukan bahwa dokumennya masih
 *    hidup hari ini.
 *
 * 3. **Kecelakaan kerja yang diratakan skor.** Subkon dengan skor K3 80 dan
 *    satu kecelakaan berat bukan subkon yang aman. Kecelakaan MENGGUGURKAN,
 *    bukan mengurangi.
 *
 * 4. **Izin kerja "disetujui" yang jendela waktunya sudah lewat.** Pekerjaan
 *    yang berjalan atas izin itu TIDAK BERIZIN, meski kolom statusnya hijau.
 *
 * Keempatnya dikunci di `apps/api/src/lib/kepatuhan-k3.ts` — 26 test,
 * 15 mutasi tertangkap. Halaman ini menampilkannya, bukan menghitung ulang.
 *
 * ── Tata letak: tiga lapis (ARAH-VISUAL §5b)
 *
 * KEADAAN (4 KPI) → POLA (peringatan + kesiapan pihak) → DETAIL (tabel).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldAlert, RefreshCw, TriangleAlert, HardHat, FileWarning, UserX } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type StatusDokumen = "berlaku" | "segera_habis" | "kedaluwarsa" | "tanpa_masa" | "belum_diverifikasi";

type Dokumen = {
  id: string;
  jenis: string;
  nomor: string | null;
  penerbit: string | null;
  pihak_nama: string | null;
  berlaku_sampai: string | null;
  nilai_pertanggungan: number | string | null;
  terverifikasi: boolean | null;
  status: StatusDokumen;
  sisaHari: number | null;
  hijauTapiMati: boolean;
};

type Evaluasi = {
  id: string;
  pihak_nama: string | null;
  periode: string | null;
  skor: number;
  rataPolos: number;
  titikLemah: string[];
  bolehDipakai: boolean;
  alasanTakBolehDipakai: string[];
  jumlah_kecelakaan: number | string | null;
  jumlah_pelanggaran_k3: number | string | null;
  masuk_daftar_hitam: boolean | null;
  catatan: string | null;
};

type Kesiapan = {
  nama: string;
  supplier_id: string | null;
  dokumenKedaluwarsa: number;
  dokumenSegeraHabis: number;
  skorTerakhir: number | null;
  bolehBekerja: boolean;
  alasan: string[];
};

type StatusIzin = "aktif" | "belum_mulai" | "kedaluwarsa" | "menunggu" | "tak_berlaku";

type Izin = {
  id: string;
  nomor: string;
  jenis: string;
  uraian_pekerjaan: string;
  lokasi: string | null;
  status: string;
  statusNyata: StatusIzin;
  berlaku_dari: string;
  berlaku_sampai: string;
  pengendalian_risiko: string | null;
  alasan_tolak: string | null;
  sisaJam: number | null;
  disetujuiTapiLewat: boolean;
};

type DataKepatuhan = {
  tanggal: string;
  dokumen: { dokumen: Dokumen[]; total: number; kedaluwarsa: number; segeraHabis: number; belumDiverifikasi: number; hijauTapiMati: number };
  evaluasi: Evaluasi[];
  kesiapan: Kesiapan[];
};

type DataIzin = { izin: Izin[]; aktif: number; menunggu: number; disetujuiTapiLewat: number };

const STATUS_DOK: Record<StatusDokumen, { label: string; warna: string; bg: string }> = {
  berlaku:            { label: "Berlaku",       warna: "var(--success)", bg: "var(--success-bg)" },
  segera_habis:       { label: "Segera habis",  warna: "var(--warning)", bg: "var(--warning-bg)" },
  kedaluwarsa:        { label: "Kedaluwarsa",   warna: "var(--danger)",  bg: "var(--danger-bg)" },
  tanpa_masa:         { label: "Tanpa masa",    warna: "var(--text-secondary)", bg: "var(--surface-subtle)" },
  belum_diverifikasi: { label: "Belum diperiksa", warna: "var(--info)",  bg: "var(--info-bg)" },
};

const STATUS_IZIN: Record<StatusIzin, { label: string; warna: string; bg: string }> = {
  aktif:       { label: "Aktif",        warna: "var(--success)", bg: "var(--success-bg)" },
  belum_mulai: { label: "Belum mulai",  warna: "var(--info)",    bg: "var(--info-bg)" },
  kedaluwarsa: { label: "Kedaluwarsa",  warna: "var(--danger)",  bg: "var(--danger-bg)" },
  menunggu:    { label: "Menunggu",     warna: "var(--warning)", bg: "var(--warning-bg)" },
  tak_berlaku: { label: "Tak berlaku",  warna: "var(--text-secondary)", bg: "var(--surface-subtle)" },
};

/**
 * Nama jenis dokumen untuk KOLOM TABEL.
 *
 * Kembaran dari `LABEL_JENIS_DOKUMEN` di `apps/api/src/lib/kepatuhan-k3.ts`.
 * Duplikasi ini disengaja dan berbatas: API memakainya untuk merakit KALIMAT
 * alasan ("Asuransi CAR kedaluwarsa") yang ikut ke notifikasi & ekspor;
 * halaman memakainya untuk mengisi satu SEL tabel. Menyeberangkannya lewat
 * balasan API berarti mengirim 15 pasang teks tetap di setiap permintaan.
 *
 * Kalau daftar jenis bertambah, ubah KEDUANYA — `uji-endpoint-ada.mjs` tak
 * memeriksa hal ini.
 */
const LABEL_JENIS: Record<string, string> = {
  nib: "NIB", siujk: "SIUJK", sbu: "SBU", npwp: "NPWP", pkp: "PKP", skt: "SKT",
  bpjs_ketenagakerjaan: "BPJS Ketenagakerjaan", bpjs_kesehatan: "BPJS Kesehatan",
  asuransi_car: "Asuransi CAR", asuransi_tpl: "Asuransi TPL", asuransi_cpm: "Asuransi CPM",
  smk3: "SMK3", iso_9001: "ISO 9001", iso_45001: "ISO 45001", lainnya: "Lainnya",
};

const LABEL_IZIN: Record<string, string> = {
  pekerjaan_panas: "Pekerjaan panas", ketinggian: "Ketinggian",
  ruang_terbatas: "Ruang terbatas", galian: "Galian", listrik: "Listrik",
  pengangkatan: "Pengangkatan", bahan_kimia: "Bahan kimia",
  radiografi: "Radiografi", lainnya: "Lainnya",
};

const tanggalTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const jamTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const rupiah = (n: number | string | null) => {
  const v = n == null ? null : Number(n);
  if (v == null || !Number.isFinite(v)) return "—";
  return "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
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
 * Kartu kesiapan satu pihak — jawaban gabungan atas tiga sudut.
 *
 * Skor ditampilkan BERSAMA alasan larangan, bukan salah satunya. Kalau cuma
 * skor, PT Baja Perkasa (89,1) terlihat pilihan terbaik meski asuransinya
 * mati; kalau cuma larangan, tak terlihat mana yang layak diperbaiki.
 */
function KartuKesiapan({ p }: { p: Kesiapan }) {
  return (
    <div style={{
      ...kartu, padding: "var(--pad-kartu-lega)", flex: "1 1 300px", minWidth: 280,
      borderColor: p.bolehBekerja ? C.border : "var(--danger-border)",
      background: p.bolehBekerja ? "var(--surface)" : "var(--danger-bg)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{p.nama}</span>
        <span style={{
          fontSize: 17, fontWeight: 700, fontVariantNumeric: "tabular-nums",
          color: p.skorTerakhir == null ? C.muted
            : p.skorTerakhir >= 70 ? "var(--success)"
            : p.skorTerakhir >= 50 ? "var(--warning)" : "var(--danger)",
        }}>
          {p.skorTerakhir == null ? "—" : p.skorTerakhir}
        </span>
      </div>

      <div style={{ marginTop: 8 }}>
        {p.bolehBekerja ? (
          <span style={{ color: "var(--success)", fontWeight: 700, fontSize: 13 }}>
            Boleh bekerja
          </span>
        ) : (
          <>
            <span style={{ color: "var(--danger)", fontWeight: 700, fontSize: 13 }}>
              TIDAK boleh bekerja
            </span>
            <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12, color: C.mid, lineHeight: 1.5 }}>
              {p.alasan.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginTop: 8, lineHeight: 1.45 }}>
        {p.skorTerakhir == null
          ? "belum pernah dinilai"
          : "skor evaluasi terbaru"}
        {p.dokumenSegeraHabis > 0 && ` · ${p.dokumenSegeraHabis} dokumen segera habis`}
      </div>
    </div>
  );
}

export default function KepatuhanPage() {
  const [data, setData] = useState<DataKepatuhan | null>(null);
  const [izin, setIzin] = useState<DataIzin | null>(null);
  const [galat, setGalat] = useState("");
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  // Pemuatan dilacak lewat putaran yang datanya sudah tiba, bukan bendera
  // boolean yang dinyalakan di badan efek — bendera memicu render bertingkat.
  const [putaranTiba, setPutaranTiba] = useState(-1);

  useEffect(() => {
    const ac = makeAbortController();
    Promise.all([
      api.get<DataKepatuhan>("/api/v1/kepatuhan", { signal: ac.signal }),
      api.get<DataIzin>("/api/v1/kepatuhan/izin-kerja", { signal: ac.signal }),
    ])
      .then(([k, z]) => { setData(k.data); setIzin(z.data); setGalat(""); })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat data kepatuhan"); })
      .finally(() => { if (!ac.signal.aborted) setPutaranTiba(muatUlangKe); });
    return () => ac.abort();
  }, [muatUlangKe]);

  const memuat = putaranTiba !== muatUlangKe;
  const muatUlang = useCallback(() => setMuatUlangKe((n) => n + 1), []);

  const takBolehBekerja = useMemo(
    () => (data?.kesiapan ?? []).filter((p) => !p.bolehBekerja).length, [data]);

  const kolomDokumen: Array<Kolom<Dokumen>> = useMemo(() => [
    {
      kunci: "pihak", judul: "Pihak", kepalaBaris: true,
      render: (d) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{d.pihak_nama ?? "—"}</span>
          {d.nomor && <span style={{ display: "block", fontSize: 11, color: C.muted }}>{d.nomor}</span>}
        </span>
      ),
    },
    {
      kunci: "jenis", judul: "Dokumen",
      render: (d) => <span style={{ color: C.text }}>{LABEL_JENIS[d.jenis] ?? d.jenis}</span>,
    },
    {
      kunci: "status", judul: "Keadaan",
      render: (d) => (
        <span>
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            color: STATUS_DOK[d.status].warna, background: STATUS_DOK[d.status].bg,
          }}>
            {STATUS_DOK[d.status].label}
          </span>
          {d.hijauTapiMati && (
            // Bukan pengulangan status: yang ditandai di sini adalah CENTANG
            // HIJAU atas dokumen yang sudah mati — keadaan yang paling
            // menyesatkan pembacanya.
            <span style={{ display: "block", fontSize: 11, color: "var(--danger)", fontWeight: 600, marginTop: 3 }}>
              bercentang terverifikasi
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "berlaku", judul: "Berlaku sampai", rata: "kanan",
      render: (d) => (
        <span style={{ color: d.status === "kedaluwarsa" ? "var(--danger)" : C.mid, whiteSpace: "nowrap" }}>
          {d.berlaku_sampai ? tanggalTerbaca(d.berlaku_sampai) : "tak bermasa"}
          {d.sisaHari != null && (
            <span style={{ display: "block", fontSize: 11 }}>
              {d.sisaHari < 0 ? `lewat ${Math.abs(d.sisaHari)} hari` : `${d.sisaHari} hari lagi`}
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "nilai", judul: "Pertanggungan", rata: "kanan",
      render: (d) => (
        <span style={{ color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(d.nilai_pertanggungan)}
        </span>
      ),
    },
  ], []);

  const kolomEvaluasi: Array<Kolom<Evaluasi>> = useMemo(() => [
    {
      kunci: "pihak", judul: "Subkontraktor", kepalaBaris: true,
      render: (e) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text }}>{e.pihak_nama ?? "—"}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>
            periode {tanggalTerbaca(e.periode)}
          </span>
        </span>
      ),
    },
    {
      kunci: "skor", judul: "Skor berbobot", rata: "kanan",
      render: (e) => (
        <span style={{
          fontWeight: 700, fontVariantNumeric: "tabular-nums",
          color: !e.bolehDipakai ? "var(--danger)"
            : e.skor >= 70 ? "var(--success)" : "var(--warning)",
        }}>
          {e.skor}
          {/* Rata-rata polos dibawa untuk DIBANDINGKAN — bobot K3 25% dan
              kerjasama 10% membuat keduanya bisa jauh berbeda. */}
          <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: C.mid }}>
            rata polos {e.rataPolos}
          </span>
        </span>
      ),
    },
    {
      kunci: "k3", judul: "Kejadian K3", rata: "kanan",
      render: (e) => {
        const kec = Number(e.jumlah_kecelakaan ?? 0);
        const pel = Number(e.jumlah_pelanggaran_k3 ?? 0);
        if (kec === 0 && pel === 0) {
          return <span style={{ color: "var(--success)", fontSize: 12 }}>nihil</span>;
        }
        return (
          <span style={{ whiteSpace: "nowrap" }}>
            {kec > 0 && (
              <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                {kec} kecelakaan
              </span>
            )}
            {pel > 0 && (
              <span style={{
                display: "block", fontSize: 11,
                color: pel >= 3 ? "var(--danger)" : C.mid,
                fontWeight: pel >= 3 ? 600 : 400,
              }}>
                {pel} pelanggaran K3
              </span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "boleh", judul: "Boleh dipakai?",
      render: (e) =>
        e.bolehDipakai ? (
          <span style={{ color: "var(--success)", fontWeight: 600 }}>Ya</span>
        ) : (
          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
            Tidak
            <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: C.mid }}>
              {e.alasanTakBolehDipakai.join(" · ")}
            </span>
          </span>
        ),
    },
    {
      kunci: "lemah", judul: "Titik lemah",
      render: (e) => e.titikLemah.length
        ? <span style={{ fontSize: 12, color: "var(--warning)" }}>{e.titikLemah.join(", ")}</span>
        : <span style={{ color: C.muted }}>—</span>,
    },
  ], []);

  const kolomIzin: Array<Kolom<Izin>> = useMemo(() => [
    {
      kunci: "nomor", judul: "Nomor", kepalaBaris: true,
      render: (z) => (
        <span>
          <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{z.nomor}</span>
          <span style={{ display: "block", fontSize: 11, color: C.muted }}>
            {LABEL_IZIN[z.jenis] ?? z.jenis}
          </span>
        </span>
      ),
    },
    {
      kunci: "uraian", judul: "Pekerjaan",
      render: (z) => (
        <span>
          <span style={{ fontSize: 13, color: C.text }}>{z.uraian_pekerjaan}</span>
          {z.lokasi && <span style={{ display: "block", fontSize: 11, color: C.muted }}>{z.lokasi}</span>}
        </span>
      ),
    },
    {
      kunci: "jendela", judul: "Jendela berlaku", rata: "kanan",
      render: (z) => (
        <span style={{ color: C.mid, fontSize: 12, whiteSpace: "nowrap" }}>
          {jamTerbaca(z.berlaku_dari)}
          <span style={{ display: "block" }}>s.d. {jamTerbaca(z.berlaku_sampai)}</span>
        </span>
      ),
    },
    {
      kunci: "keadaan", judul: "Keadaan NYATA",
      render: (z) => (
        <span>
          <span style={{
            padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
            color: STATUS_IZIN[z.statusNyata].warna, background: STATUS_IZIN[z.statusNyata].bg,
          }}>
            {STATUS_IZIN[z.statusNyata].label}
          </span>
          {z.disetujuiTapiLewat && (
            // Kolom `status` di basis masih 'disetujui'. Yang membacanya dari
            // sana saja akan mengira pekerjaannya berizin.
            <span style={{ display: "block", fontSize: 11, color: "var(--danger)", fontWeight: 700, marginTop: 3 }}>
              tercatat &ldquo;disetujui&rdquo; — pekerjaan TIDAK BERIZIN
            </span>
          )}
          {z.statusNyata === "tak_berlaku" && z.alasan_tolak && (
            <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 3 }}>
              {z.alasan_tolak}
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "k3", judul: "Pengendalian risiko",
      render: (z) =>
        z.pengendalian_risiko
          ? <span style={{ fontSize: 12, color: C.mid }}>
              {z.pengendalian_risiko.slice(0, 80)}{z.pengendalian_risiko.length > 80 ? "…" : ""}
            </span>
          : <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 600 }}>belum dijelaskan</span>,
    },
  ], []);

  const kosongSeluruhnya =
    !data || (data.dokumen.total === 0 && data.evaluasi.length === 0 && (izin?.izin.length ?? 0) === 0);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            Kepatuhan &amp; K3
          </h2>
          <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
            <strong>Pihak ini boleh bekerja hari ini, atau tidak?</strong> Dijawab dari
            tiga sudut sekaligus — kinerjanya, dokumennya, dan izin kerjanya. Subkon
            berskor tinggi dengan asuransi mati tetap <strong>tidak boleh bekerja</strong>,
            dan itu tak terlihat kalau ketiganya dibaca terpisah.
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
          Memuat data kepatuhan…
        </div>
      ) : kosongSeluruhnya ? (
        <Kosong
          ikon={<ShieldAlert size={28} />}
          judul="Belum ada catatan kepatuhan"
          sebab={
            <>
              Dokumen kepatuhan mencatat izin, asuransi, dan pajak beserta masa
              berlakunya; evaluasi mencatat kinerja dan kejadian K3-nya. Keduanya
              yang ditanyakan saat ada pekerja terluka — dan jawabannya menentukan
              siapa yang menanggung biaya pengobatannya.
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
              label="Tak boleh bekerja"
              nilai={String(takBolehBekerja)}
              warna={takBolehBekerja > 0 ? "var(--danger)" : "var(--success)"}
              keterangan={`dari ${data.kesiapan.length} pihak tercatat`}
            />
            <Kpi
              label="Hijau tapi mati"
              nilai={String(data.dokumen.hijauTapiMati)}
              warna={data.dokumen.hijauTapiMati > 0 ? "var(--danger)" : undefined}
              keterangan={
                data.dokumen.hijauTapiMati > 0
                  ? "bercentang terverifikasi, sudah kedaluwarsa"
                  : "tak ada centang yang menyesatkan"
              }
            />
            <Kpi
              label="Dokumen segera habis"
              nilai={String(data.dokumen.segeraHabis)}
              warna={data.dokumen.segeraHabis > 0 ? "var(--warning)" : undefined}
              keterangan="dalam 60 hari — masih bisa diurus"
            />
            <Kpi
              label="Izin tak berizin"
              nilai={String(izin?.disetujuiTapiLewat ?? 0)}
              warna={(izin?.disetujuiTapiLewat ?? 0) > 0 ? "var(--danger)" : undefined}
              keterangan={`${izin?.aktif ?? 0} izin aktif · ${izin?.menunggu ?? 0} menunggu putusan`}
            />
          </div>

          {/* Lapis 2 — peringatan & kesiapan pihak */}
          {data.dokumen.hijauTapiMati > 0 && (
            <Peringatan
              nada="danger"
              ikon={<FileWarning size={16} aria-hidden="true" />}
              judul={`${data.dokumen.hijauTapiMati} dokumen bercentang terverifikasi TAPI sudah kedaluwarsa`}
              isi={
                <>
                  Kolom &ldquo;terverifikasi&rdquo; hanya menyatakan seseorang{" "}
                  <strong>pernah</strong> memeriksanya — bukan bahwa dokumennya masih
                  hidup hari ini. Asuransi yang diperiksa Januari dan mati Maret tetap
                  bercentang hijau, dan itu ketahuan saat ada pekerja terluka.
                </>
              }
            />
          )}

          {(izin?.disetujuiTapiLewat ?? 0) > 0 && (
            <Peringatan
              nada="danger"
              ikon={<HardHat size={16} aria-hidden="true" />}
              judul={`${izin!.disetujuiTapiLewat} izin kerja tercatat "disetujui" padahal jendela waktunya sudah lewat`}
              isi={
                <>
                  Izin kerja bukan dokumen abadi — ia berlaku untuk satu rentang waktu.
                  Pekerjaan yang berjalan di luar rentang itu <strong>tidak berizin</strong>,
                  dan yang membacanya dari kolom status saja akan mengira sebaliknya.
                  Terbitkan izin baru, jangan pakai yang lama.
                </>
              }
            />
          )}

          {takBolehBekerja > 0 && (
            <Peringatan
              nada="warning"
              ikon={<UserX size={16} aria-hidden="true" />}
              judul={`${takBolehBekerja} pihak tidak boleh bekerja hari ini`}
              isi={
                <>
                  Alasannya bisa dokumen kedaluwarsa, kecelakaan kerja, atau daftar hitam —
                  dan <strong>skor kinerja yang tinggi tidak membatalkannya</strong>.
                  Rinciannya di kartu bawah.
                </>
              }
            />
          )}

          {data.kesiapan.length > 0 && (
            <div className="rise rise-3" style={{ marginBottom: "var(--gap-bagian)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <TriangleAlert size={15} aria-hidden="true" style={{ color: C.mid }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Kesiapan per pihak
                </h3>
                <span style={{ fontSize: 12, color: C.mid }}>
                  — kinerja DAN dokumen, bukan salah satunya
                </span>
              </div>
              <div style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap" }}>
                {data.kesiapan.map((p) => (
                  <KartuKesiapan key={p.supplier_id ?? p.nama} p={p} />
                ))}
              </div>
            </div>
          )}

          {/* Lapis 3 — detail */}
          {(izin?.izin.length ?? 0) > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Izin kerja (work permit)
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Kolom &ldquo;keadaan nyata&rdquo; dihitung dari jendela waktunya, bukan
                  disalin dari status yang tersimpan.
                </p>
              </div>
              <Tabel
                caption="Daftar izin kerja beserta jendela berlaku dan keadaan nyatanya hari ini"
                kolom={kolomIzin}
                data={izin!.izin}
                kunciBaris={(z) => z.id}
                tandaiBaris={(z) => (z.disetujuiTapiLewat ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}

          {data.dokumen.total > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Dokumen kepatuhan
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Izin, asuransi, dan pajak. Yang bermasalah naik ke atas.
                </p>
              </div>
              <Tabel
                caption="Dokumen kepatuhan beserta masa berlaku dan status verifikasinya"
                kolom={kolomDokumen}
                data={data.dokumen.dokumen}
                kunciBaris={(d) => d.id}
                tandaiBaris={(d) => (d.status === "kedaluwarsa" ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}

          {data.evaluasi.length > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Evaluasi kinerja subkontraktor
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Kecelakaan kerja <strong>menggugurkan</strong>, bukan mengurangi —
                  ia tak diratakan dengan empat dimensi lain.
                </p>
              </div>
              <Tabel
                caption="Evaluasi subkontraktor beserta skor berbobot, kejadian K3, dan kelayakannya dipakai"
                kolom={kolomEvaluasi}
                data={data.evaluasi}
                kunciBaris={(e) => e.id}
                tandaiBaris={(e) => (e.bolehDipakai ? undefined : "var(--danger-bg)")}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
