"use client";

/**
 * JADWAL — CPM · KALENDER KERJA · SUMBER DAYA · METHOD STATEMENT
 * (TUNDA kelompok C)
 *
 * ── Yang dijawab halaman ini
 *
 * "Pekerjaan mana yang kalau telat SEHARI membuat seluruh proyek telat, dan
 * minggu mana yang tenaganya kurang?"
 *
 * ── Lima hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Durasi dari hari kalender.** Pekerjaan 20 hari yang dimulai Senin
 *    tidak selesai 20 hari kemudian — ada 6 hari Minggu dan mungkin Lebaran
 *    di antaranya. Kartu "hari kerja" menyebut KEDUANYA supaya selisihnya
 *    terlihat, karena selisih itulah yang jadi sengketa denda.
 *
 * 2. **Jadwal "aman" yang lingkarannya tak terlihat.** A menunggu B, B
 *    menunggu C, C menunggu A: tak ada yang bisa dimulai, tapi daftarnya
 *    tetap rapi. Di sini lingkarannya diumumkan, dan jalur kritis
 *    dikosongkan — bukan dikarang.
 *
 * 3. **Float −1 untuk proyek yang telat lima minggu.** Angka itu terbaca
 *    "telat sehari" dan tak ada yang panik. Float negatif di sini sebanding
 *    dengan besarnya keterlambatan.
 *
 * 4. **Jalur kritis KOSONG justru saat proyek paling genting.** Kalau
 *    "kritis" berarti float tepat nol, proyek yang sudah telat tak punya
 *    satu pun — dan layarnya terlihat paling tenang saat keadaannya paling
 *    buruk.
 *
 * 5. **Histogram sumber daya yang meratakan puncak.** 40 tukang di minggu 7
 *    dan 4 di minggu 8 punya rata-rata 22 — angka yang tak pernah terjadi.
 *
 * Kelimanya dikunci di `apps/api/src/lib/cpm.ts` — 33 test, 14 mutasi
 * tertangkap. Halaman ini menampilkannya, bukan menghitung ulang.
 *
 * ── Tata letak: tiga lapis (ARAH-VISUAL §5b)
 *
 * KEADAAN (4 KPI) → POLA (histogram + peringatan) → DETAIL (tabel).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, RefreshCw, TriangleAlert, Users, GitBranch } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";
import { TabBagian } from "@/components/tab-bagian";

type Pekerjaan = {
  id: string;
  nama: string;
  durasi: number;
  mulaiPalingAwal: string | null;
  selesaiPalingAwal: string | null;
  mulaiPalingLambat: string | null;
  selesaiPalingLambat: string | null;
  float: number | null;
  kritis: boolean;
};

type Periode = { minggu: string; dibutuhkan: number; tersedia: number | null; kelebihan: number };

type SumberDaya = {
  nama: string;
  jenis: string;
  periode: Periode[];
  puncak: number;
  mingguPuncak: string | null;
  tersedia: number | null;
  mingguKelebihan: string[];
};

type MethodStatement = {
  id: string;
  nomor: string;
  judul: string;
  status: "draft" | "diajukan" | "disetujui" | "ditolak" | "revisi";
  alasan_tolak: string | null;
  pengendalian_risiko: string | null;
  diputuskan_pada: string | null;
};

type Jadwal = {
  proyek: { id: string; nama: string; mulai: string | null; akhir: string | null };
  kalender: {
    pola: Record<string, unknown> | null;
    libur: Array<{ tanggal: string; nama: string; jenis: string; tetap_bekerja: boolean }>;
    hariKerjaProyek: number | null;
  };
  cpm: {
    pekerjaan: Pekerjaan[];
    jalurKritis: string[];
    selesaiProyek: string | null;
    lingkaran: string[];
    tanpaDurasi: string[];
  };
  histogram: SumberDaya[];
  methodStatement: MethodStatement[];
};

type Proyek = { id: string; name: string; status?: string | null };

const STATUS_MS: Record<MethodStatement["status"], { label: string; warna: string; bg: string }> = {
  draft:     { label: "Draft",     warna: "var(--text-secondary)", bg: "var(--surface-subtle)" },
  diajukan:  { label: "Diajukan",  warna: "var(--info)",    bg: "var(--info-bg)" },
  disetujui: { label: "Disetujui", warna: "var(--success)", bg: "var(--success-bg)" },
  ditolak:   { label: "Ditolak",   warna: "var(--danger)",  bg: "var(--danger-bg)" },
  revisi:    { label: "Revisi",    warna: "var(--warning)", bg: "var(--warning-bg)" },
};

const tanggalTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

const tanggalPendek = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

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

/**
 * Histogram satu sumber daya per minggu.
 *
 * Batas `tersedia` digambar sebagai GARIS, dan batang yang melewatinya
 * diberi warna berbeda BESERTA angka kelebihannya — warna sendirian tak
 * boleh jadi satu-satunya pembawa makna (WCAG 1.4.1).
 */
