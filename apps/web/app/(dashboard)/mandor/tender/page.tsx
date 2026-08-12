"use client";

/**
 * TENDER SUBKONTRAKTOR — perbandingan penawaran mandor (F5 PEMBEDA 10/12)
 *
 * ── Yang dijawab halaman ini
 *
 * "Kenapa borongan Rp 277 juta ini jatuh ke Suswoyo, padahal Agung menawar
 * Rp 265 juta?"
 *
 * Diukur sebelum fitur ini ada: **20 lingkup kerja Rp 15jt–280jt, seluruhnya
 * tanpa satu pun jejak bagaimana mandornya dipilih.** Kesenjangan yang persis
 * sama dengan yang ditutup RFQ di sisi vendor, tapi di sisi subkontraktor —
 * dan nilainya jauh lebih besar per keputusan.
 *
 * ── Tiga hal yang layar ini tolak tampilkan sebagai kabar baik
 *
 * 1. **Yang tidak menawar bukan "Rp 0".** Nol adalah angka terkecil, dan mata
 *    membaca angka besar lebih dulu daripada kalimat kecil di bawahnya. Mandor
 *    yang menyatakan tak sanggup akan terbaca sebagai penawar termurah.
 *
 * 2. **Penawaran jauh di bawah perkiraan bukan "paling hemat".** Biasanya ada
 *    lingkup yang tak dihitung, dan itu kembali sebagai klaim tambah atau
 *    pekerjaan mangkrak di tengah. Ditandai, bukan dipuji.
 *
 * 3. **Pemenang bukan-termurah dinyatakan terang-terangan.** Bukan tuduhan —
 *    sering ada alasan sah: rekam jejak, kapasitas, waktu kerja. Tapi itulah
 *    keputusan yang wajib punya alasan tertulis, dan tanpa ditandai ia tak
 *    pernah ditanyakan.
 *
 * Ketiganya sudah dikunci di `apps/api/src/lib/tender-subkon.ts` dan diuji
 * 16 kali; halaman ini menampilkannya, bukan menghitung ulang.
 *
 * ── Kenapa satu halaman, bukan tab di /mandor
 *
 * ARAH-VISUAL §6a: tab = sudut pandang berbeda atas data yang SAMA; halaman =
 * entitas berbeda. Tiap tender punya penawaran, pemenang, dan alasannya
 * sendiri — mengirim tautan ke rekan harus membuka tender yang dimaksud,
 * bukan tab mana pun yang terakhir ia buka.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gavel, RefreshCw, Trophy, TriangleAlert, MinusCircle } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { DialogBersama } from "@/components/dialog-bersama";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type Proyek = { id: string; name: string };

type StatusTender = "draft" | "terkirim" | "selesai" | "batal";

type Tender = {
  id: string;
  nomor: string;
  judul: string;
  lingkup_kerja: string | null;
  nilai_perkiraan: number | string | null;
  tanggal: string | null;
  batas_masuk: string | null;
  status: StatusTender;
  alasan_pilih: string | null;
  proyek: Proyek | null;
  /** `[{ count }]` dari PostgREST — [] bila belum ada penawaran sama sekali. */
  penawaran_subkon?: Array<{ count: number }>;
};

/** Jumlah penawaran masuk pada sebuah tender. 0 bila belum ada. */
const jumlahPenawaran = (t: Tender) => t.penawaran_subkon?.[0]?.count ?? 0;

type Penilaian =
  | "termurah" | "wajar" | "terlalu_rendah" | "terlalu_tinggi" | "tidak_menawar";

type Penawaran = {
  id: string;
  worker_id: string;
  worker_name: string;
  /** null bila tak menawar — BUKAN 0. Lihat catatan kepala berkas. */
  nilai: number | null;
  waktu_kerja_hari: number | null;
  status: "diajukan" | "menang" | "kalah" | "gugur";
  selisih_termurah_pct: number | null;
  selisih_perkiraan_pct: number | null;
  penilaian: Penilaian;
  menang: boolean;
  catatan: string | null;
};

