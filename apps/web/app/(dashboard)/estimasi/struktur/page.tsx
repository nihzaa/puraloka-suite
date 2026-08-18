"use client";

/**
 * ANALISA STRUKTUR — desain & volume dari satu input yang sama.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Hari ini dua pertanyaan dijawab di dua tempat yang berbeda:
 *
 *     "penampang ini kuat tidak?"  → spreadsheet analisa struktur
 *     "berapa beton & besinya?"     → estimator mengetik volume ke RAB
 *
 * Yang kedua diketik ULANG dari yang pertama. Begitu desainnya berubah —
 * balok 300×500 jadi 300×520 — RAB tidak ikut berubah, dan tak ada satu pun
 * galat yang memberi tahu. Selisihnya baru ketahuan saat besi di lapangan
 * kurang, yaitu saat uangnya sudah keluar.
 *
 * Layar ini menampilkan KEDUANYA dari elemen yang sama. Verdict struktural
 * dan kuantitas RAP tak bisa lagi berselisih karena keduanya turunan dari
 * angka yang sama.
 *
 * ── Tiga keputusan tampilan yang bukan selera
 *
 *   1. **`basi` ditampilkan menyala, bukan disembunyikan.** Elemen yang
 *      inputnya diubah sesudah dihitung punya ringkasan yang tak lagi
 *      berlaku. Rekap MENGECUALIKANNYA — jadi kalau tandanya tak terlihat,
 *      totalnya berkurang tanpa ada yang tahu kenapa.
 *
 *   2. **Catatan batas ikut ditampilkan, tidak dilipat.** Volume besi belum
 *      termasuk penyaluran/stek. Diukur: BBS memberi 1,26× berat Fase 1.
 *      Angka yang 26% kurang tanpa keterangan adalah cara paling rapi
 *      membuat orang salah — terlihat wajar, tak ada galat.
 *
 *   3. **Elemen tidak aman ditandai di BARIS, bukan hanya di detail.**
 *      Orang membaca daftar, bukan membuka satu per satu.
 */

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Tabel } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { Isian, KotakIsian, PilihanIsian } from "@/components/isian";
import { formatAngka } from "@/lib/format";
import {
  AlertTriangle, Boxes, CheckCircle2, Info, Plus, RefreshCw, Ruler, Trash2, X,
} from "lucide-react";
import { Modal, btnPrimary, btnGhost } from "../_bersama/kerangka";
import { LayarKosong } from "../_bersama/layar-kosong";

// ── Bentuk respons API ────────────────────────────────────────────────────
interface Project { id: string; name: string }

type Jenis = "balok" | "kolom" | "kolom_bulat" | "plat" | "footplat" | "pilecap" | "tiang";

interface BarisElemen {
  id: string;
  kode: string;
  nama: string | null;
  jenis: Jenis;
  jumlah: number;
  aman: boolean | null;
  basi: boolean;
  beton_m3: number | null;
  bekisting_m2: number | null;
  besi_kg: number | null;
  dihitung_pada: string | null;
  catatan: string | null;
}

interface Rekap {
  jumlahElemen: number;
  jumlahBasi: number;
  jumlahTidakAman: number;
  jumlahBelumDihitung: number;
  betonM3: number;
  bekistingM2: number;
  besiKg: number;
}

interface MuatanDaftar { data: BarisElemen[]; rekap: Rekap }

interface BarisBesi {
  tipe: "BjTP" | "BjTS";
  diameterMm: number;
  peran: string;
  jumlahBatang: number;
  totalKg: number;
}

interface MuatanRekapVolume {
  rekap: {
    betonM3: number;
    bekistingM2: number;
    besiTotalKg: number;
    beratSendiriKg: number;
    besi: BarisBesi[];
  };
  jumlahElemen: number;
  catatan: string[];
  gagal: { kode: string; alasan: string }[];
}

/**
 * Nama jenis dalam bahasa lapangan.
 *
 * Kunci mentah (`kolom_bulat`) tak pernah muncul di layar: yang membacanya
 * estimator dan pelaksana, bukan yang menulis skemanya.
 */
const NAMA_JENIS: Record<Jenis, string> = {
  balok: "Balok",
  kolom: "Kolom persegi",
  kolom_bulat: "Kolom bulat",
  plat: "Pelat lantai",
  footplat: "Pondasi footplat",
  pilecap: "Pilecap",
  tiang: "Tiang pancang",
};

/**
 * Medan input per jenis — sumber tunggal untuk form DAN untuk contoh.
 *
 * Ditulis sebagai data, bukan tujuh form terpisah: tujuh form berarti tujuh
 * tempat yang bisa menyimpang dari kontrak API, dan yang menyimpang tak
 * ketahuan sampai ada yang mencoba menyimpannya.
 */
interface Medan { kunci: string; label: string; satuan?: string }

const MEDAN_MUTU: Medan[] = [
  { kunci: "mutu.fcMpa", label: "Mutu beton f'c", satuan: "MPa" },
  { kunci: "mutu.fyMpa", label: "Mutu baja fy", satuan: "MPa" },
];