function Histogram({ sd }: { sd: SumberDaya }) {
  const maks = Math.max(sd.puncak, sd.tersedia ?? 0) || 1;

  return (
    <div style={{ ...kartu, padding: "var(--pad-kartu-lega)", flex: "1 1 320px", minWidth: 300 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{sd.nama}</div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "capitalize" }}>{sd.jenis}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums",
            color: sd.mingguKelebihan.length ? "var(--danger)" : C.text,
          }}>
            {sd.puncak}
          </div>
          <div style={{ fontSize: 11, color: C.mid }}>
            puncak{sd.tersedia != null ? ` · tersedia ${sd.tersedia}` : ""}
          </div>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "flex-end", gap: 3, height: 72,
        marginTop: 12, position: "relative",
      }}>
        {/* Garis batas tersedia — supaya kelebihan terlihat, bukan disimpulkan. */}
        {sd.tersedia != null && sd.tersedia > 0 && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute", left: 0, right: 0,
              bottom: `${(sd.tersedia / maks) * 100}%`,
              borderTop: "1px dashed var(--danger)", opacity: 0.65,
            }}
          />
        )}
        {sd.periode.map((p) => (
          <div
            key={p.minggu}
            title={`${tanggalPendek(p.minggu)}: butuh ${p.dibutuhkan}${p.kelebihan > 0 ? ` (lebih ${p.kelebihan})` : ""}`}
            style={{
              flex: 1, minWidth: 6,
              height: `${Math.max(3, (p.dibutuhkan / maks) * 100)}%`,
              background: p.kelebihan > 0 ? "var(--danger)" : "var(--aksen)",
              opacity: p.kelebihan > 0 ? 1 : 0.75,
              borderRadius: "2px 2px 0 0",
            }}
          />
        ))}
      </div>

      <div style={{ fontSize: 11, color: C.mid, marginTop: 8, lineHeight: 1.45 }}>
        {sd.mingguKelebihan.length > 0 ? (
          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
            {sd.mingguKelebihan.length} minggu kelebihan beban — mulai {tanggalPendek(sd.mingguKelebihan[0])}
          </span>
        ) : sd.tersedia == null ? (
          <span style={{ color: C.muted }}>batas tersedia belum dicatat</span>
        ) : (
          <span>cukup sepanjang proyek</span>
        )}
      </div>
    </div>
  );
}

/**
 * `useSearchParams` memaksa render sisi klien, dan Next menuntut batas
 * Suspense untuk itu — kalau tidak, `pnpm build` gagal saat prerender.
 * Ditemukan oleh build, bukan oleh saya mengingat aturannya.
 */
export default function JadwalPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat jadwal…
      </div>
    }>
      <IsiJadwal />
    </Suspense>
  );
}

