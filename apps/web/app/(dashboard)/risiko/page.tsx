"use client";

/**
 * REGISTER RISIKO & RENCANA MITIGASI.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA REGISTER + MITIGASI SATU HALAMAN, BUKAN DUA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Peta menu memisahkan "Register Risiko" dan "Rencana Mitigasi" jadi dua item.
 * Sebagai TABEL keduanya memang terpisah — satu risiko punya banyak tindakan.
 * Sebagai HALAMAN keduanya tidak boleh terpisah.
 *
 * Mitigasi yang dibaca tanpa risikonya adalah daftar tugas tanpa alasan, dan
 * daftar tugas tanpa alasan adalah hal pertama yang diabaikan orang. Yang
 * membaca "Pesan material 4 minggu lebih awal" perlu tahu bahwa itu menjawab
 * risiko keterlambatan berskor 12 — tanpa itu, ia tampak seperti preferensi
 * seseorang.
 *
 * `ARAH-VISUAL-2026` §6a: tab = sudut pandang berbeda atas data yang SAMA.
 * Register dan mitigasi adalah data yang sama dilihat dari dua sisi: per
 * risiko, dan per tindakan yang harus diurus minggu ini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU AKSEN (§3d): yang MENDESAK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Register risiko yang mewarnai semua barisnya berhenti dibaca dalam dua
 * minggu. Yang diwarnai di sini hanya baris `mendesak` — dan "mendesak" bukan
 * sinonim "skor tinggi": risiko ekstrem yang sudah punya tindakan berjalan dan
 * sudah dinilai ulang TIDAK mendesak, sementara risiko sedang yang tindakannya
 * lewat tenggat IYA.
 *
 * Alasan mendesaknya ditulis di barisnya sendiri, bukan disembunyikan di balik
 * klik: daftar yang menandai baris merah tanpa mengatakan kenapa memaksa orang
 * membuka satu per satu untuk menebak.
 *
 * ── Kenapa skor awal dan skor sisa ditampilkan BERDAMPINGAN
 *
 * Menampilkan hanya skor sisa menghapus bukti bahwa mitigasinya berguna.
 * Menampilkan hanya skor awal membuat mitigasi yang berhasil tak terlihat.
 * Keduanya bersama menjawab pertanyaan yang benar-benar ditanyakan saat
 * risikonya terjadi: *apa yang sudah dilakukan, dan seberapa menolong?*
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldAlert, TriangleAlert, Plus, ListChecks, CircleCheck,
  CircleDot, ArrowDown,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, KartuAngka, BarisAngka,
  Tabel, Kosong, Rangka, Galat, Tombol, Lencana, Medan, gayaInput,
  type Kolom,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { TabBagian } from "@/components/tab-bagian";

type Tingkat = "rendah" | "sedang" | "tinggi" | "ekstrem";
type StatusRisiko = "terpantau" | "terjadi" | "tertutup";
type StatusTindakan = "rencana" | "berjalan" | "selesai" | "batal";

interface Tindakan {
  id: string;
  risiko_id: string;
  tindakan: string;
  status: StatusTindakan;
  tenggat: string | null;
  selesai_pada: string | null;
  biaya_estimasi: string | number | null;
  penanggung: { id: string; name: string } | null;
}

interface RisikoBaris {
  id: string;
  kode: string | null;
  judul: string;
  uraian: string | null;
  kategori: string;
  dampak: number;
  kemungkinan: number;
  skor: number;
  strategi: string;
  status: StatusRisiko;
  tenggat_tinjau: string | null;
  alasan_tutup: string | null;
  pemilik: { id: string; name: string } | null;
  tingkat: Tingkat;
  skor_sisa: number | null;
  tingkat_sisa: Tingkat | null;
  penurunan: number | null;
  mendesak: boolean;
  alasan_mendesak: string[];
  tindakan: Tindakan[];
}

interface Muatan {
  proyek: { id: string; name: string };
  pada: string;
  risiko: RisikoBaris[];
  ringkas: {
    total: number;
    terpantau: number;
    terjadi: number;
    tertutup: number;
    per_tingkat: Record<Tingkat, number>;
    mendesak: number;
    penurunan_rata: number | null;
    dinilai_ulang: number;
  };
}

interface Proyek { id: string; name: string }
interface Orang { id: string; name: string }

/**
 * Empat tingkat, empat tindakan berbeda — dan itulah alasan warnanya berbeda.
 * "Ekstrem" memakai `danger` bukan karena angkanya besar, melainkan karena ia
 * menuntut keputusan direktur.
 */