type Perbandingan = {
  penawaran: Penawaran[];
  nilai_termurah: number | null;
  nilai_tertinggi: number | null;
  rentang_pct: number | null;
  jumlah_menawar: number;
  jumlah_tidak_menawar: number;
  jumlah_terlalu_rendah: number;
  pemenang: Penawaran | null;
  pemenang_bukan_termurah: boolean;
  selisih_pemenang_termurah: number;
};

const rupiah = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === ""
    ? "—"
    : new Intl.NumberFormat("id-ID", {
        style: "currency", currency: "IDR", maximumFractionDigits: 0,
      }).format(Number(n));

const tanggalTerbaca = (s: string | null) =>
  !s ? "—" : new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Persen dengan tanda eksplisit — "+8%" dan "−16%" tak pernah tertukar. */
const persenBertanda = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;

const STATUS_META: Record<StatusTender, { label: string; warna: string; bg: string; border: string }> = {
  draft:    { label: "Draft",    warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
  terkirim: { label: "Terbuka",  warna: "var(--info)",    bg: "var(--info-bg)",    border: "var(--info-border)" },
  selesai:  { label: "Selesai",  warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)" },
  batal:    { label: "Batal",    warna: "var(--danger)",  bg: "var(--danger-bg)",  border: "var(--danger-border)" },
};

/**
 * Tiap penilaian punya KATA-nya sendiri, bukan hanya warna.
 *
 * WCAG 1.4.1: yang tak bisa membedakan warna, dan pembaca layar, sama-sama
 * hanya punya teks ini. "Terlalu rendah" yang cuma ditandai merah tak terbaca
 * sebagai peringatan oleh keduanya — ia justru terbaca sebagai angka terkecil.
 */
const NILAI_META: Record<Penilaian, { label: string; warna: string; bg: string }> = {
  termurah:       { label: "Termurah",       warna: "var(--success)", bg: "var(--success-bg)" },
  wajar:          { label: "Wajar",          warna: "var(--text-secondary)", bg: "var(--surface-subtle)" },
  terlalu_rendah: { label: "Terlalu rendah", warna: "var(--warning)", bg: "var(--warning-bg)" },
  terlalu_tinggi: { label: "Terlalu tinggi", warna: "var(--danger)",  bg: "var(--danger-bg)" },
  tidak_menawar:  { label: "Tidak menawar",  warna: "var(--text-muted)", bg: "var(--surface-subtle)" },
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

export default function TenderSubkonPage() {
  const [daftar, setDaftar] = useState<Tender[]>([]);
  const [terpilih, setTerpilih] = useState("");
  const [banding, setBanding] = useState<Perbandingan | null>(null);
  const [tenderAktif, setTenderAktif] = useState<Tender | null>(null);
  const [galat, setGalat] = useState("");
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  // Pemuatan dilacak lewat APA yang sudah tiba, bukan bendera boolean yang
  // dinyalakan di badan efek. Bendera memaksa `setState` sinkron — render
  // bertingkat, dan lint menandainya — sementara membandingkan "putaran
  // muat ulang yang datanya sudah sampai" dengan putaran sekarang menjawab
  // pertanyaan yang sama tanpa satu pun setState tambahan.
  const [daftarPutaran, setDaftarPutaran] = useState(-1);
  const [detailUntuk, setDetailUntuk] = useState<string | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ tender: Tender[] }>("/api/v1/tender-subkon", { signal: ac.signal })
      .then((r) => {
        setDaftar(r.data.tender ?? []);
        setGalat("");
      })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat daftar tender"); })
      .finally(() => { if (!ac.signal.aborted) setDaftarPutaran(muatUlangKe); });
    return () => ac.abort();
  }, [muatUlangKe]);
  const memuatDaftar = daftarPutaran !== muatUlangKe;

  // Pilihan awal jatuh ke tender yang PUNYA penawaran, bukan yang paling
  // baru. Daftar diurutkan `tanggal DESC` di API, jadi tanpa aturan ini
  // yang terbuka lebih dulu adalah tender termuda — yang justru paling
  // mungkin masih kosong. Layar perbandingan yang membuka dengan "belum ada
  // penawaran" terbaca seperti fiturnya belum jalan.
  const awal = useMemo(
    () => daftar.find((t) => jumlahPenawaran(t) > 0) ?? daftar[0],
    [daftar],
  );
  const idEfektif = terpilih || awal?.id || "";

  // Kunci detail = "id tender + putaran muat ulang". Kalau hanya id-nya,
  // menekan Muat ulang pada tender yang sama tak akan pernah menampilkan
  // keadaan memuat, dan tabel lama diam-diam bertahan di layar.
  const kunciDetail = `${idEfektif}#${muatUlangKe}`;

  useEffect(() => {
    // Tanpa tender terpilih tak ada yang perlu dibersihkan di sini: daftar
    // kosong sudah ditangani lebih atas (`daftar.length === 0`), dan
    // `bandingTampil`/`tenderTampil` di bawah menolak menampilkan data yang
    // kuncinya tak cocok. Mereset lewat setState sinkron justru memicu
    // render bertingkat untuk keadaan yang tak pernah terlihat.
    if (!idEfektif) return;
    const ac = makeAbortController();
    api.get<{ tender: Tender; perbandingan: Perbandingan }>(
      `/api/v1/tender-subkon/${idEfektif}`, { signal: ac.signal })
      .then((r) => {
        setTenderAktif(r.data.tender);
        setBanding(r.data.perbandingan);
        setGalat("");
      })
      .catch((e) => { if (!ac.signal.aborted) setGalat(e?.response?.data?.error ?? "Gagal memuat perbandingan"); })
      .finally(() => { if (!ac.signal.aborted) setDetailUntuk(kunciDetail); });
    return () => ac.abort();
  }, [idEfektif, muatUlangKe, kunciDetail]);
  // Tabel tender A tak pernah tampil di bawah kepala tender B: selama kunci
  // belum cocok, yang ditampilkan adalah keadaan memuat.
  const memuatDetail = !!idEfektif && detailUntuk !== kunciDetail;
  // Data hanya ditampilkan kalau ia memang milik kunci yang sedang diminta.
  // Ini yang menggantikan pembersihan state di atas — dan lebih kuat: state
  // basi tak cuma dikosongkan belakangan, ia tak pernah sempat tampil.
  const siap = !!idEfektif && detailUntuk === kunciDetail;
  const tenderTampil = siap ? tenderAktif : null;
  const bandingTampil = siap ? banding : null;

  const muatUlang = useCallback(() => setMuatUlangKe((n) => n + 1), []);


  // ── Penetapan pemenang ─────────────────────────────────────────────────
  //
  // Sampai 2026-08-13 halaman ini bisa membandingkan penawaran dengan sangat
  // rinci — vs termurah, vs perkiraan, penanda "terlalu rendah" — lalu
  // berhenti. Tak ada cara menunjuk pemenangnya, karena endpointnya memang
  // tak ada. Kolomnya sudah dipajang, keadaannya tak pernah bisa terjadi.
  const [calon, setCalon] = useState<Penawaran | null>(null);
  const [alasan, setAlasan] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [sukses, setSukses] = useState("");

  function bukaPenetapan(p: Penawaran) {
    setCalon(p);
    setAlasan("");
    setGalat("");
    setSukses("");
  }

  /**
   * Ambang panjang alasan mengikuti API (`lib/tender-subkon.ts`).
   *
   * Disalin, bukan diimpor: `apps/web` tak bergantung pada `apps/api`, dan
   * `packages/shared` kosong. Kalau angkanya berpisah, yang terjadi adalah
   * tombol aktif lalu server menolak — jadi ambang di sini dibuat SAMA, dan
   * server tetap jadi penentunya.
   */
  // Dibandingkan lewat NILAI, bukan lewat label `penilaian === "termurah"`.
  //
  // Cacat yang tertangkap dari layar (2026-08-13): pada TND-2026-002 penawar
  // terendah justru berpenilaian "terlalu rendah" — 28,5% di bawah perkiraan,
  // catatannya menyebut talang dan flashing tak dihitung. Karena tak ada satu
  // pun baris berlabel "termurah", `bukanTermurah` jadi false, dialog menuntut
  // 10 karakter alih-alih 25, dan tombolnya aktif untuk alasan yang PASTI
  // ditolak server.
  //
  // Label itu memang menjawab pertanyaan lain ("apakah harganya wajar"), bukan
  // "siapa yang paling murah". Yang tidak menawar dikeluarkan: nilainya
  // tersimpan 0 dan akan selalu menang sebagai terendah.
  const bukanTermurah = (() => {
    if (!calon || !banding || calon.nilai === null) return false;
    const terendah = banding.penawaran
      .filter((x) => x.nilai !== null && x.status !== "gugur")
      .reduce<number | null>((m, x) => (m === null || x.nilai! < m ? x.nilai! : m), null);
    return terendah !== null && calon.nilai > terendah;
  })();
  const minAlasan = bukanTermurah ? 25 : 10;

  const halangan = !calon
    ? null
    : alasan.trim().length < minAlasan
      ? bukanTermurah
        ? `Pemenang bukan penawar termurah — jelaskan alasannya (minimal ${minAlasan} karakter). `
          + "Inilah yang ditanyakan auditor lebih dulu."
        : `Alasan pemilihan wajib diisi (minimal ${minAlasan} karakter).`
      : null;

  async function tetapkan() {
    if (!calon || !idEfektif || halangan) return;
    setMengirim(true); setGalat(""); setSukses("");
    try {
      const r = await api.patch<{ peringatan: string | null; penawar_dikalahkan: number }>(
        `/api/v1/tender-subkon/${idEfektif}/pemenang`,
        { penawaran_id: calon.id, alasan: alasan.trim() },
      );
      const n = r.data.penawar_dikalahkan;
      setSukses(
        `${calon.worker_name} ditetapkan sebagai pemenang`
        + (n > 0 ? ` — ${n} penawar lain ditandai kalah.` : ".")
        + (r.data.peringatan ? ` ${r.data.peringatan}` : ""),
      );
      setCalon(null);
      setDetailUntuk(null);
      setMuatUlangKe((k) => k + 1);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menetapkan pemenang");
    } finally {
      setMengirim(false);
    }
  }

  async function tutupTender() {
    if (!idEfektif) return;
    setMengirim(true); setGalat(""); setSukses("");
    try {
      await api.patch(`/api/v1/tender-subkon/${idEfektif}/tutup`, {});
      setSukses("Tender ditutup. Pemenang dan alasannya terkunci sebagai keputusan final.");
      setDetailUntuk(null);
      setMuatUlangKe((k) => k + 1);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menutup tender");
    } finally {
      setMengirim(false);
    }
  }

  const kolom: Array<Kolom<Penawaran>> = useMemo(() => [
    {
      kunci: "mandor", judul: "Mandor", kepalaBaris: true,
      render: (p) => (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: p.menang ? 700 : 500, color: C.text }}>{p.worker_name}</span>
          {p.menang && <Trophy size={13} aria-hidden="true" style={{ color: "var(--success)" }} />}
        </span>
      ),
    },
    {
      kunci: "nilai", judul: "Nilai penawaran", rata: "kanan",
      render: (p) =>
        // Yang tidak menawar TIDAK dipajang "Rp 0". Nol adalah angka terkecil;
        // dipasang di kolom yang sedang dibandingkan besarannya, ia menang
        // sebagai termurah di mata pembaca sebelum satu kata pun dibaca.
        p.nilai === null
          ? <span style={{ color: C.muted }}>tidak menawar</span>
          : <span style={{ fontWeight: p.menang ? 700 : 400 }}>{rupiah(p.nilai)}</span>,
    },
    {
      kunci: "vs_termurah", judul: "vs termurah", rata: "kanan",
      render: (p) => p.selisih_termurah_pct === null
        ? <span style={{ color: C.muted }}>—</span>
        : <span style={{ color: p.selisih_termurah_pct === 0 ? "var(--success)" : C.mid }}>
            {p.selisih_termurah_pct === 0 ? "termurah" : persenBertanda(p.selisih_termurah_pct)}
          </span>,
    },
    {
      kunci: "vs_perkiraan", judul: "vs perkiraan", rata: "kanan",
      render: (p) => <span style={{ color: C.mid }}>{persenBertanda(p.selisih_perkiraan_pct)}</span>,
    },
    {
      kunci: "waktu", judul: "Waktu kerja", rata: "kanan",
      render: (p) => p.waktu_kerja_hari === null
        ? <span style={{ color: C.muted }}>—</span>
        : <>{p.waktu_kerja_hari} hari</>,
    },
    {
      kunci: "penilaian", judul: "Penilaian",
      render: (p) => (
        <span style={{
          padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
          whiteSpace: "nowrap",
          color: NILAI_META[p.penilaian].warna,
          background: NILAI_META[p.penilaian].bg,
        }}>
          {NILAI_META[p.penilaian].label}
        </span>
      ),
    },
    {
      kunci: "catatan", judul: "Catatan",
      render: (p) => p.catatan
        ? <span style={{ color: C.mid, fontSize: 12 }}>{p.catatan}</span>
        : <span style={{ color: C.muted }}>—</span>,
    },
    {
      kunci: "tindakan", judul: "Tindakan", rata: "kanan",
      render: (p) => {
        // Tender yang sudah ditutup tak menerima perubahan. Menampilkan
        // tombolnya lalu menolak di server membuat orang mengira aplikasinya
        // rusak — yang tak berlaku sebaiknya tak terlihat sebagai pilihan.
        if (!tenderAktif || tenderAktif.status !== "terkirim") {
          return <span style={{ color: C.muted, fontSize: 11.5 }}>—</span>;
        }
        if (p.menang) {
          return <span style={{ color: "var(--success)", fontSize: 11.5, fontWeight: 600 }}>Pemenang</span>;
        }
        if (p.nilai === null) {
          // Alasannya DINYATAKAN, bukan sekadar tombol yang hilang.
          return <span style={{ color: C.muted, fontSize: 11.5 }}>tak menawar</span>;
        }
        if (p.status === "gugur") {
          return <span style={{ color: C.muted, fontSize: 11.5 }}>gugur</span>;
        }
        return (
          <button type="button" onClick={() => bukaPenetapan(p)} style={{
            cursor: "pointer", padding: "4px 10px", borderRadius: 5, fontSize: 12,
            border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
            whiteSpace: "nowrap",
          }}>
            Tetapkan
          </button>
        );
      },
    },
  ], [tenderAktif]);

  return (
    <div style={{ width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      <div className="rise" style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
          Tender Subkontraktor
        </h2>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Bagaimana sebuah borongan sampai ke mandor tertentu — siapa yang diundang,
          siapa yang menawar berapa, dan <strong>apa alasannya</strong> kalau yang
          menang bukan yang termurah. Tanpa ini, jawabannya hanya ada di ingatan orang.
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

      {sukses && (
        <div role="status" style={{
          ...kartu, padding: "10px 14px", marginBottom: 16,
          borderColor: "var(--success-border)", background: "var(--success-bg)",
          color: "var(--success)", fontSize: 13, lineHeight: 1.55,
        }}>
          {sukses}
        </div>
      )}

      {memuatDaftar ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat tender…
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<Gavel size={28} />}
          judul="Belum ada tender subkontraktor"
          sebab={
            <>
              Tender mencatat siapa saja yang diundang menawar sebuah lingkup kerja,
              berapa penawarannya, dan kenapa satu di antaranya dipilih. Itulah yang
              ditanyakan saat borongan dipersoalkan — dan yang selama ini tak tercatat.
            </>
          }
        />
      ) : (
        <>
          {/* Pemilih tender + muat ulang */}
          <div className="rise rise-2" style={{
            ...kartu, padding: "12px 16px", marginBottom: 16,
            display: "flex", gap: "var(--gap-bagian)", alignItems: "flex-end", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 280, flex: "1 1 320px" }}>
              <label htmlFor="tnd-pilih" style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>
                Tender
              </label>
              <select
                id="tnd-pilih" value={idEfektif}
                onChange={(e) => setTerpilih(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", border: `1px solid ${C.border}`,
                  borderRadius: 6, fontSize: 13, background: "var(--surface)", color: C.text,
                }}
              >
                {daftar.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nomor} — {t.judul} · {t.proyek?.name ?? "—"}
                    {" · "}
                    {jumlahPenawaran(t) === 0
                      ? "belum ada penawaran"
                      : `${jumlahPenawaran(t)} penawaran`}
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

          {memuatDetail ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
              Memuat perbandingan…
            </div>
          ) : !tenderTampil || !bandingTampil ? null : (
            <>
              {/* ── Kepala tender ──────────────────────────────────────── */}
              <div className="rise rise-2b" style={{
                ...kartu, padding: "14px 16px", marginBottom: 16,
              }}>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
                    {tenderTampil.nomor} — {tenderTampil.judul}
                  </span>
                  {/* Status sebagai KATA, bukan hanya warna (WCAG 1.4.1). */}
                  <span style={{
                    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                    color: STATUS_META[tenderTampil.status].warna,
                    background: STATUS_META[tenderTampil.status].bg,
                    border: `1px solid ${STATUS_META[tenderTampil.status].border}`,
                  }}>
                    {STATUS_META[tenderTampil.status].label}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.mid, marginTop: 4 }}>
                  {tenderTampil.proyek?.name ?? "—"} · dibuka {tanggalTerbaca(tenderTampil.tanggal)}
                  {tenderTampil.batas_masuk && ` · batas masuk ${tanggalTerbaca(tenderTampil.batas_masuk)}`}
                </div>
                {tenderTampil.lingkup_kerja && (
                  <p style={{ fontSize: 13, color: C.text, margin: "10px 0 0", maxWidth: "78ch", lineHeight: 1.55 }}>
                    {tenderTampil.lingkup_kerja}
                  </p>
                )}
              </div>

              {/* ── Lapis 1: keadaan ───────────────────────────────────── */}
              <div className="rise rise-3" style={{ display: "flex", gap: "var(--gap-grid)", flexWrap: "wrap", marginBottom: 16 }}>
                <Kpi
                  label="Perkiraan nilai"
                  nilai={rupiah(tenderTampil.nilai_perkiraan)}
                  keterangan="dasar pembanding seluruh penawaran"
                />
                {/* "Mengajukan harga", bukan "penawaran masuk".
                    Yang menyatakan TIDAK menawar juga sudah menjawab undangan —
                    menyebut angka ini "masuk" membuat 3 baris di tabel terbaca
                    sebagai 2, dan pembacanya mengira ada yang belum termuat. */}
                <Kpi
                  label="Mengajukan harga"
                  nilai={`${bandingTampil.jumlah_menawar} dari ${
                    bandingTampil.jumlah_menawar + bandingTampil.jumlah_tidak_menawar
                  }`}
                  keterangan={
                    bandingTampil.jumlah_tidak_menawar > 0
                      ? `${bandingTampil.jumlah_tidak_menawar} menyatakan tidak menawar`
                      : "semua yang diundang mengajukan harga"
                  }
                />
                {/* Kalau penawaran termurah justru yang ditandai TERLALU RENDAH,
                    kartu ini tak boleh memajangnya sebagai angka netral.
                    Diukur pada data uji: Rp 118jt adalah termurah DAN −28,5%
                    dari perkiraan — memajangnya polos di antara tiga KPI lain
                    membuat yang paling berisiko terbaca paling menarik, persis
                    salah-baca yang banner di bawahnya berusaha cegah. */}
                <Kpi
                  label="Termurah"
                  nilai={rupiah(bandingTampil.nilai_termurah)}
                  warna={
                    bandingTampil.penawaran.find((p) => p.penilaian === "termurah") ||
                    bandingTampil.nilai_termurah === null
                      ? undefined
                      : "var(--warning)"
                  }
                  keterangan={
                    bandingTampil.rentang_pct === null
                      ? "belum bisa dibandingkan"
                      : !bandingTampil.penawaran.some((p) => p.penilaian === "termurah")
                        ? `jauh di bawah perkiraan — periksa lingkupnya · rentang ${bandingTampil.rentang_pct.toFixed(1)}%`
                        : `rentang antar penawar ${bandingTampil.rentang_pct.toFixed(1)}%`
                  }
                />
                <Kpi
                  label="Pemenang"
                  nilai={bandingTampil.pemenang?.worker_name ?? "Belum ditunjuk"}
                  warna={bandingTampil.pemenang ? "var(--success)" : C.mid}
                  keterangan={
                    bandingTampil.pemenang
                      ? rupiah(bandingTampil.pemenang.nilai)
                      : "penawaran masih dibandingkan"
                  }
                />
              </div>

              {/* ── Peringatan: pemenang bukan termurah ────────────────── */}
              {bandingTampil.pemenang_bukan_termurah && (
                <div className="rise rise-3" style={{
                  ...kartu, padding: "12px 16px", marginBottom: 16,
                  borderColor: "var(--warning-border)", background: "var(--warning-bg)",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <TriangleAlert size={16} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 13, color: "var(--on-warning-bg)", lineHeight: 1.55 }}>
                    <strong>Pemenang bukan penawar termurah</strong> — selisih{" "}
                    {rupiah(bandingTampil.selisih_pemenang_termurah)} di atas penawaran terendah.
                    {tenderTampil.alasan_pilih ? (
                      <>
                        {" "}Alasan tercatat:{" "}
                        <span style={{ fontStyle: "italic" }}>“{tenderTampil.alasan_pilih}”</span>
                      </>
                    ) : (
                      <>
                        {" "}<strong>Belum ada alasan tertulis.</strong> Sering ada alasan sah —
                        rekam jejak, kapasitas, waktu kerja — tapi kalau tak dicatat sekarang,
                        pertanyaannya baru datang saat sudah tak ada yang ingat.
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Peringatan: penawaran terlalu rendah ───────────────── */}
              {bandingTampil.jumlah_terlalu_rendah > 0 && (
                <div className="rise rise-3" style={{
                  ...kartu, padding: "12px 16px", marginBottom: 16,
                  borderColor: "var(--warning-border)", background: "var(--warning-bg)",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}>
                  <MinusCircle size={16} aria-hidden="true" style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 13, color: "var(--on-warning-bg)", lineHeight: 1.55 }}>
                    <strong>
                      {bandingTampil.jumlah_terlalu_rendah} penawaran jauh di bawah perkiraan
                    </strong>{" "}
                    — periksa lingkupnya sebelum ditunjuk. Harga yang terlalu rendah
                    biasanya berarti ada pekerjaan yang tak dihitung, dan itu kembali
                    sebagai klaim tambah atau pekerjaan berhenti di tengah.
                  </div>
                </div>
              )}

              {/* ── Menutup tender ─────────────────────────────────────
                  Penetapan pemenang dan PENUTUPAN sengaja dua langkah. Kalau
                  digabung, keputusan yang tak bisa dibatalkan diambil pada
                  klik yang sama dengan yang memilih — tanpa jeda meninjau. */}
              {tenderTampil.status === "terkirim" && bandingTampil.pemenang && (
                <div className="rise rise-3" style={{
                  ...kartu, padding: "12px 16px", marginBottom: "var(--gap-bagian)",
                  display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
                }}>
                  <div style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.5, flex: 1, minWidth: 260 }}>
                    Pemenang sudah ditetapkan. <strong>Menutup tender</strong> mengunci
                    keputusan ini — nilai dan waktu penawaran tak bisa diubah lagi
                    sesudahnya, dan pemenangnya tak bisa diganti.
                  </div>
                  <button type="button" onClick={tutupTender} disabled={mengirim} style={{
                    cursor: mengirim ? "not-allowed" : "pointer", opacity: mengirim ? 0.5 : 1,
                    padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                    border: "1px solid var(--aksen)", background: "var(--aksen)", color: "#fff",
                    whiteSpace: "nowrap",
                  }}>{mengirim ? "Menutup…" : "Tutup tender"}</button>
                </div>
              )}

              {/* ── Lapis 3: detail ────────────────────────────────────── */}
              <div className="rise rise-4" style={{ ...kartu, padding: "4px 4px 0", overflow: "hidden" }}>
                <Tabel<Penawaran>
                  caption={`Perbandingan penawaran tender ${tenderTampil.nomor} — ${tenderTampil.judul}`}
                  kolom={kolom}
                  data={bandingTampil.penawaran}
                  kunciBaris={(p) => p.id}
                  tandaiBaris={(p) => (p.menang ? "var(--success-bg)" : undefined)}
                  kosong={
                    <Kosong
                      ikon={<Gavel size={26} />}
                      judul="Belum ada penawaran masuk"
                      sebab="Perbandingan muncul begitu ada mandor yang mengajukan harga untuk tender ini."
                    />
                  }
                />
              </div>
            </>
          )}
        </>
      )}

      {/* ── Dialog penetapan pemenang ──────────────────────────────────── */}
      <DialogBersama
        terbuka={!!calon}
        onTutup={() => setCalon(null)}
        judul={calon ? `Tetapkan ${calon.worker_name} sebagai pemenang` : ""}
        lebar={560}
      >
        {calon && (
          <>
            <div style={{
              display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap",
              marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${C.border}`,
            }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Nilai penawaran
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginTop: 3 }}>
                  {rupiah(calon.nilai)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  vs termurah
                </div>
                <div style={{
                  fontSize: 17, fontWeight: 700, marginTop: 3,
                  color: bukanTermurah ? "var(--warning)" : "var(--success)",
                }}>
                  {calon.selisih_termurah_pct === 0
                    ? "termurah"
                    : persenBertanda(calon.selisih_termurah_pct)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Waktu kerja
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginTop: 3 }}>
                  {calon.waktu_kerja_hari === null ? "—" : `${calon.waktu_kerja_hari} hari`}
                </div>
              </div>
            </div>

            {bukanTermurah && (
              <p style={{
                fontSize: 12.5, lineHeight: 1.55, margin: "0 0 12px",
                padding: "10px 12px", borderRadius: 6,
                background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                color: "var(--on-warning-bg)",
              }}>
                Ini bukan penawar termurah. Sering ada alasan yang sah — rekam jejak,
                kapasitas, waktu kerja — tapi alasan itu harus tertulis sekarang,
                karena pertanyaannya baru datang saat sudah tak ada yang ingat.
              </p>
            )}

            <label htmlFor="td-alasan" style={{
              display: "block", fontSize: 11, fontWeight: 700, color: C.muted,
              textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
            }}>
              Alasan pemilihan
            </label>
            <textarea
              id="td-alasan"
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={4}
              aria-describedby="td-alasan-bantu"
              placeholder={bukanTermurah
                ? "mis. Satu-satunya yang pernah mengerjakan bore pile di tanah lunak Dago, dan sanggup 90 hari."
                : "mis. Termurah dan memenuhi seluruh syarat teknis."}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6,
                border: `1px solid ${C.border}`, background: "var(--surface)",
                color: C.text, fontSize: 13, fontFamily: "inherit", resize: "vertical",
              }}
            />
            <p id="td-alasan-bantu" style={{ fontSize: 11, color: C.muted, margin: "5px 0 0", lineHeight: 1.45 }}>
              Tercatat di tender dan ikut terbaca saat diaudit.
              {" "}{alasan.trim().length}/{minAlasan} karakter minimum.
            </p>

            <div style={{
              marginTop: "var(--gap-bagian)", paddingTop: 14,
              borderTop: `1px solid ${C.border}`,
              display: "flex", gap: 9, justifyContent: "flex-end",
              alignItems: "center", flexWrap: "wrap",
            }}>
              {halangan && (
                <span style={{ fontSize: 12, color: C.mid, marginRight: "auto", maxWidth: "40ch", lineHeight: 1.45 }}>
                  {halangan}
                </span>
              )}
              <button type="button" onClick={() => setCalon(null)} style={{
                cursor: "pointer", padding: "8px 14px", borderRadius: 6, fontSize: 13,
                border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text,
              }}>Batal</button>
              <button type="button" onClick={tetapkan} disabled={!!halangan || mengirim} style={{
                cursor: halangan || mengirim ? "not-allowed" : "pointer",
                opacity: halangan || mengirim ? 0.5 : 1,
                padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: "1px solid var(--aksen)", background: "var(--aksen)", color: "#fff",
              }}>{mengirim ? "Menyimpan…" : "Tetapkan pemenang"}</button>
            </div>
          </>
        )}
      </DialogBersama>
    </div>
  );
}