function IsiJadwal() {
  const router = useRouter();
  const params = useSearchParams();
  const [proyekList, setProyekList] = useState<Proyek[]>([]);

  // Proyek dibawa di URL, bukan hanya di state.
  //
  // Jadwal per-proyek yang tak bisa ditautkan berarti "lihat jalur kritis
  // proyek X" harus disampaikan sebagai instruksi klik, bukan tautan — dan
  // halaman ini juga jadi mustahil dipotret untuk proyek tertentu.
  const dariUrl = params.get("proyek") ?? "";

  // Tiga modul di halaman ini, masing-masing punya alamatnya sendiri supaya
  // menu "Jalur Kritis (CPM)", "Histogram Sumber Daya", dan "Method
  // Statement" tak sama-sama mendarat di puncak halaman.
  //
  // Dibaca langsung dari `params` yang sudah ada, bukan lewat `useTabUrl`:
  // halaman ini sudah punya router & searchParams sendiri untuk memilih
  // proyek, dan menambah hook kedua berarti dua sumber kebenaran untuk
  // satu URL yang sama.
  const BAGIAN = ["cpm", "histogram", "method"] as const;
  const bagianUrl = params.get("bagian");
  const bagian = (BAGIAN as readonly string[]).includes(bagianUrl ?? "")
    ? (bagianUrl as (typeof BAGIAN)[number])
    : "cpm";
  const setBagian = (bg: (typeof BAGIAN)[number]) => {
    const q = new URLSearchParams(Array.from(params.entries()));
    q.set("bagian", bg);
    router.replace(`/jadwal?${q.toString()}`, { scroll: false });
  };
  const [jadwal, setJadwal] = useState<Jadwal | null>(null);
  const [galat, setGalat] = useState("");
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  // Pemuatan dilacak lewat putaran yang datanya sudah tiba, bukan bendera
  // boolean yang dinyalakan di badan efek — bendera memicu render bertingkat.
  const [putaranTiba, setPutaranTiba] = useState(-1);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setProyekList(r.data.projects ?? []))
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat daftar proyek"); });
    return () => ac.abort();
  }, []);

  // Pilihan EFEKTIF: dari URL kalau ada dan sah, kalau tidak proyek pertama.
  //
  // Sempat saya coba memilih proyek "yang sedang berjalan" sebagai default,
  // supaya layar pertama tidak kosong. Diukur: 11 dari 15 proyek berstatus
  // `active`, jadi penyaringan itu tak membedakan apa pun — yang menentukan
  // informatif atau tidak adalah ADA-TIDAKNYA dependensi, dan itu baru
  // diketahui SESUDAH datanya diambil. Yang diperbaiki akhirnya kejujuran
  // layar saat dependensinya nol (lihat banner di bawah), bukan default-nya.
  const dipilih =
    (dariUrl && proyekList.some((p) => p.id === dariUrl) ? dariUrl : "") ||
    proyekList[0]?.id || "";

  useEffect(() => {
    const ac = makeAbortController();
    // Tanpa proyek terpilih tak ada yang perlu diambil — tapi pemuatannya
    // TETAP harus dinyatakan selesai, kalau tidak layar menggantung di
    // "Menghitung jalur kritis…" selamanya. Lewat `Promise.resolve()`, bukan
    // setState langsung di badan efek (yang memicu render bertingkat).
    if (!dipilih) {
      Promise.resolve().then(() => {
        if (!ac.signal.aborted) setPutaranTiba(muatUlangKe);
      });
      return () => ac.abort();
    }
    api.get<Jadwal>(`/api/v1/jadwal-cpm/${dipilih}`, { signal: ac.signal })
      .then((r) => { setJadwal(r.data); setGalat(""); })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat jadwal proyek"); })
      .finally(() => { if (!ac.signal.aborted) setPutaranTiba(muatUlangKe); });
    return () => ac.abort();
  }, [dipilih, muatUlangKe]);

  const memuat = putaranTiba !== muatUlangKe;
  const muatUlang = useCallback(() => setMuatUlangKe((n) => n + 1), []);

  const ringkas = useMemo(() => {
    if (!jadwal) return null;
    const p = jadwal.cpm.pekerjaan;
    const kritis = p.filter((x) => x.kritis).length;
    // Float negatif TERKECIL — seberapa telat proyek ini sebenarnya.
    const palingTelat = p.reduce<number | null>(
      (a, x) => (x.float != null && x.float < 0 && (a == null || x.float < a) ? x.float : a), null);
    const kelebihan = jadwal.histogram.filter((h) => h.mingguKelebihan.length > 0).length;
    // Tanpa satu pun dependensi, setiap pekerjaan mulai di hari yang sama dan
    // TAK ADA yang bisa disebut kritis. "0 pekerjaan kritis" di layar lalu
    // terbaca sebagai kabar baik — padahal artinya jalur kritisnya belum bisa
    // dihitung sama sekali.
    const tanpaDependensi = p.length > 1 && p.every(
      (x) => x.mulaiPalingAwal === p[0].mulaiPalingAwal);
    const msDitolak = jadwal.methodStatement.filter((m) => m.status === "ditolak").length;
    return { kritis, palingTelat, kelebihan, msDitolak, tanpaDependensi };
  }, [jadwal]);

  const kolom: Array<Kolom<Pekerjaan>> = useMemo(() => [
    {
      kunci: "nama", judul: "Pekerjaan", kepalaBaris: true,
      render: (p) => (
        <span style={{ fontWeight: p.kritis ? 700 : 600, color: C.text }}>
          {p.nama}
          {p.kritis && (
            <span style={{
              marginLeft: 8, padding: "1px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: "var(--danger-bg)", color: "var(--danger)", whiteSpace: "nowrap",
            }}>
              kritis
            </span>
          )}
        </span>
      ),
    },
    {
      kunci: "durasi", judul: "Durasi", rata: "kanan",
      render: (p) => (
        <span style={{ color: C.mid, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {p.durasi} hari kerja
        </span>
      ),
    },
    {
      kunci: "mulai", judul: "Mulai paling awal", rata: "kanan",
      render: (p) => <span style={{ color: C.mid }}>{tanggalTerbaca(p.mulaiPalingAwal)}</span>,
    },
    {
      kunci: "selesai", judul: "Selesai paling awal", rata: "kanan",
      render: (p) => <span style={{ color: C.mid }}>{tanggalTerbaca(p.selesaiPalingAwal)}</span>,
    },
    {
      kunci: "float", judul: "Kelonggaran", rata: "kanan",
      render: (p) => {
        if (p.float == null) {
          // Bukan 0. Nol terbaca "kritis", dan yang benar-benar kritis
          // tenggelam di antaranya.
          return <span style={{ color: C.muted, fontSize: 12 }}>tak bisa dihitung</span>;
        }
        const telat = p.float < 0;
        return (
          <span style={{
            fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            color: telat ? "var(--danger)" : p.float === 0 ? "var(--warning)" : C.text,
          }}>
            {telat
              ? `telat ${Math.abs(p.float)} hari`
              : p.float === 0 ? "nol" : `${p.float} hari`}
          </span>
        );
      },
    },
  ], []);

  const kolomMs: Array<Kolom<MethodStatement>> = useMemo(() => [
    {
      kunci: "nomor", judul: "Nomor", kepalaBaris: true,
      render: (m) => <span style={{ fontWeight: 600, color: C.text, fontVariantNumeric: "tabular-nums" }}>{m.nomor}</span>,
    },
    {
      kunci: "judul", judul: "Pekerjaan",
      render: (m) => <span style={{ color: C.text }}>{m.judul}</span>,
    },
    {
      kunci: "status", judul: "Status",
      render: (m) => (
        <span style={{
          padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          color: STATUS_MS[m.status].warna, background: STATUS_MS[m.status].bg,
        }}>
          {STATUS_MS[m.status].label}
        </span>
      ),
    },
    {
      kunci: "k3", judul: "Pengendalian risiko K3",
      render: (m) =>
        // Method statement tanpa pengendalian risiko adalah jadwal kerja yang
        // menyamar — dan justru bagian ini yang ditanya saat ada kecelakaan.
        m.pengendalian_risiko
          ? <span style={{ fontSize: 12, color: C.mid }}>{m.pengendalian_risiko.slice(0, 90)}{m.pengendalian_risiko.length > 90 ? "…" : ""}</span>
          : <span style={{ color: "var(--danger)", fontSize: 12, fontWeight: 600 }}>belum dijelaskan</span>,
    },
    {
      kunci: "alasan", judul: "Alasan penolakan",
      render: (m) => m.alasan_tolak
        ? <span style={{ fontSize: 12, color: C.mid }}>{m.alasan_tolak}</span>
        : <span style={{ color: C.muted }}>—</span>,
    },
  ], []);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            Jadwal & Jalur Kritis
          </h2>
          <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
            Pekerjaan mana yang <strong>kalau telat sehari membuat seluruh proyek
            telat</strong>, dan minggu mana yang tenaganya kurang. Durasi dihitung
            dalam hari kerja — hari Minggu dan libur nasional dikeluarkan, karena
            selisihnya yang jadi sengketa denda keterlambatan.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="pilih-proyek" style={{ fontSize: 12, color: C.mid, fontWeight: 600 }}>
            Proyek
          </label>
          <select
            id="pilih-proyek"
            value={dipilih}
            onChange={(e) => router.replace(`/jadwal?proyek=${e.target.value}`)}
            style={{
              padding: "8px 12px", borderRadius: 8, fontSize: 13,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, minWidth: 220, maxWidth: 320,
            }}
          >
            {proyekList.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
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
          Menghitung jalur kritis…
        </div>
      ) : !jadwal || jadwal.cpm.pekerjaan.length === 0 ? (
        <Kosong
          ikon={<CalendarDays size={28} />}
          judul="Belum ada pekerjaan terjadwal"
          sebab={
            <>
              Jalur kritis dihitung dari milestone proyek beserta dependensi
              antar-mereka. Tambahkan milestone lebih dulu, lalu catat pekerjaan
              mana menunggu pekerjaan mana — tanpa dependensi, daftar tanggal
              tak bisa memberi tahu mana yang benar-benar menentukan.
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
              label="Pekerjaan kritis"
              nilai={String(ringkas?.kritis ?? 0)}
              warna={(ringkas?.kritis ?? 0) > 0 ? "var(--danger)" : "var(--success)"}
              keterangan={`dari ${jadwal.cpm.pekerjaan.length} pekerjaan — telat sehari, proyek telat sehari`}
            />
            <Kpi
              label="Selesai menurut hitungan"
              nilai={tanggalTerbaca(jadwal.cpm.selesaiProyek)}
              warna={ringkas?.palingTelat != null ? "var(--danger)" : undefined}
              keterangan={
                ringkas?.palingTelat != null
                  ? `${Math.abs(ringkas.palingTelat)} hari kerja melewati target`
                  : `target ${tanggalTerbaca(jadwal.proyek.akhir)}`
              }
            />
            <Kpi
              label="Hari kerja tersedia"
              nilai={jadwal.kalender.hariKerjaProyek != null ? String(jadwal.kalender.hariKerjaProyek) : "—"}
              keterangan={`${jadwal.kalender.libur.length} hari libur dikeluarkan — bukan hari kalender`}
            />
            <Kpi
              label="Sumber daya kurang"
              nilai={String(ringkas?.kelebihan ?? 0)}
              warna={(ringkas?.kelebihan ?? 0) > 0 ? "var(--warning)" : undefined}
              keterangan="jenis yang puncaknya melewati yang tersedia"
            />
          </div>

          {/* Lapis 2 — pola & peringatan */}
          {ringkas?.tanpaDependensi && (
            <div className="rise rise-3" style={{
              ...kartu, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <GitBranch size={16} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--warning)" }}>
                  Belum ada ketergantungan antar-pekerjaan — jalur kritis belum bisa dihitung
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Semua pekerjaan terhitung mulai di hari yang sama, sehingga
                  &ldquo;0 pekerjaan kritis&rdquo; di atas <strong>bukan kabar baik</strong> —
                  melainkan tanda bahwa belum ada yang mencatat pekerjaan mana
                  menunggu pekerjaan mana. Tanpa itu, daftar tanggal tak bisa
                  memberi tahu mana yang benar-benar menentukan tanggal selesai.
                </div>
              </div>
            </div>
          )}

          {jadwal.cpm.lingkaran.length > 0 && (
            <div className="rise rise-3" style={{
              ...kartu, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--danger-border)", background: "var(--danger-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <GitBranch size={16} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--danger)" }}>
                  {jadwal.cpm.lingkaran.length} pekerjaan saling menunggu — jaringannya melingkar
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Tak satu pun dari pekerjaan ini bisa dimulai, karena masing-masing
                  menunggu yang lain. Jalur kritis sengaja dikosongkan: menyajikannya
                  dari jaringan berlingkaran berarti menjawab pertanyaan yang tak
                  punya jawaban. Putuskan salah satu dependensinya lebih dulu.
                </div>
              </div>
            </div>
          )}

          {ringkas?.palingTelat != null && (
            <div className="rise rise-3" style={{
              ...kartu, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--danger-border)", background: "var(--danger-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <TriangleAlert size={16} aria-hidden="true" style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--danger)" }}>
                  Jadwal ini melewati tenggat {Math.abs(ringkas.palingTelat)} hari kerja
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Dihitung dari durasi dan dependensi yang tercatat, bukan dari
                  progres lapangan. Yang bisa mengubahnya: memotong durasi pekerjaan
                  kritis, menambah sumber daya, atau menegosiasikan tenggatnya —
                  menggeser pekerjaan non-kritis tak menolong sama sekali.
                </div>
              </div>
            </div>
          )}

          {(ringkas?.msDitolak ?? 0) > 0 && (
            <div className="rise rise-3" style={{
              ...kartu, padding: "12px 16px", marginBottom: 12,
              borderColor: "var(--warning-border)", background: "var(--warning-bg)",
              display: "flex", gap: 10, alignItems: "flex-start",
            }}>
              <TriangleAlert size={16} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>
                <strong style={{ color: "var(--warning)" }}>
                  {ringkas!.msDitolak} method statement ditolak — pekerjaannya belum boleh dimulai
                </strong>
                <div style={{ marginTop: 2, color: C.mid }}>
                  Alasannya tercantum di tabel bawah. Pekerjaan berisiko yang dimulai
                  tanpa method statement disetujui adalah yang paling sulit dibela
                  saat terjadi kecelakaan.
                </div>
              </div>
            </div>
          )}

          {bagian === "histogram" && jadwal.histogram.length > 0 && (
            <div className="rise rise-3" style={{ marginBottom: "var(--gap-bagian)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <Users size={15} aria-hidden="true" style={{ color: C.mid }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Kebutuhan sumber daya per minggu
                </h3>
                <span style={{ fontSize: 12, color: C.mid }}>
                  — yang ditampilkan PUNCAK, bukan rata-rata
                </span>
              </div>
              <div style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap" }}>
                {jadwal.histogram.map((h) => <Histogram key={`${h.jenis}-${h.nama}`} sd={h} />)}
              </div>
            </div>
          )}

          {/* Lapis 3 — detail */}
          <TabBagian
            label="Modul jadwal"
            aktif={bagian}
            onPilih={setBagian}
            bagian={[
              { kunci: "cpm", label: "Jalur Kritis (CPM)" },
              { kunci: "histogram", label: "Histogram Sumber Daya" },
              { kunci: "method", label: "Method Statement" },
            ] as const}
          />
          {bagian === "cpm" && (<div className="rise rise-4" style={{ ...kartu, overflow: "hidden", marginBottom: "var(--gap-bagian)" }}>
            <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                Pekerjaan & kelonggaran
              </h3>
              <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                Kelonggaran nol atau negatif berarti kritis — menggesernya menggeser
                seluruh proyek.
              </p>
            </div>
            <Tabel
              caption="Daftar pekerjaan beserta durasi hari kerja, tanggal paling awal, dan kelonggaran jadwalnya"
              kolom={kolom}
              data={jadwal.cpm.pekerjaan}
              kunciBaris={(p) => p.id}
              tandaiBaris={(p) => (p.kritis ? "var(--danger-bg)" : undefined)}
            />
          </div>)}

          {bagian === "method" && jadwal.methodStatement.length > 0 && (
            <div className="rise rise-4" style={{ ...kartu, overflow: "hidden" }}>
              <div style={{ padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                  Method statement
                </h3>
                <p style={{ fontSize: 12, color: C.mid, margin: "4px 0 0", lineHeight: 1.5 }}>
                  Cara pekerjaan berisiko dikerjakan, beserta pengendalian risikonya.
                </p>
              </div>
              <Tabel
                caption="Daftar method statement beserta status persetujuan dan pengendalian risiko K3-nya"
                kolom={kolomMs}
                data={jadwal.methodStatement}
                kunciBaris={(m) => m.id}
                tandaiBaris={(m) => (m.status === "ditolak" ? "var(--danger-bg)" : undefined)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