const TINGKAT: Record<Tingkat, { label: string; nada: "netral" | "info" | "peringatan" | "bahaya"; arti: string }> = {
  rendah: { label: "Rendah", nada: "netral", arti: "Diterima apa adanya." },
  sedang: { label: "Sedang", nada: "info", arti: "Dimitigasi bila biayanya wajar." },
  tinggi: { label: "Tinggi", nada: "peringatan", arti: "Wajib punya tindakan bertenggat." },
  ekstrem: { label: "Ekstrem", nada: "bahaya", arti: "Wajib naik ke direktur — bukan diputus di lapangan." },
};

const KATEGORI: Record<string, string> = {
  teknis: "Teknis", keuangan: "Keuangan", jadwal: "Jadwal", k3: "K3",
  lingkungan: "Lingkungan", hukum: "Hukum", pengadaan: "Pengadaan",
  eksternal: "Eksternal",
};

const STRATEGI: Record<string, string> = {
  hindari: "Hindari", kurangi: "Kurangi", alihkan: "Alihkan", terima: "Terima",
};

const STATUS_TINDAKAN: Record<StatusTindakan, { label: string; nada: "netral" | "info" | "sukses" }> = {
  rencana: { label: "Rencana", nada: "netral" },
  berjalan: { label: "Berjalan", nada: "info" },
  selesai: { label: "Selesai", nada: "sukses" },
  batal: { label: "Batal", nada: "netral" },
};

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
};

const rupiah = (v: string | number | null) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
};

/**
 * `useSearchParams` memaksa render sisi klien, dan Next menuntut batas
 * Suspense untuk itu — tanpa ini `pnpm build` gagal saat prerender. Pola yang
 * sama dipakai `/jadwal`; ditemukan oleh build di sana, bukan oleh ingatan.
 */
export default function RisikoPage() {
  return (
    <Suspense fallback={
      <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat register risiko…
      </div>
    }>
      <IsiRisiko />
    </Suspense>
  );
}

/**
 * Proyek terpilih dibaca dari `?proyek=<id>` bila ada dan sah, kalau tidak
 * proyek pertama daftar.
 *
 * Bukan sekadar kenyamanan: tanpa ini halaman tak bisa DITAUTKAN. Detail
 * proyek yang hendak mengarahkan ke registernya harus bisa menyebut proyek
 * mana — dan tanpa parameter, tautannya selalu mendarat di proyek pertama
 * menurut abjad, yang hampir tak pernah proyek yang dimaksud.
 */