const MEDAN: Record<Jenis, Medan[]> = {
  balok: [
    { kunci: "bMm", label: "Lebar b", satuan: "mm" },
    { kunci: "hMm", label: "Tinggi h", satuan: "mm" },
    { kunci: "panjangM", label: "Panjang bentang", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan utama", satuan: "mm" },
    { kunci: "nTarik", label: "Jumlah tulangan tarik (bawah)" },
    { kunci: "nTekan", label: "Jumlah tulangan atas (gantungan)" },
    { kunci: "dSengkangMm", label: "Ø sengkang", satuan: "mm" },
    { kunci: "jarakSengkangMm", label: "Jarak sengkang", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "muKnm", label: "Momen rencana Mu", satuan: "kNm" },
    { kunci: "vuKn", label: "Geser rencana Vu", satuan: "kN" },
  ],
  kolom: [
    { kunci: "bMm", label: "Sisi b", satuan: "mm" },
    { kunci: "hMm", label: "Sisi h", satuan: "mm" },
    { kunci: "tinggiM", label: "Tinggi kolom", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan utama", satuan: "mm" },
    { kunci: "nBarisX", label: "Baris tulangan arah X" },
    { kunci: "nBarisY", label: "Baris tulangan arah Y" },
    { kunci: "dSengkangMm", label: "Ø sengkang", satuan: "mm" },
    { kunci: "jarakSengkangMm", label: "Jarak sengkang", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "puKn", label: "Beban aksial Pu", satuan: "kN" },
    { kunci: "muKnm", label: "Momen Mu", satuan: "kNm" },
  ],
  kolom_bulat: [
    { kunci: "diameterMm", label: "Diameter", satuan: "mm" },
    { kunci: "tinggiM", label: "Tinggi kolom", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan utama", satuan: "mm" },
    { kunci: "nTulangan", label: "Jumlah tulangan" },
    { kunci: "dPengekangMm", label: "Ø pengekang", satuan: "mm" },
    { kunci: "jarakPengekangMm", label: "Jarak pengekang", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "puKn", label: "Beban aksial Pu", satuan: "kN" },
    { kunci: "muKnm", label: "Momen Mu", satuan: "kNm" },
  ],
  plat: [
    { kunci: "lxM", label: "Bentang arah X", satuan: "m" },
    { kunci: "lyM", label: "Bentang arah Y", satuan: "m" },
    { kunci: "hM", label: "Tebal pelat", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dTulanganMm", label: "Ø tulangan", satuan: "mm" },
    { kunci: "jarakTulanganMm", label: "Jarak tulangan", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "bebanHidupKnM2", label: "Beban hidup", satuan: "kN/m²" },
    { kunci: "luasM2", label: "Luas total pelat (untuk volume)", satuan: "m²" },
  ],
  footplat: [
    { kunci: "lxM", label: "Lebar arah X", satuan: "m" },
    { kunci: "lyM", label: "Lebar arah Y", satuan: "m" },
    { kunci: "hM", label: "Tebal pondasi", satuan: "m" },
    { kunci: "bxM", label: "Lebar kolom arah X", satuan: "m" },
    { kunci: "byM", label: "Lebar kolom arah Y", satuan: "m" },
    { kunci: "zM", label: "Tebal tanah di atas", satuan: "m" },
    { kunci: "gammaTanahKnM3", label: "Berat volume tanah", satuan: "kN/m³" },
    { kunci: "dAksenM", label: "Selimut ke pusat tulangan", satuan: "m" },
    { kunci: "dTulanganMm", label: "Ø tulangan", satuan: "mm" },
    { kunci: "jarakTulanganMm", label: "Jarak tulangan", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "pukKn", label: "Beban kolom Puk", satuan: "kN" },
    { kunci: "muxKnm", label: "Momen Mux", satuan: "kNm" },
    { kunci: "muyKnm", label: "Momen Muy", satuan: "kNm" },
    { kunci: "qaKnM2", label: "Daya dukung ijin tanah", satuan: "kN/m²" },
  ],
  pilecap: [
    { kunci: "nx", label: "Jumlah tiang arah X" },
    { kunci: "ny", label: "Jumlah tiang arah Y" },
    { kunci: "dxM", label: "Jarak antar tiang X", satuan: "m" },
    { kunci: "dyM", label: "Jarak antar tiang Y", satuan: "m" },
    { kunci: "axM", label: "Tiang terluar ke tepi X", satuan: "m" },
    { kunci: "ayM", label: "Tiang terluar ke tepi Y", satuan: "m" },
    { kunci: "diameterTiangM", label: "Diameter tiang", satuan: "m" },
    { kunci: "bxM", label: "Lebar kolom arah X", satuan: "m" },
    { kunci: "byM", label: "Lebar kolom arah Y", satuan: "m" },
    { kunci: "hM", label: "Tebal pilecap", satuan: "m" },
    { kunci: "zM", label: "Tebal tanah di atas", satuan: "m" },
    { kunci: "gammaTanahKnM3", label: "Berat volume tanah", satuan: "kN/m³" },
    { kunci: "dAksenM", label: "Selimut ke pusat tulangan", satuan: "m" },
    { kunci: "dTulanganMm", label: "Ø tulangan", satuan: "mm" },
    { kunci: "jarakTulanganMm", label: "Jarak tulangan", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "pukKn", label: "Beban kolom Puk", satuan: "kN" },
    { kunci: "muxKnm", label: "Momen Mux", satuan: "kNm" },
    { kunci: "muyKnm", label: "Momen Muy", satuan: "kNm" },
    { kunci: "pIjinTiangKn", label: "Daya dukung ijin 1 tiang", satuan: "kN" },
  ],
  tiang: [
    { kunci: "diameterM", label: "Diameter tiang", satuan: "m" },
    { kunci: "panjangM", label: "Panjang tiang", satuan: "m" },
    { kunci: "fcMpa", label: "Mutu beton f'c", satuan: "MPa" },
    { kunci: "bebanRencanaKn", label: "Beban rencana", satuan: "kN" },
  ],
};

/**
 * Contoh terisi per jenis — bukan kemewahan.
 *
 * Form 20 medan yang kosong semuanya adalah tembok: yang membukanya tak tahu
 * satuan mana yang dipakai (`hM` meter atau milimeter?) dan angka berapa yang
 * masuk akal. Contoh yang LULUS analisa memberi titik berangkat yang bisa
 * diubah, dan sekaligus memperlihatkan satuannya lewat angka nyata.
 */
const CONTOH: Record<Jenis, Record<string, unknown>> = {
  balok: {
    bMm: 300, hMm: 520, panjangM: 6, selimutMm: 30, dUtamaMm: 16,
    nTarik: 5, nTekan: 2, dSengkangMm: 8, jarakSengkangMm: 150,
    mutu: { fcMpa: 25, fyMpa: 400 }, muKnm: 120, vuKn: 90,
  },
  kolom: {
    bMm: 400, hMm: 400, tinggiM: 3.5, selimutMm: 40, dUtamaMm: 19,
    nBarisX: 3, nBarisY: 3, dSengkangMm: 10, jarakSengkangMm: 150,
    mutu: { fcMpa: 30, fyMpa: 400 }, puKn: 1500, muKnm: 80,
  },
  kolom_bulat: {
    diameterMm: 400, tinggiM: 3.5, selimutMm: 40, dUtamaMm: 16, nTulangan: 8,
    dPengekangMm: 10, jarakPengekangMm: 150, pengekang: "sengkang",
    mutu: { fcMpa: 30, fyMpa: 400 }, puKn: 1200, muKnm: 60,
  },
  plat: {
    lxM: 3.5, lyM: 4, hM: 0.12, selimutMm: 20,
    dTulanganMm: 10, jarakTulanganMm: 150,
    tumpuan: { y1: "menerus", y2: "menerus", x1: "menerus", x2: "menerus" },
    mutu: { fcMpa: 30, fyMpa: 400 },
    bebanMatiTambahan: [{ nama: "Finishing", nilai: 1.2 }],
    bebanHidupKnM2: 2.5, luasM2: 200,
  },
  footplat: {
    lxM: 1.5, lyM: 1.5, hM: 0.3, bxM: 0.4, byM: 0.4, pxM: 0.75, pyM: 0.75,
    zM: 1.5, gammaTanahKnM3: 17, letakKolom: "tengah",
    mutu: { fcMpa: 30, fyMpa: 400 },
    dAksenM: 0.07, dTulanganMm: 13, jarakTulanganMm: 150,
    pukKn: 400, muxKnm: 20, muyKnm: 20, qaKnM2: 300,
  },
  pilecap: {
    nx: 2, ny: 2, dxM: 1.2, dyM: 1.2, axM: 0.5, ayM: 0.5,
    diameterTiangM: 0.4, bxM: 0.4, byM: 0.4, hM: 0.5, zM: 1,
    gammaTanahKnM3: 18, letakKolom: "tengah",
    mutu: { fcMpa: 30, fyMpa: 400 },
    dAksenM: 0.08, dTulanganMm: 16, jarakTulanganMm: 150,
    pukKn: 1200, muxKnm: 40, muyKnm: 40, pIjinTiangKn: 425,
  },
  tiang: {
    diameterM: 0.4, panjangM: 16, fcMpa: 36.6,
    lapisan: Array.from({ length: 8 }, () => ({ tebalM: 2, nSpt: 20 })),
    bebanRencanaKn: 300,
  },
};

/** Baca medan bersarang ("mutu.fcMpa") dari objek input. */
function bacaMedan(obj: Record<string, unknown>, kunci: string): string {
  const nilai = kunci.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
  return nilai === undefined || nilai === null ? "" : String(nilai);
}

/** Tulis medan bersarang tanpa mengubah objek aslinya. */
function tulisMedan(
  obj: Record<string, unknown>, kunci: string, nilai: string,
): Record<string, unknown> {
  const bagian = kunci.split(".");
  const hasil = { ...obj };
  let kursor: Record<string, unknown> = hasil;
  for (let i = 0; i < bagian.length - 1; i++) {
    const k = bagian[i];
    kursor[k] = { ...(kursor[k] as Record<string, unknown> ?? {}) };
    kursor = kursor[k] as Record<string, unknown>;
  }
  /*
    Teks kosong jadi `undefined`, BUKAN 0.

    Medan yang dikosongkan berarti "tak diisi", dan 0 adalah angka yang sah
    untuk sebagian medan (momen nol pada kolom tekan sentris). Menyamakan
    keduanya membuat form diam-diam mengirim beban nol.
  */
  kursor[bagian[bagian.length - 1]] = nilai === "" ? undefined : Number(nilai);
  return hasil;
}

/**
 * Gaya tombol yang MENUNJUKKAN keadaan nonaktifnya.
 *
 * `btnGhost`/`btnPrimary` bersama adalah objek gaya statis: `cursor: pointer`
 * tetap terpasang dan warnanya tak meredup meski `disabled` diberikan. Terlihat
 * begitu halaman ini dirender kosong — "Hitung ulang semua" tampak bisa diklik
 * padahal tak ada yang bisa dihitung, dan tombol yang tak merespons klik
 * terbaca sebagai aplikasi rusak, bukan sebagai tombol yang memang mati.
 *
 * Diperbaiki DI SINI, bukan di komponen bersama: `kerangka.tsx` dipakai
 * halaman lain yang di luar cakupan pekerjaan ini, dan mengubah gaya bersama
 * berarti menggeser tampilan layar yang tak sempat saya lihat hasilnya.
 */
function mati(gaya: React.CSSProperties, nonaktif: boolean): React.CSSProperties {
  return nonaktif ? { ...gaya, opacity: 0.5, cursor: "not-allowed" } : gaya;
}

const NUM = (v: number | null | undefined) => (v == null ? 0 : Number(v));

function StrukturLayar() {
  const router = useRouter();
  const params = useSearchParams();
  const projectId = params.get("proyek") ?? "";
  const setProjectId = useCallback((id: string) => {
    router.push(id ? `/estimasi/struktur?proyek=${id}` : "/estimasi/struktur");
  }, [router]);

  const { data: proyekData } =
    useData<{ projects: Project[] }>("/api/v1/projects");
  const projects = useMemo(() => proyekData?.projects ?? [], [proyekData]);

  const { data: daftar, memuat, galat: galatMuat, muatUlang } =
    useData<MuatanDaftar>(projectId ? `/api/v1/projects/${projectId}/struktur` : null);

  const { data: volume, muatUlang: muatUlangVolume } = useData<MuatanRekapVolume>(
    projectId ? `/api/v1/projects/${projectId}/struktur/rekap-volume` : null);

  /*
    GALAT MUAT DAN GALAT AKSI DIPISAH.

    Satu state untuk keduanya berarti gagal menyimpan MENGHAPUS pesan gagal
    muat — cacat yang ditemukan di 11 halaman dan kini dijaga
    `uji-galat-muat-terpisah.mjs`.
  */
  const galat = galatMuat ? "Gagal memuat daftar elemen struktur" : null;
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const [formBuka, setFormBuka] = useState(false);
  const [jenis, setJenis] = useState<Jenis>("balok");
  const [kode, setKode] = useState("");
  const [nama, setNama] = useState("");
  const [jumlah, setJumlah] = useState("1");
  const [input, setInput] = useState<Record<string, unknown>>(CONTOH.balok);

  const gantiJenis = useCallback((j: Jenis) => {
    setJenis(j);
    setInput(CONTOH[j]);
  }, []);

  const segarkan = useCallback(async () => {
    await Promise.all([muatUlang(), muatUlangVolume()]);
  }, [muatUlang, muatUlangVolume]);

  const simpan = useCallback(async () => {
    setGalatAksi(null); setPesan(null); setSibuk(true);
    try {
      await api.post(`/api/v1/projects/${projectId}/struktur`, {
        kode: kode.trim(), nama: nama.trim() || undefined, jenis,
        jumlah: Number(jumlah) || 1, input,
      });
      setFormBuka(false); setKode(""); setNama(""); setJumlah("1");
      setPesan(`Elemen ${kode.trim()} ditambahkan.`);
      await segarkan();
    } catch (e) {
      setGalatAksi(e instanceof Error ? e.message : "Gagal menyimpan elemen");
    } finally { setSibuk(false); }
  }, [projectId, kode, nama, jenis, jumlah, input, segarkan]);

  const hitungSemua = useCallback(async () => {
    setGalatAksi(null); setPesan(null); setSibuk(true);
    try {
      const r = await api.post<{ berhasil: number; gagal: { kode: string; alasan: string }[] }>(
        `/api/v1/projects/${projectId}/struktur/hitung-semua`, {});
      /*
        Kegagalan DISEBUT, bukan dilewati.

        "Berhasil 18" tanpa menyebut yang dua membuat orang menyangka semuanya
        beres — dan dua elemen itu tetap tak masuk rekap.
      */
      const gagal = r.data.gagal ?? [];
      setPesan(`${r.data.berhasil} elemen dihitung ulang.`);
      if (gagal.length) {
        setGalatAksi(
          `${gagal.length} elemen gagal: ` +
          gagal.map((g) => `${g.kode} (${g.alasan})`).join("; "),
        );
      }
      await segarkan();
    } catch (e) {
      setGalatAksi(e instanceof Error ? e.message : "Gagal menghitung");
    } finally { setSibuk(false); }
  }, [projectId, segarkan]);

  const hitungSatu = useCallback(async (el: BarisElemen) => {
    setGalatAksi(null); setPesan(null); setSibuk(true);
    try {
      await api.post(`/api/v1/struktur/${el.id}/hitung`, {});
      setPesan(`${el.kode} dihitung ulang.`);
      await segarkan();
    } catch (e) {
      setGalatAksi(e instanceof Error ? e.message : `Gagal menghitung ${el.kode}`);
    } finally { setSibuk(false); }
  }, [segarkan]);

  const hapus = useCallback(async (el: BarisElemen) => {
    setGalatAksi(null); setPesan(null); setSibuk(true);
    try {
      await api.delete(`/api/v1/struktur/${el.id}`);
      setPesan(`${el.kode} dihapus.`);
      await segarkan();
    } catch (e) {
      setGalatAksi(e instanceof Error ? e.message : `Gagal menghapus ${el.kode}`);
    } finally { setSibuk(false); }
  }, [segarkan]);

  const baris = daftar?.data ?? [];
  const rekap = daftar?.rekap;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
      {/*
        JUDUL & KETERANGAN DATANG DARI LAYOUT, bukan dari sini.

        Versi pertama halaman ini memasang `KepalaHalaman` sendiri, dan
        hasilnya terlihat begitu dirender: DUA judul "Analisa Struktur"
        bertumpuk. `uji-judul-halaman-ada` tetap hijau — ia memastikan judul
        ADA, bukan memastikan judulnya tunggal.

        Cacat yang sama persis sudah dicatat `layout.tsx` untuk halaman markup.
        Yang menangkapnya bukan penjaga, melainkan melihat tangkapan layarnya.
      */}

      {/* ── Pemilih proyek ─────────────────────────────────────────────── */}
      <div style={{ ...GAYA_KARTU, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 260 }}>
          <Isian id="pilih-proyek" label="Proyek">
            <PilihanIsian
              id="pilih-proyek"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="">— pilih proyek —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </PilihanIsian>
          </Isian>
        </div>

        {projectId && (
          <>
            <button type="button" style={mati(btnPrimary, sibuk)} disabled={sibuk}
              onClick={() => setFormBuka(true)}>
              <Plus size={14} aria-hidden="true" /> Tambah elemen
            </button>
            <button type="button" style={mati(btnGhost, sibuk || !baris.length)}
              disabled={sibuk || !baris.length}
              onClick={() => void hitungSemua()}>
              <RefreshCw size={14} aria-hidden="true" /> Hitung ulang semua
            </button>
          </>
        )}
      </div>

      {galat && (
        <div role="alert" style={{
          ...GAYA_KARTU, background: C.dangerBg, borderColor: C.dangerBorder,
          color: C.onDangerBg, fontSize: "var(--teks-label)",
        }}>
          {galat}{" "}
          <button type="button" onClick={() => void muatUlang()}
            style={{ ...btnGhost, marginLeft: 8 }}>
            Coba lagi
          </button>
        </div>
      )}

      {galatAksi && (
        <div role="alert" style={{
          ...GAYA_KARTU, background: C.dangerBg, borderColor: C.dangerBorder,
          color: C.onDangerBg, fontSize: "var(--teks-label)",
          display: "flex", justifyContent: "space-between", gap: 12,
        }}>
          <span>{galatAksi}</span>
          <button type="button" onClick={() => setGalatAksi(null)}
            aria-label="Tutup pesan galat"
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {pesan && (
        <div role="status" style={{
          ...GAYA_KARTU, background: C.successBg, borderColor: C.successBorder,
          color: C.onSuccessBg, fontSize: "var(--teks-label)",
        }}>
          {pesan}
        </div>
      )}

      {!projectId ? (
        <LayarKosong
          judul="Pilih proyek dulu"
          apa="Analisa struktur memeriksa kekuatan balok, kolom, pelat, dan pondasi — sekaligus menghitung volume beton, bekisting, dan besinya untuk RAP."
          kenapa="Elemen struktur menempel pada satu proyek, jadi belum ada yang bisa ditampilkan sebelum proyeknya dipilih."
          aksi={{ label: "Lihat daftar proyek", href: "/proyek" }}
          ikon={<Ruler size={28} aria-hidden="true" />}
        />
      ) : memuat ? (
        <div style={{ ...GAYA_KARTU, color: C.mid, fontSize: "var(--teks-label)" }}>
          Memuat elemen struktur…
        </div>
      ) : !baris.length ? (
        <LayarKosong
          judul="Belum ada elemen struktur di proyek ini"
          apa="Tiap elemen (balok B1, kolom K1, pondasi F1) disimpan sekali, lalu dipakai untuk dua hal: memeriksa apakah penampangnya kuat, dan menghitung volume material untuk RAP."
          kenapa="Proyek ini belum punya satu pun elemen. Tambahkan yang pertama — formnya sudah terisi contoh yang lulus analisa, tinggal disesuaikan."
          aksi={{ label: "Tambah elemen pertama", onKlik: () => setFormBuka(true) }}
          ikon={<Boxes size={28} aria-hidden="true" />}
        />
      ) : (
        <>
          {/* ── Ringkasan ────────────────────────────────────────────── */}
          {rekap && (
            <div style={{
              display: "grid", gap: "var(--gap-grid)",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            }}>
              <Ubin judul="Elemen" nilai={formatAngka(rekap.jumlahElemen)} />
              <Ubin judul="Beton" nilai={`${formatAngka(rekap.betonM3, 2)} m³`} />
              <Ubin judul="Bekisting" nilai={`${formatAngka(rekap.bekistingM2, 2)} m²`} />
              <Ubin judul="Besi" nilai={`${formatAngka(rekap.besiKg, 1)} kg`} />
              <Ubin
                judul="Tidak aman"
                nilai={formatAngka(rekap.jumlahTidakAman)}
                nada={rekap.jumlahTidakAman > 0 ? "bahaya" : undefined}
              />
              <Ubin
                judul="Perlu dihitung ulang"
                nilai={formatAngka(rekap.jumlahBasi)}
                nada={rekap.jumlahBasi > 0 ? "ingat" : undefined}
              />
            </div>
          )}

          {/*
            KENAPA ANGKA RINGKASAN BISA BERBEDA DARI JUMLAH BARIS.

            Elemen `basi` sengaja DIKECUALIKAN dari total. Tanpa kalimat ini,
            orang yang menjumlahkan kolom sendiri akan menemukan selisih dan
            menyimpulkan aplikasinya salah hitung.
          */}
          {rekap && rekap.jumlahBasi > 0 && (
            <div role="note" style={{
              ...GAYA_KARTU, background: C.warningBg, borderColor: C.warningBorder,
              color: C.onWarningBg, fontSize: "var(--teks-label)",
              display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <AlertTriangle size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>{rekap.jumlahBasi} elemen belum dihitung ulang</strong> sesudah
                inputnya berubah, jadi <strong>tidak ikut</strong> dalam total di atas.
                Tekan “Hitung ulang semua” supaya angkanya lengkap.
              </span>
            </div>
          )}

          {/* ── Daftar elemen ────────────────────────────────────────── */}
          <div style={GAYA_KARTU}>
            <Tabel<BarisElemen>
              caption="Daftar elemen struktur beserta volume material dan status pemeriksaannya"
              data={baris}
              kunciBaris={(el) => el.id}
              /*
                Baris yang menuntut tindakan DITANDAI, bukan hanya diberi lencana
                di kolom status. Daftar 40 elemen dibaca dengan menyapu mata dari
                atas ke bawah; lencana selebar 90px di kolom ketujuh terlewat.
              */
              tandaiBaris={(el) =>
                el.aman === false ? C.dangerBg : el.basi ? C.warningBg : undefined}
              kolom={[
                {
                  kunci: "kode", judul: "Kode", kepalaBaris: true,
                  render: (el) => (
                    <span>
                      <strong>{el.kode}</strong>
                      {el.nama && (
                        <span style={{ color: C.mid, marginLeft: 6 }}>{el.nama}</span>
                      )}
                    </span>
                  ),
                },
                { kunci: "jenis", judul: "Jenis", render: (el) => NAMA_JENIS[el.jenis] ?? el.jenis },
                { kunci: "jumlah", judul: "Jml", rata: "kanan", render: (el) => formatAngka(el.jumlah) },
                {
                  kunci: "beton", judul: "Beton (m³)", rata: "kanan",
                  render: (el) => (el.basi ? "—" : formatAngka(NUM(el.beton_m3), 3)),
                },
                {
                  kunci: "bekisting", judul: "Bekisting (m²)", rata: "kanan",
                  render: (el) => (el.basi ? "—" : formatAngka(NUM(el.bekisting_m2), 2)),
                },
                {
                  kunci: "besi", judul: "Besi (kg)", rata: "kanan",
                  render: (el) => (el.basi ? "—" : formatAngka(NUM(el.besi_kg), 1)),
                },
                { kunci: "status", judul: "Status", render: (el) => <Status el={el} /> },
                {
                  kunci: "aksi", judul: "Tindakan", rata: "kanan",
                  render: (el) => (
                    <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button type="button" style={mati(btnGhost, sibuk)} disabled={sibuk}
                        onClick={() => void hitungSatu(el)}
                        aria-label={`Hitung ulang ${el.kode}`}>
                        <RefreshCw size={13} aria-hidden="true" />
                      </button>
                      <button type="button" style={mati(btnGhost, sibuk)} disabled={sibuk}
                        onClick={() => void hapus(el)}
                        aria-label={`Hapus ${el.kode}`}>
                        <Trash2 size={13} aria-hidden="true" />
                      </button>
                    </span>
                  ),
                },
              ]}
            />
          </div>

          {/* ── Rekap besi per diameter + batasnya ───────────────────── */}
          {volume && volume.rekap.besi.length > 0 && (
            <div style={GAYA_KARTU}>
              <h2 style={{
                fontSize: "var(--teks-badan)", fontWeight: 600,
                color: C.text, margin: "0 0 8px",
              }}>
                Kebutuhan besi per diameter
              </h2>
              <p style={{ fontSize: "var(--teks-delta)", color: C.mid, margin: "0 0 10px" }}>
                Inilah satuan yang dipesan — total kilogram saja tak bisa
                dibelanjakan karena tiap diameter berbeda harganya.
              </p>

              {/*
                ══════════════════════════════════════════════════════════════
                DUA ANGKA BERBEDA DI SATU LAYAR — dan itu memang benar.

                Ubin "Besi" di atas membaca kolom RINGKASAN dan MENGECUALIKAN
                elemen basi. Tabel ini DIHITUNG ULANG dari input, jadi elemen
                basi IKUT. Keduanya benar menurut definisinya sendiri.

                Tanpa kalimat ini, pembaca melihat 90,5 kg di ubin dan 125,2 kg
                di tabel untuk proyek yang sama, lalu menyimpulkan salah satu
                salah hitung — cacat yang terlihat begitu halaman ini dirender
                dengan satu elemen basi, bukan dari test mana pun.

                Yang ditampilkan cuma saat bedanya BENAR-BENAR ada: kalimat
                permanen tentang selisih yang tak terjadi hanya jadi bising.
                ══════════════════════════════════════════════════════════════
              */}
              {rekap && rekap.jumlahBasi > 0 && (
                <p role="note" style={{
                  fontSize: "var(--teks-delta)", color: C.onWarningBg,
                  background: C.warningBg, border: `1px solid ${C.warningBorder}`,
                  borderRadius: "var(--radius-dense)",
                  padding: "var(--pad-kartu)", margin: "0 0 10px",
                }}>
                  Tabel ini <strong>dihitung ulang dari input</strong>, jadi{" "}
                  {rekap.jumlahBasi} elemen yang belum dihitung ulang <strong>ikut</strong>{" "}
                  di sini — sementara ubin “Besi” di atas mengecualikannya. Itu
                  sebabnya kedua angka berbeda. Tekan “Hitung ulang semua” supaya
                  keduanya bertemu.
                </p>
              )}
              <Tabel<BarisBesi>
                caption="Kebutuhan besi tulangan dirinci per diameter dan perannya"
                data={volume.rekap.besi}
                kunciBaris={(b) => `${b.tipe}-${b.diameterMm}-${b.peran}`}
                total={[
                  { kunci: "jenis", isi: "Total", rentang: 4 },
                  {
                    kunci: "berat", rata: "kanan",
                    isi: formatAngka(volume.rekap.besiTotalKg, 1),
                  },
                ]}
                kolom={[
                  {
                    kunci: "jenis", judul: "Jenis", kepalaBaris: true,
                    render: (b) => (b.tipe === "BjTS" ? "Ulir (BjTS)" : "Polos (BjTP)"),
                  },
                  {
                    kunci: "diameter", judul: "Diameter",
                    render: (b) => `${b.tipe === "BjTS" ? "D" : "Ø"}${b.diameterMm}`,
                  },
                  { kunci: "peran", judul: "Peran", render: (b) => b.peran },
                  {
                    kunci: "batang", judul: "Batang", rata: "kanan",
                    render: (b) => formatAngka(b.jumlahBatang),
                  },
                  {
                    kunci: "berat", judul: "Berat (kg)", rata: "kanan",
                    render: (b) => formatAngka(b.totalKg, 1),
                  },
                ]}
              />

              {/*
                CATATAN BATAS TIDAK DILIPAT.

                Volume besi belum termasuk penyaluran, kait, lewatan, dan stek
                kolom. Diukur: BBS memberi 1,26× (terpasang) sampai 1,41×
                (dibeli) dari angka ini pada balok 300×520 L=6m; stek kolom
                pada fondasi 2×2 sekitar 28% tulangan fondasi.

                Menyembunyikannya di balik "lihat detail" berarti sebagian
                besar orang memesan besi tanpa pernah membacanya.
              */}
              {volume.catatan.length > 0 && (
                <div role="note" style={{
                  marginTop: 12, padding: "var(--pad-kartu)",
                  background: C.infoBg, border: `1px solid ${C.infoBorder}`,
                  borderRadius: "var(--radius-dense)",
                  color: C.onInfoBg, fontSize: "var(--teks-delta)",
                }}>
                  <strong style={{
                    display: "flex", gap: 6, alignItems: "center", marginBottom: 6,
                  }}>
                    <Info size={14} aria-hidden="true" />
                    Yang BELUM termasuk dalam angka di atas
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                    {volume.catatan.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}

              {volume.gagal.length > 0 && (
                <div role="alert" style={{
                  marginTop: 10, padding: "var(--pad-kartu)",
                  background: C.dangerBg, border: `1px solid ${C.dangerBorder}`,
                  borderRadius: "var(--radius-dense)",
                  color: C.onDangerBg, fontSize: "var(--teks-delta)",
                }}>
                  <strong>{volume.gagal.length} elemen tak bisa dihitung</strong> dan
                  tidak masuk rekap:{" "}
                  {volume.gagal.map((g) => `${g.kode} (${g.alasan})`).join("; ")}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Form tambah elemen ──────────────────────────────────────── */}
      {formBuka && (
        <Modal title="Tambah elemen struktur" onClose={() => setFormBuka(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <Isian id="f-jenis" label="Jenis elemen" wajib>
                <PilihanIsian id="f-jenis" value={jenis} style={{ width: "100%" }}
                  onChange={(e) => gantiJenis(e.target.value as Jenis)}>
                  {(Object.keys(NAMA_JENIS) as Jenis[]).map((j) => (
                    <option key={j} value={j}>{NAMA_JENIS[j]}</option>
                  ))}
                </PilihanIsian>
              </Isian>
              <Isian id="f-kode" label="Kode elemen" wajib
                bantuan="Nama pendek yang dipakai di gambar kerja — B1, K2, F3.">
                <KotakIsian id="f-kode" value={kode} placeholder="B1"
                  style={{ width: "100%" }}
                  onChange={(e) => setKode(e.target.value)} />
              </Isian>
              <Isian id="f-nama" label="Nama (opsional)">
                <KotakIsian id="f-nama" value={nama} placeholder="Balok induk lantai 2"
                  style={{ width: "100%" }}
                  onChange={(e) => setNama(e.target.value)} />
              </Isian>
              <Isian id="f-jumlah" label="Jumlah elemen identik"
                bantuan="Volume dikalikan angka ini.">
                <KotakIsian id="f-jumlah" type="number" min={1} value={jumlah}
                  style={{ width: "100%" }}
                  onChange={(e) => setJumlah(e.target.value)} />
              </Isian>
            </div>

            <p style={{ fontSize: "var(--teks-delta)", color: C.mid, margin: 0 }}>
              Angka di bawah sudah terisi contoh yang <strong>lulus analisa</strong> —
              ubah seperlunya. Satuan tertulis di tiap label.
            </p>

            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              {MEDAN[jenis].map((m) => (
                <Isian key={m.kunci} id={`f-${m.kunci}`}
                  label={m.satuan ? `${m.label} (${m.satuan})` : m.label}>
                  <KotakIsian
                    id={`f-${m.kunci}`}
                    type="number"
                    step="any"
                    value={bacaMedan(input, m.kunci)}
                    style={{ width: "100%" }}
                    onChange={(e) => setInput(tulisMedan(input, m.kunci, e.target.value))}
                  />
                </Isian>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" style={btnGhost} onClick={() => setFormBuka(false)}>
                Batal
              </button>
              <button type="button" style={mati(btnPrimary, sibuk || !kode.trim())}
                disabled={sibuk || !kode.trim()}
                onClick={() => void simpan()}>
                {sibuk ? "Menyimpan…" : "Simpan & hitung"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Satu ubin ringkasan. */
function Ubin({ judul, nilai, nada }: {
  judul: string; nilai: string; nada?: "bahaya" | "ingat";
}) {
  const warna = nada === "bahaya" ? C.danger : nada === "ingat" ? C.warning : C.text;
  return (
    <div style={GAYA_KARTU}>
      <div style={{ fontSize: "var(--teks-delta)", color: C.mid, marginBottom: 4 }}>
        {judul}
      </div>
      <div style={{ fontSize: "var(--teks-kpi)", fontWeight: 700, color: warna }}>
        {nilai}
      </div>
    </div>
  );
}

/**
 * Status satu elemen.
 *
 * Tiga keadaan yang harus dibedakan — dan yang paling sering disamakan adalah
 * dua yang pertama:
 *
 *   BASI          ringkasan lama, TIDAK ikut rekap
 *   BELUM DIHITUNG belum pernah dijalankan
 *   AMAN / TIDAK   verdict struktural
 *
 * `basi` menang atas yang lain: elemen basi yang dulunya "aman" bukan lagi
 * pernyataan yang berlaku, dan menampilkan centang hijau di sebelah angka
 * yang tak ikut dijumlahkan adalah pesan yang saling bertentangan.
 */
function Status({ el }: { el: BarisElemen }) {
  const gaya: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 8px", borderRadius: 999,
    fontSize: "var(--teks-delta)", fontWeight: 600,
  };

  if (el.basi) {
    return (
      <span style={{ ...gaya, background: C.warningBg, color: C.onWarningBg }}>
        <AlertTriangle size={12} aria-hidden="true" />
        {el.dihitung_pada ? "Perlu hitung ulang" : "Belum dihitung"}
      </span>
    );
  }
  if (el.aman === false) {
    return (
      <span style={{ ...gaya, background: C.dangerBg, color: C.onDangerBg }}>
        <AlertTriangle size={12} aria-hidden="true" /> Tidak aman
      </span>
    );
  }
  return (
    <span style={{ ...gaya, background: C.successBg, color: C.onSuccessBg }}>
      <CheckCircle2 size={12} aria-hidden="true" /> Aman
    </span>
  );
}

export default function HalamanStruktur() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: C.mid }}>Memuat…</div>}>
      <StrukturLayar />
    </Suspense>
  );
}