function IsiRisiko() {
  const params = useSearchParams();
  const dariUrl = params.get("proyek") ?? "";
  const [proyekList, setProyekList] = useState<Proyek[]>([]);
  const [proyekId, setProyekId] = useState("");
  const [data, setData] = useState<Muatan | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [tab, setTab] = useState<"register" | "mitigasi">("register");

  const [orang, setOrang] = useState<Orang[]>([]);

  const [tambah, setTambah] = useState(false);
  const [fJudul, setFJudul] = useState("");
  const [fPemilik, setFPemilik] = useState("");
  const [fKategori, setFKategori] = useState("teknis");
  const [fDampak, setFDampak] = useState("3");
  const [fKemungkinan, setFKemungkinan] = useState("3");
  const [fStrategi, setFStrategi] = useState("kurangi");
  const [fUraian, setFUraian] = useState("");
  const [fTenggat, setFTenggat] = useState("");

  const [mitigasiUntuk, setMitigasiUntuk] = useState<RisikoBaris | null>(null);
  const [mTindakan, setMTindakan] = useState("");
  const [mPenanggung, setMPenanggung] = useState("");
  const [mTenggat, setMTenggat] = useState("");
  const [mBiaya, setMBiaya] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => {
        const d = r.data.projects ?? [];
        setProyekList(d);
        // Yang dari URL menang, TAPI hanya kalau id-nya benar-benar ada di
        // daftar: id ngawur dari tautan lama harus mendarat di sesuatu yang
        // nyata, bukan di layar kosong yang tak bisa dijelaskan.
        setProyekId((s) =>
          s || (dariUrl && d.some((p) => p.id === dariUrl) ? dariUrl : "") || d[0]?.id || "");
      })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar proyek"); });
    return () => ac.abort();
  }, [dariUrl]);

  // Daftar orang untuk memilih PEMILIK risiko dan PENANGGUNG tindakan.
  //
  // Penjaga `audit-kolom-tak-tersambung` menangkap versi pertama halaman ini:
  // API menerima `pemilik_id` dan `penanggung_id`, tetapi tak ada satu pun
  // jalan mengisinya dari layar — kolomnya akan NULL selamanya. Itu bukan
  // cacat kosmetik: "belum ada pemiliknya" ADALAH salah satu alasan mendesak
  // yang ditampilkan register ini, dan menampilkan keluhan yang tak bisa
  // diperbaiki pengguna adalah cara tercepat membuat orang berhenti membaca.
  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ users: Orang[] }>("/api/v1/users", { signal: ac.signal })
      .then((r) => setOrang(r.data.users ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar pengguna"); });
    return () => ac.abort();
  }, []);

  const muat = useCallback(async (id: string) => {
    // Lewat mikrotask, BUKAN setState langsung di badan efek: yang kedua
    // memicu render bertingkat (`set-state-in-effect`). Pola yang sama sudah
    // dipakai `/jadwal`.
    if (!id) { void Promise.resolve().then(() => setData(null)); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<Muatan>(`/api/v1/proyek/${id}/risiko`);
      setData(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat register risiko");
      setData(null);
    } finally { setMemuat(false); }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: `muat()` menyetel state di
  // awalnya, dan memanggilnya dari badan efek adalah setState-di-dalam-efek
  // (`react-hooks/set-state-in-effect`) yang memicu render bertingkat. Pola
  // yang sama dipakai `/mutu/ncr`; ratchet lint mengukurnya 67 → 71 pada
  // percobaan pertama halaman ini.
  useEffect(() => { queueMicrotask(() => { void muat(proyekId); }); }, [proyekId, muat]);

  const simpanRisiko = useCallback(async () => {
    if (!proyekId) return;
    if (!fJudul.trim()) { setGalatModal("Judul risiko wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/proyek/${proyekId}/risiko`, {
        judul: fJudul.trim(),
        kategori: fKategori,
        dampak: fDampak,
        kemungkinan: fKemungkinan,
        strategi: fStrategi,
        uraian: fUraian.trim() || null,
        tenggat_tinjau: fTenggat || null,
        pemilik_id: fPemilik || null,
      });
      setTambah(false);
      setFJudul(""); setFUraian(""); setFTenggat(""); setFPemilik("");
      await muat(proyekId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah risiko");
    } finally { setMenyimpan(false); }
  }, [proyekId, fJudul, fKategori, fDampak, fKemungkinan, fStrategi, fUraian,
      fTenggat, fPemilik, muat]);

  const simpanMitigasi = useCallback(async () => {
    if (!mitigasiUntuk) return;
    if (!mTindakan.trim()) { setGalatModal("Tindakan wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/risiko/${mitigasiUntuk.id}/mitigasi`, {
        tindakan: mTindakan.trim(),
        tenggat: mTenggat || null,
        biaya_estimasi: mBiaya || null,
        penanggung_id: mPenanggung || null,
      });
      setMitigasiUntuk(null);
      setMTindakan(""); setMTenggat(""); setMBiaya(""); setMPenanggung("");
      await muat(proyekId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah tindakan");
    } finally { setMenyimpan(false); }
  }, [mitigasiUntuk, mTindakan, mTenggat, mBiaya, mPenanggung, proyekId, muat]);

  const tandaiSelesai = useCallback(async (t: Tindakan) => {
    try {
      await api.patch(`/api/v1/mitigasi/${t.id}`, { status: "selesai" });
      await muat(proyekId);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal menandai selesai");
    }
  }, [proyekId, muat]);

  /**
   * Semua tindakan dari semua risiko, dengan risikonya ikut terbawa.
   *
   * Inilah sudut pandang kedua: bukan "risiko apa saja", melainkan "apa yang
   * harus saya urus". Diurutkan menurut tenggat — yang tanpa tenggat di
   * belakang, karena yang tak bertenggat tak menuntut minggu ini.
   */
  const semuaTindakan = useMemo(() => {
    const keluar: Array<Tindakan & { risiko: RisikoBaris }> = [];
    for (const r of data?.risiko ?? []) {
      for (const t of r.tindakan ?? []) keluar.push({ ...t, risiko: r });
    }
    return keluar.sort((a, b) => {
      const selesaiA = a.status === "selesai" || a.status === "batal";
      const selesaiB = b.status === "selesai" || b.status === "batal";
      if (selesaiA !== selesaiB) return selesaiA ? 1 : -1;
      if (!a.tenggat && !b.tenggat) return 0;
      if (!a.tenggat) return 1;
      if (!b.tenggat) return -1;
      return a.tenggat.localeCompare(b.tenggat);
    });
  }, [data]);

  const belumSelesai = semuaTindakan.filter(
    (t) => t.status !== "selesai" && t.status !== "batal").length;

  const kolomRisiko: Array<Kolom<RisikoBaris>> = [
    {
      kunci: "risiko", judul: "Risiko", kepalaBaris: true,
      render: (r) => (
        <span style={{
          display: "block", paddingLeft: 9,
          // Pita kiri HANYA untuk yang mendesak — bukan untuk skor tinggi.
          // Risiko ekstrem yang sudah ditangani dan dinilai ulang tidak
          // menuntut apa pun minggu ini.
          borderLeft: r.mendesak
            ? "3px solid var(--danger)" : "3px solid transparent",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {r.kode && (
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{r.kode}</span>
            )}
            <strong style={{ fontSize: 13, color: C.text }}>{r.judul}</strong>
          </span>
          {/* Pemilik disebut HANYA bila ada. Ketiadaannya sudah dilaporkan
              baris alasan di bawah untuk risiko tinggi/ekstrem — dan pada
              risiko rendah ia memang bukan kekurangan yang perlu diteriakkan.
              Versi pertama halaman ini menulisnya di KEDUA tempat, dan
              "belum ada pemiliknya" muncul dua kali dalam satu baris. */}
          <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
            {KATEGORI[r.kategori] ?? r.kategori}
            {" · "}{STRATEGI[r.strategi] ?? r.strategi}
            {r.pemilik ? ` · ${r.pemilik.name}` : ""}
          </span>
          {r.mendesak && r.alasan_mendesak.length > 0 && (
            // Alasannya ditulis, bukan disembunyikan di balik klik.
            <span style={{
              display: "block", fontSize: 11, color: "var(--danger)",
              marginTop: 3, fontWeight: 600,
            }}>{r.alasan_mendesak.join(" · ")}</span>
          )}
        </span>
      ),
    },
    {
      kunci: "skor", judul: "Skor", rata: "kanan",
      // Skor awal dan skor sisa disusun dalam GRID tiga kolom berlebar tetap,
      // bukan inline-flex.
      //
      // Dengan inline-flex, baris yang punya skor sisa ("15 ↓ 5") melebar ke
      // kiri dan angka utamanya bergeser — sehingga 16 dan 15 tak lagi sejajar
      // di kolom yang rata kanan. Digit yang tak sejajar tak bisa dibandingkan
      // sekilas, dan itu justru satu-satunya alasan kolom ini rata kanan.
      // Terlihat di layar, bukan di test.
      render: (r) => (
        <span style={{ display: "block", fontVariantNumeric: "tabular-nums" }}>
          <span style={{
            display: "grid", gridTemplateColumns: "1fr 14px 22px",
            alignItems: "center", justifyItems: "end", gap: 3,
          }}>
            <strong style={{ fontSize: 15, color: C.text }}>{r.skor}</strong>
            {r.skor_sisa !== null ? (
              <>
                <ArrowDown size={11} aria-hidden="true" style={{ color: C.muted }} />
                <strong style={{
                  fontSize: 15,
                  color: r.penurunan && r.penurunan > 0 ? "var(--success)" : C.mid,
                }}>{r.skor_sisa}</strong>
              </>
            ) : (
              // Dua sel kosong menjaga lebar kolom tetap sama untuk SEMUA
              // baris — itulah yang membuat angka utamanya sejajar.
              <><span aria-hidden="true" /><span aria-hidden="true" /></>
            )}
          </span>
          <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
            {r.dampak}×{r.kemungkinan}
            {/* `null` dan 0 dibedakan: belum dinilai ulang ≠ dinilai dan tak
                turun. Menyamakannya menyembunyikan mitigasi yang gagal. */}
            {r.skor_sisa === null
              ? " · belum dinilai ulang"
              : r.penurunan === 0 ? " · mitigasi belum menurunkan" : ""}
          </span>
        </span>
      ),
    },
    {
      kunci: "tingkat", judul: "Tingkat",
      render: (r) => (
        <span title={TINGKAT[r.tingkat].arti}>
          <Lencana nada={TINGKAT[r.tingkat].nada}>{TINGKAT[r.tingkat].label}</Lencana>
        </span>
      ),
    },
    {
      kunci: "tindakan", judul: "Tindakan", rata: "kanan",
      render: (r) => {
        const aktif = (r.tindakan ?? []).filter((t) => t.status !== "batal");
        const rampung = aktif.filter((t) => t.status === "selesai").length;
        return (
          <span style={{ display: "block", fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
            {aktif.length === 0 ? (
              <span style={{ color: r.tingkat === "ekstrem" ? "var(--danger)" : C.muted }}>
                belum ada
              </span>
            ) : `${rampung}/${aktif.length} selesai`}
          </span>
        );
      },
    },
    {
      kunci: "aksi", judul: "",
      render: (r) => (
        r.status === "tertutup"
          ? <span style={{ fontSize: 11, color: C.muted }}>tertutup</span>
          : (
            <Tombol kecil onClick={() => { setMitigasiUntuk(r); setGalatModal(null); }}
              ikon={<Plus size={12} />}>
              Tindakan
            </Tombol>
          )
      ),
    },
  ];

  const kolomTindakan: Array<Kolom<Tindakan & { risiko: RisikoBaris }>> = [
    {
      kunci: "tindakan", judul: "Tindakan", kepalaBaris: true,
      render: (t) => {
        const telat = t.status !== "selesai" && t.status !== "batal"
          && t.tenggat != null && data != null && t.tenggat < data.pada;
        return (
          <span style={{
            display: "block", paddingLeft: 9,
            borderLeft: telat ? "3px solid var(--danger)" : "3px solid transparent",
          }}>
            <strong style={{ fontSize: 13, color: C.text }}>{t.tindakan}</strong>
            {/* Risikonya ikut ditulis — inilah alasan mitigasi tak berdiri
                sendiri sebagai halaman. */}
            <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1 }}>
              menjawab: {t.risiko.judul} (skor {t.risiko.skor})
              {t.penanggung ? ` · ${t.penanggung.name}` : ""}
            </span>
          </span>
        );
      },
    },
    {
      kunci: "tenggat", judul: "Tenggat",
      render: (t) => {
        const telat = t.status !== "selesai" && t.status !== "batal"
          && t.tenggat != null && data != null && t.tenggat < data.pada;
        return (
          <span style={{
            display: "block", fontSize: 12,
            color: telat ? "var(--danger)" : C.mid,
            fontWeight: telat ? 700 : 400,
          }}>
            {tanggal(t.tenggat)}
            {telat && <span style={{ display: "block", fontSize: 11 }}>lewat tenggat</span>}
          </span>
        );
      },
    },
    {
      kunci: "biaya", judul: "Biaya", rata: "kanan",
      render: (t) => (
        <span style={{ fontSize: 12, color: C.mid, fontVariantNumeric: "tabular-nums" }}>
          {rupiah(t.biaya_estimasi)}
        </span>
      ),
    },
    {
      kunci: "status", judul: "Status",
      render: (t) => (
        <Lencana nada={STATUS_TINDAKAN[t.status].nada}>
          {STATUS_TINDAKAN[t.status].label}
        </Lencana>
      ),
    },
    {
      kunci: "aksi", judul: "",
      render: (t) => (
        t.status === "selesai" || t.status === "batal"
          ? <span aria-hidden="true" />
          : (
            <Tombol kecil onClick={() => void tandaiSelesai(t)}
              ikon={<CircleCheck size={12} />}>
              Selesai
            </Tombol>
          )
      ),
    },
  ];

  /**
   * Kaki dialog: Batal + Simpan. Ditulis sekali, dipakai dua dialog —
   * dua tombol yang berbeda gaya untuk pekerjaan yang sama adalah cacat
   * konsistensi yang paling cepat terlihat.
   */
  const kakiDialog = (onTutup: () => void, onSimpan: () => void, label: string) => (
    <>
      <Tombol jenis="hantu" onClick={onTutup} disabled={menyimpan}>Batal</Tombol>
      <Tombol jenis="utama" onClick={onSimpan} disabled={menyimpan}>
        {menyimpan ? "Menyimpan…" : label}
      </Tombol>
    </>
  );

  const galatDialog = galatModal && (
    <div role="alert" style={{
      marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
      border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
      color: "var(--danger)", lineHeight: 1.5,
    }}>{galatModal}</div>
  );

  const r = data?.ringkas;

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<ShieldAlert size={18} />}
        judul="Register Risiko"
        keterangan={
          <>Apa yang bisa menghentikan proyek ini, dan siapa yang mengurusnya.
          Yang ditandai merah <strong>bukan yang skornya tinggi</strong>, melainkan
          yang menuntut tindakan sekarang — risiko ekstrem yang sudah ditangani
          dan dinilai ulang tidak menuntut apa pun minggu ini.</>
        }
        aksi={
          <Tombol jenis="utama" ikon={<Plus size={14} />}
            onClick={() => { setTambah(true); setGalatModal(null); }}
            disabled={!proyekId}>
            Catat risiko
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat(proyekId)} />}

      <Kartu pad="sedang">
        <label htmlFor="rk-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <select
          id="rk-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)}
          style={{ ...gayaInput, maxWidth: 420 }}
        >
          <option value="">— pilih proyek —</option>
          {proyekList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </Kartu>

      {r && (
        <BarisAngka>
          {/* Satu kartu disorot: yang mendesak. Kartu lain netral — kalau
              semuanya berwarna, tak ada yang berarti (§3d). */}
          <KartuAngka
            label="Perlu perhatian"
            nilai={r.mendesak}
            ikon={<TriangleAlert size={15} />}
            sorot={r.mendesak > 0}
            sub={r.mendesak > 0
              ? "risiko yang menuntut tindakan sekarang"
              : "tak ada yang menuntut tindakan hari ini"}
          />
          <KartuAngka
            label="Ekstrem & tinggi"
            nilai={r.per_tingkat.ekstrem + r.per_tingkat.tinggi}
            ikon={<ShieldAlert size={15} />}
            sub={`${r.per_tingkat.ekstrem} ekstrem · ${r.per_tingkat.tinggi} tinggi · belum tertutup`}
          />
          <KartuAngka
            label="Sudah terjadi"
            nilai={r.terjadi}
            ikon={<CircleDot size={15} />}
            sub={r.terjadi > 0 ? "bukan lagi kemungkinan" : "belum ada yang terjadi"}
          />
          <KartuAngka
            label="Turun berkat mitigasi"
            // `null` (belum ada yang dinilai ulang) ditulis apa adanya, bukan
            // dipaksa jadi 0 — nol berarti "mitigasi tak menurunkan apa pun".
            nilai={r.penurunan_rata === null ? "—" : `−${r.penurunan_rata}`}
            ikon={<ArrowDown size={15} />}
            sub={r.penurunan_rata === null
              ? "belum ada yang dinilai ulang"
              : `rata-rata dari ${r.dinilai_ulang} risiko yang dinilai ulang`}
          />
        </BarisAngka>
      )}

      <TabBagian
        label="Sudut pandang risiko"
        aktif={tab}
        onPilih={setTab}
        bagian={[
          {
            kunci: "register" as const, label: "Register Risiko",
            jumlah: r?.mendesak || undefined,
            mendesak: (r?.mendesak ?? 0) > 0,
            artiJumlah: "risiko perlu perhatian",
          },
          {
            kunci: "mitigasi" as const, label: "Rencana Mitigasi",
            jumlah: belumSelesai || undefined,
            artiJumlah: "tindakan belum selesai",
          },
        ]}
      />

      {!proyekId ? (
        <Kosong
          ikon={<ShieldAlert size={28} />}
          judul="Pilih proyek dulu"
          sebab="Risiko melekat pada proyek — jenis pekerjaan, lokasi, dan pemberi kerjanya yang menentukan apa yang bisa salah."
        />
      ) : memuat ? (
        <Rangka tinggi={56} jumlah={4} />
      ) : tab === "register" ? (
        <Kartu pad="rapat">
          <JudulKartu sub={data ? `dinilai pada ${tanggal(data.pada)}` : undefined}>
            Register
          </JudulKartu>
          <Tabel
            kolom={kolomRisiko}
            data={data?.risiko ?? []}
            kunciBaris={(x) => x.id}
            caption="Register risiko proyek beserta skor sebelum dan sesudah mitigasi"
            tandaiBaris={(x) => (x.mendesak ? "bahaya" : undefined)}
            kosong={
              <Kosong
                ikon={<ShieldAlert size={28} />}
                judul="Belum ada risiko tercatat"
                sebab="Register kosong bukan berarti proyek ini tanpa risiko — hanya berarti belum ada yang mendaftarkannya."
              />
            }
          />
        </Kartu>
      ) : (
        <Kartu pad="rapat">
          {/* Sub-judul menyebut apa yang DIHITUNG lencana tabnya.
              *
              * Terlihat di layar: tab berlencana "5" sementara tabelnya
              * menampilkan 7 baris — angka yang tak bisa dijelaskan tanpa
              * membuka kode. `artiJumlah` sudah menanganinya untuk pembaca
              * layar, tetapi mata tak membaca `aria-label`. */}
          <JudulKartu
            sub={
              `${belumSelesai} dari ${semuaTindakan.length} belum selesai · `
              + "diurutkan menurut tenggat, yang tanpa tenggat di belakang"
            }
          >
            Tindakan mitigasi
          </JudulKartu>
          <Tabel
            kolom={kolomTindakan}
            data={semuaTindakan}
            kunciBaris={(x) => x.id}
            caption="Tindakan mitigasi seluruh risiko proyek beserta risiko yang dijawabnya"
            kosong={
              <Kosong
                ikon={<ListChecks size={28} />}
                judul="Belum ada tindakan mitigasi"
                sebab="Tindakan dicatat dari register — buka tab Register Risiko, lalu tekan Tindakan pada risiko yang hendak ditangani."
              />
            }
          />
        </Kartu>
      )}

      {/* ── Catat risiko ─────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambah}
        judul="Catat risiko"
        keterangan="Skornya dihitung dari dampak × kemungkinan — tak bisa diketik langsung, supaya angkanya tak pernah menyimpang dari faktornya."
        onTutup={() => setTambah(false)}
        kaki={kakiDialog(() => setTambah(false), () => void simpanRisiko(), "Simpan risiko")}
      >
        {galatDialog}
        <Medan id="rk-judul" label="Risiko" wajib
          keterangan="Tulis sebagai hal yang BISA TERJADI, bukan sebagai keluhan. “Material baja terlambat 3 minggu” — bukan “pengadaan lambat”."
          anak={
            <input id="rk-judul" value={fJudul} onChange={(e) => setFJudul(e.target.value)}
              style={gayaInput} />
          }
        />
        <Medan id="rk-kategori" label="Kategori"
          anak={
            <select id="rk-kategori" value={fKategori}
              onChange={(e) => setFKategori(e.target.value)} style={gayaInput}>
              {Object.entries(KATEGORI).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          }
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 150px" }}>
            <Medan id="rk-dampak" label="Dampak (1–5)"
              keterangan="Seberapa parah kalau terjadi."
              anak={
                <select id="rk-dampak" value={fDampak}
                  onChange={(e) => setFDampak(e.target.value)} style={gayaInput}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              }
            />
          </div>
          <div style={{ flex: "1 1 150px" }}>
            <Medan id="rk-kemungkinan" label="Kemungkinan (1–5)"
              keterangan="Seberapa mungkin terjadi."
              anak={
                <select id="rk-kemungkinan" value={fKemungkinan}
                  onChange={(e) => setFKemungkinan(e.target.value)} style={gayaInput}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              }
            />
          </div>
        </div>
        <Medan id="rk-strategi" label="Strategi"
          keterangan="“Terima” adalah pilihan sah — risiko yang diterima sadar berbeda dari yang diabaikan, dan menuliskannya lebih jujur daripada mengarang mitigasi."
          anak={
            <select id="rk-strategi" value={fStrategi}
              onChange={(e) => setFStrategi(e.target.value)} style={gayaInput}>
              {Object.entries(STRATEGI).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          }
        />
        <Medan id="rk-pemilik" label="Pemilik risiko"
          keterangan="Siapa yang mengurusnya. Risiko tinggi tanpa pemilik ditandai perlu perhatian — yang tak dimiliki siapa pun tak diurus siapa pun."
          anak={
            <select id="rk-pemilik" value={fPemilik}
              onChange={(e) => setFPemilik(e.target.value)} style={gayaInput}>
              <option value="">— belum ditentukan —</option>
              {orang.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          }
        />
        <Medan id="rk-tenggat" label="Tenggat tinjau"
          keterangan="Kapan risiko ini diperiksa ulang. Yang lewat tenggat ditandai perlu perhatian."
          anak={
            <input id="rk-tenggat" type="date" value={fTenggat}
              onChange={(e) => setFTenggat(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="rk-uraian" label="Uraian"
          anak={
            <textarea id="rk-uraian" value={fUraian} rows={3}
              onChange={(e) => setFUraian(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
      </DialogBersama>

      {/* ── Tambah tindakan mitigasi ─────────────────────────────────────── */}
      <DialogBersama
        terbuka={mitigasiUntuk != null}
        judul="Tambah tindakan mitigasi"
        onTutup={() => setMitigasiUntuk(null)}
        kaki={kakiDialog(() => setMitigasiUntuk(null), () => void simpanMitigasi(), "Simpan tindakan")}
      >
        {galatDialog}
        {mitigasiUntuk && (
          <p style={{ fontSize: 12.5, color: C.mid, margin: "0 0 12px", lineHeight: 1.5 }}>
            Menjawab risiko <strong style={{ color: C.text }}>{mitigasiUntuk.judul}</strong>{" "}
            (skor {mitigasiUntuk.skor} · {TINGKAT[mitigasiUntuk.tingkat].label}).
          </p>
        )}
        <Medan id="mt-tindakan" label="Tindakan" wajib
          keterangan="Tulis yang bisa dikerjakan orang, bukan niat. “Pesan baja 4 minggu lebih awal” — bukan “dipantau berkala”."
          anak={
            <input id="mt-tindakan" value={mTindakan}
              onChange={(e) => setMTindakan(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="mt-penanggung" label="Penanggung"
          keterangan="Siapa yang mengerjakan tindakan ini."
          anak={
            <select id="mt-penanggung" value={mPenanggung}
              onChange={(e) => setMPenanggung(e.target.value)} style={gayaInput}>
              <option value="">— belum ditentukan —</option>
              {orang.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          }
        />
        <Medan id="mt-tenggat" label="Tenggat"
          anak={
            <input id="mt-tenggat" type="date" value={mTenggat}
              onChange={(e) => setMTenggat(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="mt-biaya" label="Perkiraan biaya"
          keterangan="Boleh dikosongkan. Diisi bila mitigasinya menuntut anggaran — itulah yang dibandingkan dengan dampak risikonya."
          anak={
            <input id="mt-biaya" type="number" min="0" value={mBiaya}
              onChange={(e) => setMBiaya(e.target.value)} style={gayaInput} />
          }
        />
      </DialogBersama>
    </Halaman>
  );
}
