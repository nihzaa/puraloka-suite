"use client";

/**
 * REKOMENDASI PEMBESIAN — dari dimensi & beban ke usulan tulangan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU-SATUNYA LAYAR STRUKTUR YANG ARAHNYA TERBALIK
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Halaman Analisa Struktur (`/estimasi/struktur`) menuntut tulangan sebagai
 * MASUKAN: isi Ø16, 3 batang, sengkang Ø8-150, lalu ia menjawab aman/tidak.
 * Itu berguna bagi yang sudah punya jawabannya.
 *
 * Layar ini untuk yang belum. Ia menanyakan dimensi dan beban, lalu
 * MENGUSULKAN tulangannya — pertanyaan yang sebenarnya lebih sering
 * ditanyakan di lapangan: "balok 25/40 bentang 4 m besinya berapa?"
 *
 * ── Kenapa halaman SENDIRI, bukan tab di halaman struktur
 *
 * `ARAH-VISUAL-2026.md` §10 nomor 3: tab dipecah jadi halaman — sudah
 * diratifikasi dan sudah dikerjakan untuk keuangan, mandor, dan kas.
 * Halaman struktur sendiri sudah 3.216 baris dengan 34 jenis elemen; satu
 * tab lagi di sana berarti pemakai harus tahu dulu ia mau apa sebelum bisa
 * bertanya. Layar ini justru untuk orang yang belum tahu.
 *
 * ── Kenapa `catatan` TIDAK bisa disembunyikan
 *
 * Di dalamnya ada batas yang menentukan sah-tidaknya angka ini dipakai
 * (tulangan tarik saja, tanpa torsi & lendutan, berat belum termasuk
 * penyaluran). Usulan tanpa batasnya adalah angka yang terlihat lebih pasti
 * daripada yang sebenarnya — dan angka yang terlihat pasti akan disalin ke
 * gambar kerja tanpa ditanya lagi.
 *
 * ── Kenapa kegagalan TIDAK ditampilkan sebagai galat merah biasa
 *
 * "Tak ada kombinasi yang cukup" bukan kerusakan aplikasi, melainkan JAWABAN:
 * penampangnya memang kurang. Menampilkannya seperti galat sistem membuat
 * pemakai mengira aplikasinya rusak lalu mengulang-ulang masukan yang sama.
 * Karena itu ia tampil sebagai hasil — lengkap dengan usul tinggi minimum,
 * yang justru informasi paling berguna di layar ini.
 *
 * ── Satu aksen (§3d)
 *
 * Yang menonjol hanya kartu usulan terpilih. Alternatif dan catatan memakai
 * nada tenang: layar yang seluruhnya berteriak tak menunjukkan apa pun.
 */

import { useCallback, useMemo, useState } from "react";
import { TriangleAlert, Info, Lightbulb, ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Kartu, JudulKartu, Rangka, Galat,
  Tombol, Lencana, Medan, gayaInput,
} from "@/components/dasar";

// ── Bentuk jawaban rute ──────────────────────────────────────────────────────

interface UsulanBalok {
  dUtamaMm: number; nTarik: number;
  dSengkangMm: number; jarakSengkangMm: number;
  besiKg: number; rasioKritis: number; pemeriksaanKritis: string;
}
interface UsulanKolom {
  dUtamaMm: number; nBarisX: number; nBarisY: number; nTotal: number;
  dSengkangMm: number; jarakSengkangMm: number;
  besiKg: number; rasioKritis: number; pemeriksaanKritis: string;
}
type Usulan = Partial<UsulanBalok & UsulanKolom>;

interface HasilBeban {
  muKnm: number; vuKn: number; quKnM: number;
  qMatiKnM: number; qHidupKnM: number;
  rincianMati: Array<{ nama: string; knM: number }>;
  pembagiMomen: number; skema: string;
}

interface HasilSaran {
  jenis: "balok" | "kolom";
  /** Hanya terisi pada mode "dari beban". */
  beban?: HasilBeban;
  berhasil: boolean;
  terpilih?: Usulan;
  alternatif: Usulan[];
  usulTinggiMm?: number;
  kandidatDicoba: number;
  catatan: string[];
}

type Jenis = "balok" | "kolom";

/**
 * Tiga cara memberi beban, dan ketiganya sah — satu tangga ketelitian untuk
 * satu pertanyaan yang sama ("besinya berapa?").
 *
 * `angka` — pemakai sudah punya Mu/Vu (dari ETABS, dari hitungan tangan).
 * Membuang mode ini akan menutup pintu bagi pengguna yang paling teliti.
 *
 * `beban` — Mu/Vu dihitung dari bentang + fungsi ruang + lapis mati. Ini yang
 * menjawab pertanyaan lapangan yang sebenarnya: "balok 25/40 bentang 4 m
 * besinya berapa?" — orang yang bertanya begitu justru TIDAK punya momennya.
 *
 * `rangka` — Mu/Vu/Pu datang dari solver kekakuan langsung atas SATU PORTAL
 * UTUH. Bedanya dengan `beban` bukan sekadar ketelitian: yang diusulkan bukan
 * satu balok melainkan SELURUH batang portal (kolom dan balok sekaligus),
 * karena solver memang menyelesaikan semuanya dalam satu langkah.
 */
type Mode = "angka" | "beban" | "rangka";

// ── Bentuk jawaban rute analisa-rangka ───────────────────────────────────────

interface SaranBatang {
  nama: string;
  jenis: Jenis;
  muKnm: number;
  vuKn: number;
  puKn: number;
  saran: {
    berhasil: boolean;
    terpilih?: Usulan;
    alternatif: Usulan[];
    usulTinggiMm?: number;
    kandidatDicoba: number;
    catatan: string[];
  };
}

/**
 * Reaksi di satu kaki portal, sumbu global — APA ADANYA dari solver.
 *
 * Angka-angka ini TIDAK diolah di layar selain dibulatkan untuk dibaca.
 * Pembulatan tampilan tak boleh naik ke penjumlahan: Σ dihitung dari nilai
 * ASLI, baru hasilnya dibulatkan. Menjumlahkan angka yang sudah dibulatkan
 * membuat baris JUMLAH berbeda dari jumlah kolom di atasnya — selisih yang
 * terlihat seperti cacat solver padahal cacat layar.
 */
interface ReaksiTumpuan {
  simpul: number;
  nama: string;
  fxKn: number;
  fyKn: number;
  mKnm: number;
}

interface HasilRangka {
  batang: SaranBatang[];
  /**
   * Hasil solver UTUH — `reaksi` ADA DI DALAM SINI, bukan di akar jawaban.
   *
   * ⚠ Rute memulangkan `{ batang, rangka, catatan }`, dan `rangka` itulah
   * `HasilPortal` dari API. Versi pertama kartu di bawah membaca
   * `hasilRangka.reaksi` (satu tingkat terlalu tinggi) — `tsc` HIJAU karena
   * tipenya ikut salah, dan kartunya diam-diam TIDAK PERNAH DIRENDER:
   * `undefined && …` bernilai falsy, jadi React tak menggambar apa pun dan
   * tak ada satu pun galat. Ketahuan hanya karena layarnya DIPOTRET.
   */
  rangka: {
    reaksi: ReaksiTumpuan[];
  };
  /*
    `gambar` HILANG dari JSON saat rute dipanggil dengan `gambar: false` —
    kuncinya tak ada sama sekali, bukan bernilai null. Karena itu pembacanya
    WAJIB `if (hasil.gambar)`, bukan `!== null`: yang kedua lolos untuk
    `undefined` lalu meledak saat diindeks.
  */
  gambar?: Record<string, string>;
  catatan: string[];
}

/** Nilai awal mode rangka — portal satu lantai 6 m, dimensi lazim rumah dua lantai. */
const AWAL_RANGKA = {
  bentangM: "6", tinggiM: "3.5", jumlahLantai: "1",
  balokB: "300", balokH: "500", kolomB: "400", kolomH: "400",
  qKnM: "20",
};

const MEDAN_RANGKA: Array<{ k: string; l: string; s: string; ket?: string }> = [
  { k: "bentangM", l: "Bentang antar-kolom", s: "m" },
  { k: "tinggiM", l: "Tinggi tiap lantai", s: "m" },
  { k: "jumlahLantai", l: "Jumlah lantai", s: "lantai" },
  { k: "balokB", l: "Balok — lebar b", s: "mm" },
  { k: "balokH", l: "Balok — tinggi h", s: "mm" },
  { k: "kolomB", l: "Kolom — sisi b", s: "mm" },
  { k: "kolomH", l: "Kolom — sisi h", s: "mm" },
  /*
    Label sengaja PENDEK — "Beban merata terfaktor qu" membungkus jadi dua
    baris di kisi ini, dan medan yang labelnya dua baris turun sendirian
    sementara tetangganya tetap di atas: barisnya jadi terlihat rusak. Kata
    "terfaktor" pindah ke keterangan, tempat yang justru lebih terbaca karena
    di sana ia bisa menyebut kombinasinya sekalian.
  */
  {
    k: "qKnM", l: "Beban merata qu", s: "kN/m",
    ket: "Sudah terfaktor — mis. 1,2D + 1,6L",
  },
];

interface Katalog {
  fungsiRuang: Array<{ kunci: string; nama: string; bebanHidupKnM2: number; kelompok: string }>;
  lapisMati: Array<{ kunci: string; nama: string; knM2: number; kelompok: string }>;
  jenisDinding: Array<{ kunci: string; nama: string; knM2: number }>;
}

/** Nilai awal mode beban — balok hunian 5 m yang lazim. */
const AWAL_BEBAN = {
  bentangM: "5", lebarPikulM: "3", tebalPelatMm: "120",
  fungsiRuangKunci: "hunian", jenisDinding: "", tinggiDindingM: "3",
  skema: "menerus-tengah",
};

const SKEMA: Array<{ nilai: string; label: string }> = [
  { nilai: "sederhana", label: "Sederhana (dua tumpuan)" },
  { nilai: "menerus-tepi", label: "Menerus — bentang tepi" },
  { nilai: "menerus-tengah", label: "Menerus — bentang tengah" },
  { nilai: "kantilever", label: "Kantilever" },
];

/** Nilai awal — balok 300×520 L=6m, dimensi contoh yang dipakai di repo. */
const AWAL_BALOK = {
  bMm: "300", hMm: "520", panjangM: "6", selimutMm: "30",
  fcMpa: "25", fyMpa: "420", fyvMpa: "280",
  muKnm: "120", vuKn: "90", puKn: "", tinggiM: "",
};
const AWAL_KOLOM = {
  bMm: "400", hMm: "400", tinggiM: "3.5", selimutMm: "40",
  fcMpa: "25", fyMpa: "420", fyvMpa: "280",
  puKn: "900", muKnm: "60", vuKn: "", panjangM: "",
};

/**
 * Tulis usulan sebagaimana dibaca orang lapangan.
 *
 * Balok: "6D13" · Kolom: "8D16 (2×4)" — bentuk yang sama dengan yang ditulis
 * di gambar kerja, supaya tak perlu diterjemahkan lagi saat disalin.
 */
function tulisUsulan(u: Usulan, jenis: Jenis): string {
  if (jenis === "balok") return `${u.nTarik}D${u.dUtamaMm}`;
  return `${u.nTotal}D${u.dUtamaMm} (${u.nBarisX}×${u.nBarisY})`;
}

const tulisSengkang = (u: Usulan) => `Ø${u.dSengkangMm}-${u.jarakSengkangMm}`;

/**
 * Nada lencana rasio: hijau lega, kuning mepet.
 *
 * Ambangnya 0.90 — sama dengan `BATAS_RASIO_NYAMAN` di mesinnya. Kalau layar
 * memakai ambang sendiri, ia bisa menghijaukan usulan yang mesinnya sendiri
 * tandai bercadangan tipis.
 */
const BATAS_NYAMAN = 0.9;

export default function PembesianPage() {
  const [jenis, setJenis] = useState<Jenis>("balok");
  const [mode, setMode] = useState<Mode>("angka");
  const [fb, setFb] = useState<Record<string, string>>(AWAL_BEBAN);
  const [lapis, setLapis] = useState<string[]>(["keramik-spesi"]);
  const [fr, setFr] = useState<Record<string, string>>(AWAL_RANGKA);
  const [f, setF] = useState<Record<string, string>>(AWAL_BALOK);
  const [hasil, setHasil] = useState<HasilSaran | null>(null);
  const [hasilRangka, setHasilRangka] = useState<HasilRangka | null>(null);

  /*
    Portal yang BENAR-BENAR dikirim ke solver, dibekukan saat tombol Hitung
    ditekan.

    ⚠ Pemeriksaan ΣFy = q×L WAJIB memakai angka ini, BUKAN `fr` (isi form).
    Form bisa disunting sesudah hasilnya tampil; pembanding yang dibaca dari
    form membuat baris pemeriksaan berubah jadi MERAH tanpa satu pun angka
    hasil berubah — dan pemakainya lalu menuduh solvernya salah. Kelas cacat
    yang sama dengan angka tampil ≠ angka hitung (pelajaran 5b43d275), hanya
    sumbernya waktu, bukan pembulatan.
  */
  const [portalDipakai, setPortalDipakai] =
    useState<{ qKnM: number; bentangM: number } | null>(null);
  const [memuat, setMemuat] = useState(false);

  /*
    Dua state galat yang TERPISAH — dijaga `uji-galat-muat-terpisah.mjs`.
    Galat aksi (gagal menghitung) tak boleh menghapus hasil yang sudah
    tampil; pemakai yang kehilangan hasilnya karena satu percobaan gagal
    akan mengira pekerjaannya hilang.
  */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);

  /*
    Katalog datang dari SATU tempat — konstanta di `struktur-katalog-beban.ts`,
    lewat rute yang sudah ada. Menyalinnya ke layar akan membuat daftarnya
    berpisah dari kodenya saat salah satu dikoreksi, dan memilih beban hidup
    yang salah adalah kesalahan termahal di form ini: selisih hunian 1,92 vs
    ruang rapat 4,79 kN/m2 lebih dari dua kali lipat.
  */
  const { data: katalog } = useData<Katalog>("/api/v1/struktur/katalog-beban");

  const gantiJenis = useCallback((j: Jenis) => {
    setJenis(j);
    setF(j === "balok" ? AWAL_BALOK : AWAL_KOLOM);
    // Kolom belum punya jalur beban (aksial datang dari tributari, bentuk
    // masukan yang lain sama sekali) — rutenya menolak, jadi layar tak boleh
    // membiarkan keadaan itu terbentuk.
    if (j === "kolom") setMode("angka");
    setHasil(null);
    setHasilRangka(null);
    setPortalDipakai(null);
    setGalatAksi(null);
  }, []);

  /**
   * Ganti mode, dan bereskan keadaan yang tak boleh ikut terbawa.
   *
   * Mode `rangka` mengusulkan KOLOM DAN BALOK sekaligus — saklar jenis tak
   * punya arti di sana, jadi ia disembunyikan. Tapi menyembunyikannya saja
   * tak cukup: jenis yang tertinggal di `kolom` akan kembali muncul begitu
   * pemakai pindah ke mode lain, dan medan masukannya ikut berganti tanpa ia
   * meminta. Karena itu jenis dipaksa ke `balok` — sekalian menyamakan medan
   * dimensi yang tampil dengan yang benar-benar dipakai.
   */
  const gantiMode = useCallback((m: Mode) => {
    setMode(m);
    if (m === "rangka" ) {
      setJenis("balok");
      setF(AWAL_BALOK);
    }
    setHasil(null);
    setHasilRangka(null);
    setPortalDipakai(null);
    setGalatAksi(null);
  }, []);

  const ubah = useCallback((k: string, v: string) => {
    setF((s) => ({ ...s, [k]: v }));
  }, []);

  const ubahRangka = useCallback((k: string, v: string) => {
    setFr((s) => ({ ...s, [k]: v }));
  }, []);

  const hitung = useCallback(async () => {
    setMemuat(true);
    setGalatAksi(null);
    try {
      const mutu = { fcMpa: +f.fcMpa, fyMpa: +f.fyMpa, fyvMpa: +f.fyvMpa };

      /*
        Mode rangka memanggil rute LAIN, dan bentuk jawabannya juga lain
        (banyak batang, bukan satu elemen). Karena itu ia berhenti di sini
        alih-alih ikut merakit `badan` di bawah — memaksa dua bentuk jawaban
        yang berbeda lewat satu state akan membuat sisa hasil mode sebelumnya
        tampil di bawah judul mode yang baru.
      */
      if (mode === "rangka") {
        /*
          Dibaca SEKALI ke variabel lokal, lalu dipakai untuk kirim DAN untuk
          dibekukan sebagai pembanding. Membaca `fr` dua kali membuka celah
          nilai yang berbeda di antara keduanya.
        */
        const qKnM = +fr.qKnM;
        const bentangM = +fr.bentangM;
        const { data } = await api.post<HasilRangka>(
          "/api/v1/struktur/analisa-rangka",
          {
            portal: {
              bentangM,
              tinggiM: +fr.tinggiM,
              jumlahLantai: +fr.jumlahLantai,
              balok: { bMm: +fr.balokB, hMm: +fr.balokH },
              kolom: { bMm: +fr.kolomB, hMm: +fr.kolomH },
              fcMpa: +f.fcMpa,
              qKnM,
            },
            selimutMm: +f.selimutMm,
            mutu,
          },
        );
        setHasil(null);
        setHasilRangka(data);
        setPortalDipakai({ qKnM, bentangM });
        return;
      }

      const badan = jenis === "balok" && mode === "beban"
        ? {
          jenis, bMm: +f.bMm, hMm: +f.hMm, panjangM: +fb.bentangM,
          selimutMm: +f.selimutMm, mutu,
          beban: {
            bentangM: +fb.bentangM,
            lebarPikulM: +fb.lebarPikulM,
            tebalPelatMm: +fb.tebalPelatMm,
            /* Daftar KOSONG tetap dikirim: modul beban memperlakukan daftar
               yang HILANG sebagai kesalahan, bukan nol. */
            lapisMati: lapis,
            fungsiRuangKunci: fb.fungsiRuangKunci,
            ...(fb.jenisDinding
              ? { jenisDinding: fb.jenisDinding, tinggiDindingM: +fb.tinggiDindingM }
              : {}),
            skema: fb.skema,
          },
        }
        : jenis === "balok"
        ? {
          jenis, bMm: +f.bMm, hMm: +f.hMm, panjangM: +f.panjangM,
          selimutMm: +f.selimutMm, muKnm: +f.muKnm, vuKn: +f.vuKn,
          mutu,
        }
        : {
          jenis, bMm: +f.bMm, hMm: +f.hMm, tinggiM: +f.tinggiM,
          selimutMm: +f.selimutMm, puKn: +f.puKn, muKnm: +f.muKnm, mutu,
        };
      const { data } = await api.post<HasilSaran>(
        "/api/v1/struktur/saran-pembesian", badan,
      );
      setHasilRangka(null);
    setPortalDipakai(null);
      setHasil(data);
    } catch (e) {
      const pesan = (e as { response?: { data?: { error?: string } } })
        .response?.data?.error;
      setGalatAksi(pesan ?? "Gagal menghitung usulan. Periksa isian lalu coba lagi.");
    } finally {
      setMemuat(false);
    }
  }, [jenis, f, mode, fb, fr, lapis]);

  const medan = useMemo(() => mode === "rangka"
    /* Dimensi balok DAN kolom pindah ke kartu portal — mengulanginya di sini
       membuat dua tempat mengaku sebagai sumber penampang yang sama. */
    ? [{ k: "selimutMm", l: "Selimut beton", s: "mm" }]
    : jenis === "balok"
    ? (mode === "beban"
      /* Mu/Vu dan bentang pindah ke kartu beban — mengulanginya di sini
         membuat dua tempat mengaku sebagai sumber angka yang sama. */
      ? [
        { k: "bMm", l: "Lebar b", s: "mm" },
        { k: "hMm", l: "Tinggi h", s: "mm" },
        { k: "selimutMm", l: "Selimut beton", s: "mm" },
      ]
      : [
        { k: "bMm", l: "Lebar b", s: "mm" },
        { k: "hMm", l: "Tinggi h", s: "mm" },
        { k: "panjangM", l: "Bentang", s: "m" },
        { k: "selimutMm", l: "Selimut beton", s: "mm" },
        { k: "muKnm", l: "Momen terfaktor Mu", s: "kNm" },
        { k: "vuKn", l: "Geser terfaktor Vu", s: "kN" },
      ])
    : [
      { k: "bMm", l: "Sisi b", s: "mm" },
      { k: "hMm", l: "Sisi h", s: "mm" },
      { k: "tinggiM", l: "Tinggi kolom", s: "m" },
      { k: "selimutMm", l: "Selimut beton", s: "mm" },
      { k: "puKn", l: "Aksial terfaktor Pu", s: "kN" },
      { k: "muKnm", l: "Momen terfaktor Mu", s: "kNm" },
    ], [jenis, mode]);

  const t = hasil?.terpilih;

  return (
    <>
      {/*
        ── Pilihan jenis elemen — TERSEMBUNYI di mode rangka.

        Solver mengusulkan kolom DAN balok dalam satu langkah, jadi "pilih
        balok atau kolom" bukan pertanyaan yang punya jawaban di sana.
        Membiarkannya tampil membuat pemakai mengira usulannya cuma untuk satu
        jenis — padahal kartu hasilnya memuat keduanya.
      */}
      {mode !== "rangka" && (
      <Kartu>
        <JudulKartu>Jenis elemen</JudulKartu>
        <div role="group" aria-label="Jenis elemen" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["balok", "kolom"] as Jenis[]).map((j) => (
            <button
              key={j}
              type="button"
              onClick={() => gantiJenis(j)}
              aria-pressed={jenis === j}
              style={{
                padding: "var(--pad-tombol)",
                borderRadius: "var(--rad-sedang)",
                border: `1px solid ${jenis === j ? C.navy : C.border}`,
                background: jenis === j ? C.navy : "transparent",
                color: jenis === j ? "var(--on-navy)" : C.mid,
                fontWeight: 600, cursor: "pointer", textTransform: "capitalize",
                transition: "background var(--gerak-cepat) var(--gerak-kurva)",
              }}
            >
              {j}
            </button>
          ))}
        </div>
      </Kartu>
      )}

      {/* ── Saklar mode (balok saja) */}
      {jenis === "balok" && (
        <Kartu>
          <JudulKartu>Dari mana momennya?</JudulKartu>
          <div role="group" aria-label="Cara memberi beban"
            style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([
              ["angka", "Saya punya Mu & Vu"],
              ["beban", "Hitungkan dari beban"],
              ["rangka", "Analisa rangka"],
            ] as Array<[Mode, string]>).map(([m, label]) => (
              <button key={m} type="button"
                onClick={() => gantiMode(m)}
                aria-pressed={mode === m}
                style={{
                  padding: "var(--pad-tombol)", borderRadius: "var(--rad-sedang)",
                  border: `1px solid ${mode === m ? C.navy : C.border}`,
                  background: mode === m ? C.navy : "transparent",
                  color: mode === m ? "var(--on-navy)" : C.mid,
                  fontWeight: 600, cursor: "pointer",
                  transition: "background var(--gerak-cepat) var(--gerak-kurva)",
                }}>
                {label}
              </button>
            ))}
          </div>
          <p style={{ margin: "8px 0 0", color: C.muted, fontSize: "var(--teks-label)", lineHeight: 1.6 }}>
            {mode === "rangka"
              ? "Portal utuh diselesaikan dengan metode kekakuan langsung — kolom dan balok dapat usulannya masing-masing, berikut diagram momen, geser, dan lendutan tiap batang."
              : mode === "beban"
              ? "Momen dan geser dihitung dari beban memakai koefisien perkiraan SNI — ditampilkan lebih dulu sebelum jadi usulan."
              : "Untuk yang momennya sudah dihitung sendiri atau datang dari software analisa."}
          </p>
        </Kartu>
      )}

      {/* ── Masukan */}
      <Kartu>
        <JudulKartu>Dimensi &amp; beban</JudulKartu>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--gap-grid)",
        }}>
          {medan.map(({ k, l, s }) => (
            <Medan
              key={k}
              id={`medan-${k}`}
              label={`${l} (${s})`}
              wajib
              anak={
                <input
                  id={`medan-${k}`}
                  type="number"
                  inputMode="decimal"
                  value={f[k] ?? ""}
                  onChange={(e) => ubah(k, e.target.value)}
                  style={gayaInput}
                />
              }
            />
          ))}
          <Medan
            id="medan-fcMpa"
            label="Mutu beton f'c (MPa)"
            wajib
            keterangan="K300 ≈ 25 MPa"
            anak={
              <input
                id="medan-fcMpa" type="number" inputMode="decimal"
                value={f.fcMpa} onChange={(e) => ubah("fcMpa", e.target.value)}
                style={gayaInput}
              />
            }
          />
          <Medan
            id="medan-fyMpa"
            label="Mutu baja fy (MPa)"
            wajib
            keterangan="BjTS 420 untuk tulangan ulir"
            anak={
              <input
                id="medan-fyMpa" type="number" inputMode="decimal"
                value={f.fyMpa} onChange={(e) => ubah("fyMpa", e.target.value)}
                style={gayaInput}
              />
            }
          />
          <Medan
            id="medan-fyvMpa"
            label="Mutu sengkang fyv (MPa)"
            keterangan="BjTP 280 untuk sengkang polos"
            anak={
              <input
                id="medan-fyvMpa" type="number" inputMode="decimal"
                value={f.fyvMpa} onChange={(e) => ubah("fyvMpa", e.target.value)}
                style={gayaInput}
              />
            }
          />
        </div>

        {/* ── Portal (mode "analisa rangka") */}
        {mode === "rangka" && (
          <div style={{ marginTop: "var(--gap-bagian)", paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <p style={{
              margin: "0 0 10px", fontSize: "var(--teks-label)", fontWeight: 700,
              letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
            }}>
              Portal yang dianalisa
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--gap-grid)",
            }}>
              {MEDAN_RANGKA.map(({ k, l, s, ket }) => (
                <Medan
                  key={k}
                  id={`r-${k}`}
                  label={`${l} (${s})`}
                  wajib
                  {...(ket ? { keterangan: ket } : {})}
                  anak={
                    <input
                      id={`r-${k}`} type="number" inputMode="decimal"
                      style={gayaInput}
                      value={fr[k] ?? ""}
                      onChange={(e) => ubahRangka(k, e.target.value)}
                    />
                  }
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Beban (mode "dari beban") */}
        {jenis === "balok" && mode === "beban" && (
          <div style={{ marginTop: "var(--gap-bagian)", paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <p style={{
              margin: "0 0 10px", fontSize: "var(--teks-label)", fontWeight: 700,
              letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
            }}>
              Beban yang dipikul
            </p>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "var(--gap-grid)",
            }}>
              <Medan id="b-bentangM" label="Bentang (m)" wajib
                anak={<input id="b-bentangM" type="number" inputMode="decimal" style={gayaInput}
                  value={fb.bentangM} onChange={(e) => setFb((x) => ({ ...x, bentangM: e.target.value }))} />} />
              <Medan id="b-lebarPikulM" label="Lebar pikul (m)" wajib
                keterangan="Setengah bentang kiri + kanan"
                anak={<input id="b-lebarPikulM" type="number" inputMode="decimal" style={gayaInput}
                  value={fb.lebarPikulM} onChange={(e) => setFb((x) => ({ ...x, lebarPikulM: e.target.value }))} />} />
              <Medan id="b-tebalPelatMm" label="Tebal pelat (mm)"
                keterangan="0 bila tak memikul pelat"
                anak={<input id="b-tebalPelatMm" type="number" inputMode="decimal" style={gayaInput}
                  value={fb.tebalPelatMm} onChange={(e) => setFb((x) => ({ ...x, tebalPelatMm: e.target.value }))} />} />
              <Medan id="b-skema" label="Skema balok" wajib
                anak={
                  <select id="b-skema" style={gayaInput} value={fb.skema}
                    onChange={(e) => setFb((x) => ({ ...x, skema: e.target.value }))}>
                    {SKEMA.map((k) => <option key={k.nilai} value={k.nilai}>{k.label}</option>)}
                  </select>
                } />
              <Medan id="b-fungsi" label="Fungsi ruang" wajib
                keterangan="Menentukan beban hidup (SNI 1727 Tabel 4.3-1)"
                anak={
                  <select id="b-fungsi" style={gayaInput} value={fb.fungsiRuangKunci}
                    onChange={(e) => setFb((x) => ({ ...x, fungsiRuangKunci: e.target.value }))}>
                    {(katalog?.fungsiRuang ?? []).map((r) => (
                      <option key={r.kunci} value={r.kunci}>{r.nama} — {r.bebanHidupKnM2} kN/m²</option>
                    ))}
                  </select>
                } />
              <Medan id="b-dinding" label="Dinding di atas balok"
                anak={
                  <select id="b-dinding" style={gayaInput} value={fb.jenisDinding}
                    onChange={(e) => setFb((x) => ({ ...x, jenisDinding: e.target.value }))}>
                    <option value="">Tak ada dinding</option>
                    {(katalog?.jenisDinding ?? []).map((d) => (
                      <option key={d.kunci} value={d.kunci}>{d.nama}</option>
                    ))}
                  </select>
                } />
              {fb.jenisDinding && (
                <Medan id="b-tinggiDinding" label="Tinggi dinding (m)" wajib
                  anak={<input id="b-tinggiDinding" type="number" inputMode="decimal" style={gayaInput}
                    value={fb.tinggiDindingM} onChange={(e) => setFb((x) => ({ ...x, tinggiDindingM: e.target.value }))} />} />
              )}
            </div>

            <fieldset style={{ marginTop: 14, border: "none", padding: 0 }}>
              <legend style={{
                padding: 0, marginBottom: 6, fontSize: "var(--teks-label)", fontWeight: 700,
                letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
              }}>
                Lapisan beban mati
              </legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 18px" }}>
                {(katalog?.lapisMati ?? []).map((l) => (
                  <label key={l.kunci} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    color: C.mid, cursor: "pointer",
                  }}>
                    <input type="checkbox" checked={lapis.includes(l.kunci)}
                      onChange={(e) => setLapis((xs) => e.target.checked
                        ? [...xs, l.kunci]
                        : xs.filter((k) => k !== l.kunci))} />
                    {l.nama} <span style={{ color: C.muted }}>({l.knM2} kN/m²)</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}

        <div style={{ marginTop: "var(--gap-bagian)" }}>
          <Tombol jenis="utama" onClick={hitung} disabled={memuat} ikon={<Lightbulb size={16} />}>
            {memuat ? "Menghitung…" : "Usulkan pembesian"}
          </Tombol>
        </div>

        {galatAksi && <div style={{ marginTop: 12 }}><Galat pesan={galatAksi} /></div>}
      </Kartu>

      {memuat && <Rangka />}

      {/* ── Hasil mode rangka: satu kartu per batang portal */}
      {hasilRangka && !memuat && (
        <>
          <Kartu>
            <JudulKartu>Hasil analisa rangka</JudulKartu>
            <p style={{
              margin: "0 0 var(--gap-bagian)", color: C.muted,
              fontSize: "var(--teks-label)", lineHeight: 1.6,
            }}>
              {hasilRangka.batang.length} batang diselesaikan sekaligus — momen,
              geser, dan aksial tiap batang datang dari solver, bukan dari
              koefisien perkiraan.
            </p>

            <div style={{ display: "grid", gap: "var(--gap-bagian)" }}>
              {hasilRangka.batang.map((b) => {
                const u = b.saran.terpilih;
                const svg = hasilRangka.gambar?.[b.nama];
                return (
                  <section
                    key={b.nama}
                    aria-label={`Batang ${b.nama}`}
                    style={{
                      border: `1px solid ${C.border}`,
                      borderRadius: "var(--rad-sedang)",
                      padding: "var(--pad-kartu)",
                    }}
                  >
                    <div style={{
                      display: "flex", alignItems: "baseline", gap: 10,
                      flexWrap: "wrap", marginBottom: 10,
                    }}>
                      <span style={{
                        fontFamily: "var(--font-display)",
                        fontSize: "var(--t-sedang)", fontWeight: 700,
                        color: C.navy, letterSpacing: "-.01em",
                      }}>
                        {b.nama}
                      </span>
                      <Lencana nada="netral">{b.jenis}</Lencana>
                    </div>

                    {/* Gaya dalam dari solver — ditampilkan SEBELUM usulannya,
                        alasan yang sama dengan kartu "Beban yang dipakai". */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                      <Lencana nada="info">Mu {b.muKnm.toFixed(1)} kNm</Lencana>
                      <Lencana nada="info">Vu {b.vuKn.toFixed(1)} kN</Lencana>
                      {b.jenis === "kolom" && (
                        <Lencana nada="info">Pu {b.puKn.toFixed(1)} kN</Lencana>
                      )}
                    </div>

                    {b.saran.berhasil && u ? (
                      <div style={{
                        display: "flex", alignItems: "baseline", gap: 12,
                        flexWrap: "wrap", marginBottom: 10,
                      }}>
                        <span style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "var(--teks-kpi)", fontWeight: 700,
                          color: C.navy, letterSpacing: "-.02em",
                        }}>
                          {tulisUsulan(u, b.jenis)}
                        </span>
                        <span style={{
                          fontFamily: "var(--font-display)",
                          fontSize: "var(--teks-kpi)", fontWeight: 700, color: C.mid,
                        }}>
                          sengkang {tulisSengkang(u)}
                        </span>
                      </div>
                    ) : (
                      /* Kegagalan sebagai JAWABAN, bukan galat sistem — pola
                         yang sama dengan mode lain (lihat header berkas). */
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                        <TriangleAlert size={18} aria-hidden="true"
                          style={{ color: C.yellow, flexShrink: 0, marginTop: 2 }} />
                        <p style={{ margin: 0, color: C.mid, lineHeight: 1.7 }}>
                          Tak ada kombinasi tulangan yang memenuhi syarat untuk
                          penampang ini — dari {b.saran.kandidatDicoba} kombinasi
                          yang diuji.
                          {b.saran.usulTinggiMm
                            ? ` Coba tinggi ${b.saran.usulTinggiMm} mm.`
                            : ""}
                        </p>
                      </div>
                    )}

                    {b.saran.berhasil && u && (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        <Lencana nada="netral">{u.besiKg!.toFixed(1)} kg besi</Lencana>
                        <Lencana nada={u.rasioKritis! <= BATAS_NYAMAN ? "sukses" : "peringatan"}>
                          {(u.rasioKritis! * 100).toFixed(0)}% kapasitas · {u.pemeriksaanKritis}
                        </Lencana>
                      </div>
                    )}

                    {/*
                      Latar PUTIH dipaku lewat `--kertas-gambar`, bukan
                      mengikuti tema: diagramnya bergaris gelap di atas kertas,
                      dan di mode gelap garisnya nyaris hilang. Pola yang sama
                      dengan gambar kerja di halaman Analisa Struktur.

                      ⚠ Diperiksa dengan `if (svg)`, bukan `!== null`: rute
                      MENGHILANGKAN kunci `gambar` saat dipanggil dengan
                      `gambar: false`.

                      ⚠ `maxWidth` 540 — dan itu terlihat dari potret, bukan
                      ditebak. Gambarnya lebar alami 520 px, sementara kartunya
                      lebih dari 1.500 px di layar lebar: tanpa batas ini,
                      kertas putihnya terbentang selebar kartu dengan diagram
                      menclok di sudut kiri, dan separuh kanannya kosong
                      melompong — terbaca seperti gambar yang gagal dimuat.
                      Membesarkan SVG-nya sampai selebar kartu bukan jawabannya:
                      ini gambar TEKNIK, garis dan angkanya punya ukuran yang
                      dimaksudkan.
                    */}
                    {svg && (
                      <div
                        style={{
                          background: "var(--kertas-gambar)",
                          border: `1px solid ${C.border}`,
                          borderRadius: "var(--radius-dense)",
                          padding: 10, overflowX: "auto",
                          maxWidth: 540,
                        }}
                        dangerouslySetInnerHTML={{ __html: svg }}
                      />
                    )}
                  </section>
                );
              })}
            </div>
          </Kartu>

          {/*
            ══════════════════════════════════════════════════════════════════
            REAKSI TUMPUAN — dan kenapa TABELNYA BUKAN INTI KARTU INI
            ══════════════════════════════════════════════════════════════════

            Inti kartu ini BUKAN tabel angkanya. Tabel gaya tumpuan tanpa
            pembanding tak membuktikan apa pun: ia hanya memindahkan
            kepercayaan dari solver ke tabel, dan pembacanya tetap harus
            percaya bahwa keduanya benar. Insinyur yang melihat "60,00 kN" tak
            punya cara tahu apakah itu hasil keseimbangan atau hasil salah
            tanda yang kebetulan terlihat wajar.

            Yang membuat kartu ini bernilai adalah SATU baris di bawah tabel:

                Σ Fy  =  q × L

            Pembacanya bisa menghitung ruas kanan di kepalanya sendiri
            (20 × 6 = 120) lalu mencocokkannya. Kalau cocok, ia tahu solver
            menutup keseimbangan tegak — TANPA membaca satu baris pun kode
            matriks kekakuan, dan tanpa mempercayai layar ini. Itulah seluruh
            alasan fitur ini ada; tabelnya cuma bahan bakunya.

            Karena itu baris pemeriksaan TIDAK BOLEH diam saat selisihnya
            besar. Angka yang salah tak punya "rasa salah" — 120 dan 96
            sama-sama terlihat wajar bagi mata yang tak menghitung. Pembacanya
            harus DIBERI TAHU, bukan dibiarkan menyimpulkan sendiri dari dua
            angka yang tak pernah ia bandingkan.
          */}
          {hasilRangka.rangka.reaksi && hasilRangka.rangka.reaksi.length > 0 && (() => {
            /*
              Σ dihitung dari nilai ASLI, baru hasilnya dibulatkan untuk
              ditampilkan. Menjumlahkan angka yang SUDAH dibulatkan membuat
              baris JUMLAH berbeda dari jumlah kolom di atasnya — selisih
              yang terbaca seperti cacat solver padahal cacat layar.
            */
            const sumFx = hasilRangka.rangka.reaksi.reduce((a, r) => a + r.fxKn, 0);
            const sumFy = hasilRangka.rangka.reaksi.reduce((a, r) => a + r.fyKn, 0);
            const sumM = hasilRangka.rangka.reaksi.reduce((a, r) => a + r.mKnm, 0);

            const bebanTotal = portalDipakai
              ? portalDipakai.qKnM * portalDipakai.bentangM
              : null;
            /*
              Ambang 0,01 kN = satu kilogram-gaya. Di bawah itu selisihnya
              sisa pembulatan aritmetika titik-mengambang, bukan cacat
              keseimbangan; di atas itu ada yang perlu dilihat orang. Ambang
              RELATIF ikut dipakai supaya portal besar tak dituduh salah hanya
              karena angkanya besar — menuntut 0,01 kN dari total 12.000 kN
              adalah presisi yang tak masuk akal diminta dari `double`.
            */
            const selisih = bebanTotal === null ? null : Math.abs(sumFy - bebanTotal);
            const ambang = bebanTotal === null
              ? 0
              : Math.max(0.01, Math.abs(bebanTotal) * 1e-6);
            const cocok = selisih !== null && selisih <= ambang;

            const num = (n: number) => n.toLocaleString("id-ID", {
              minimumFractionDigits: 2, maximumFractionDigits: 2,
            });
            /*
              Sel angka: rata KANAN + `tabular-nums` supaya digit sejajar ke
              bawah. Tanpa `tabular-nums`, glif "1" lebih sempit dari "8" dan
              kolom angkanya terlihat bergoyang — pada tabel yang SELURUH
              gunanya membandingkan angka, itu merusak gunanya.

              `whiteSpace: nowrap` supaya "−60,00" tak pernah patah jadi dua
              baris di layar sempit; tabelnya sudah punya `overflowX`.
            */
            const selAngka = {
              padding: "var(--pad-baris)",
              textAlign: "right" as const,
              fontVariantNumeric: "tabular-nums" as const,
              fontFamily: "var(--font-display)",
              borderBottom: `1px solid ${C.border}`,
              whiteSpace: "nowrap" as const,
            };
            const kepalaAngka = {
              padding: "var(--pad-baris)",
              textAlign: "right" as const,
              fontSize: "var(--teks-label)",
              fontWeight: 700,
              color: C.muted,
              borderBottom: `1px solid ${C.border}`,
              whiteSpace: "nowrap" as const,
            };
            const selJumlah = {
              ...selAngka,
              fontWeight: 700,
              color: C.navy,
              borderBottom: "none",
              borderTop: `2px solid ${C.border}`,
            };

            return (
              <Kartu>
                <JudulKartu>Reaksi tumpuan</JudulKartu>
                <p style={{
                  margin: "0 0 var(--gap-bagian)", color: C.muted,
                  fontSize: "var(--teks-label)", lineHeight: 1.6,
                }}>
                  Gaya yang tumpuan berikan kepada struktur, sumbu global.
                  Angkanya ada di sini supaya keseimbangan portal bisa Anda
                  periksa sendiri — bukan supaya dipercaya.
                </p>

                {/*
                  ⚠ `maxWidth` — dan ini TERLIHAT DARI POTRET, bukan ditebak.

                  Versi pertama memakai `width: 100%` saja. Kartunya lebih
                  dari 1.900 px di layar lebar, jadi keempat kolomnya terentang
                  sampai ada ~700 px kosong antara nama simpul dan angkanya.
                  Mata lalu kehilangan jejak baris: "S0Ki" di ujung kiri dan
                  "-20,78" di ujung kanan tak lagi terbaca sebagai satu baris,
                  dan itu justru merusak SATU-SATUNYA guna tabel ini —
                  membandingkan angka.

                  Dibatasi, bukan diregangkan: tabel empat kolom angka pendek
                  memang tak butuh lebar penuh.
                */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{
                    width: "100%", maxWidth: 620,
                    borderCollapse: "collapse",
                  }}>
                    {/*
                      Caption DISEMBUNYIKAN DARI MATA, bukan dibuang.

                      Versi pertama menampilkannya, dan di potret ia terbaca
                      sebagai kalimat KEDUA yang mengatakan hal yang sama
                      dengan paragraf tepat di atasnya — dua baris pengantar
                      berturut-turut untuk satu tabel kecil.

                      Dibuang sama sekali juga salah: pembaca layar kehilangan
                      nama tabelnya. Jadi ia tetap ada di pohon aksesibilitas,
                      hanya tak memakan ruang visual.
                    */}
                    <caption style={{
                      position: "absolute", width: 1, height: 1,
                      overflow: "hidden", clip: "rect(0 0 0 0)",
                      whiteSpace: "nowrap",
                    }}>
                      Reaksi tiap simpul bertumpu, beserta jumlahnya.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" style={{
                          padding: "var(--pad-baris)", textAlign: "left",
                          fontSize: "var(--teks-label)", fontWeight: 700,
                          color: C.muted, borderBottom: `1px solid ${C.border}`,
                        }}>
                          Simpul
                        </th>
                        <th scope="col" style={kepalaAngka}>Fx (kN)</th>
                        <th scope="col" style={kepalaAngka}>Fy (kN)</th>
                        <th scope="col" style={kepalaAngka}>M (kNm)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hasilRangka.rangka.reaksi.map((r) => (
                        <tr key={r.simpul}>
                          <th scope="row" style={{
                            padding: "var(--pad-baris)", textAlign: "left",
                            fontWeight: 600, color: C.navy,
                            borderBottom: `1px solid ${C.border}`,
                            whiteSpace: "nowrap",
                          }}>
                            {r.nama}
                          </th>
                          <td style={selAngka}>{num(r.fxKn)}</td>
                          <td style={selAngka}>{num(r.fyKn)}</td>
                          <td style={selAngka}>{num(r.mKnm)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" style={{
                          padding: "var(--pad-baris)", textAlign: "left",
                          fontWeight: 700, color: C.navy,
                          borderTop: `2px solid ${C.border}`,
                          whiteSpace: "nowrap",
                        }}>
                          JUMLAH
                        </th>
                        <td style={selJumlah}>{num(sumFx)}</td>
                        <td style={selJumlah}>{num(sumFy)}</td>
                        <td style={selJumlah}>{num(sumM)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/*
                  BARIS PEMERIKSAAN — inti kartu ini.

                  Ditulis sebagai kalimat lengkap, bukan lencana "OK", karena
                  yang perlu sampai ke pembacanya bukan VONIS melainkan CARA
                  memeriksanya: ruas kanan (q × L) sengaja ditulis lengkap
                  dengan angkanya supaya bisa dihitung ulang di kepala.
                */}
                {bebanTotal !== null && portalDipakai && (
                  <div
                    role="note"
                    style={{
                      marginTop: "var(--gap-bagian)",
                      display: "flex", gap: 10, alignItems: "flex-start",
                      padding: "var(--pad-kartu)",
                      borderRadius: "var(--rad-sedang)",
                      background: cocok ? C.greenBg : C.yellowBg,
                      border: `1px solid ${cocok ? C.greenBorder : C.yellowBorder}`,
                    }}
                  >
                    {cocok
                      ? <Check size={18} aria-hidden="true"
                          style={{ color: C.green, flexShrink: 0, marginTop: 2 }} />
                      : <TriangleAlert size={18} aria-hidden="true"
                          style={{ color: C.yellow, flexShrink: 0, marginTop: 2 }} />}
                    <p style={{ margin: 0, color: C.mid, lineHeight: 1.7 }}>
                      <strong style={{ color: C.navy }}>
                        ΣFy = {num(sumFy)} kN
                      </strong>
                      {cocok ? " — sama dengan " : " — TIDAK sama dengan "}
                      total beban vertikal (q × L = {num(portalDipakai.qKnM)}
                      {" × "}{num(portalDipakai.bentangM)} = {num(bebanTotal)} kN).
                      {cocok
                        ? " Keseimbangan tegak menutup — Anda bisa memeriksanya sendiri di atas kertas."
                        : ` Selisih ${num(selisih!)} kN. Jangan pakai angka di atas sebelum sebabnya diketahui.`}
                    </p>
                  </div>
                )}
              </Kartu>
            );
          })()}

          {/* Catatan & batas — kartu TERPISAH, sama seperti mode lain. */}
          <Kartu>
            <JudulKartu>Catatan &amp; batas</JudulKartu>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.mid, lineHeight: 1.8 }}>
              {hasilRangka.catatan.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </Kartu>
        </>
      )}

      {/* ── Hasil */}
      {hasil && !memuat && (
        <>
          {/*
            Beban yang DIPAKAI, ditampilkan SEBELUM usulannya.

            Bukan hiasan. Momen yang salah tak punya "rasa salah" — 72 kNm dan
            210 kNm sama-sama terlihat wajar, dan yang salah menghasilkan balok
            yang lolos pemeriksaan tapi tak kuat. Pemakai yang tak pernah
            melihat angkanya tak punya kesempatan berkata "kok kecil sekali
            untuk bentang segitu". Rinciannya ikut supaya bisa ditelusuri
            baris per baris, bukan dipercaya bulat-bulat.
          */}
          {hasil.beban && (
            <Kartu>
              <JudulKartu>Beban yang dipakai</JudulKartu>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <Lencana nada="info">Mu {hasil.beban.muKnm.toFixed(1)} kNm</Lencana>
                <Lencana nada="info">Vu {hasil.beban.vuKn.toFixed(1)} kN</Lencana>
                <Lencana nada="netral">qu {hasil.beban.quKnM.toFixed(2)} kN/m</Lencana>
                <Lencana nada="netral">wL²/{hasil.beban.pembagiMomen}</Lencana>
              </div>
              <p style={{
                margin: "0 0 6px", fontSize: "var(--teks-label)", fontWeight: 700,
                letterSpacing: ".05em", textTransform: "uppercase", color: C.muted,
              }}>
                Penyusun beban mati
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, color: C.mid, lineHeight: 1.8 }}>
                {hasil.beban.rincianMati.map((r, i) => (
                  <li key={i}>{r.nama} — {r.knM.toFixed(2)} kN/m</li>
                ))}
                <li style={{ color: C.muted }}>
                  Beban hidup {hasil.beban.qHidupKnM.toFixed(2)} kN/m
                  {" · "}mati total {hasil.beban.qMatiKnM.toFixed(2)} kN/m
                </li>
              </ul>
            </Kartu>
          )}

          {hasil.berhasil && t ? (
            <Kartu>
              <JudulKartu>Usulan terpilih</JudulKartu>

              <div style={{
                display: "flex", alignItems: "baseline", gap: 12,
                flexWrap: "wrap", marginBottom: 12,
              }}>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--teks-kpi)", fontWeight: 700,
                  color: C.navy, letterSpacing: "-.02em",
                }}>
                  {tulisUsulan(t, hasil.jenis)}
                </span>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--teks-kpi)", fontWeight: 700, color: C.mid,
                }}>
                  sengkang {tulisSengkang(t)}
                </span>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                <Lencana nada="netral">{t.besiKg!.toFixed(1)} kg besi</Lencana>
                <Lencana nada={t.rasioKritis! <= BATAS_NYAMAN ? "sukses" : "peringatan"}>
                  {(t.rasioKritis! * 100).toFixed(0)}% kapasitas · {t.pemeriksaanKritis}
                </Lencana>
                <Lencana nada="netral">{hasil.kandidatDicoba} kombinasi diuji</Lencana>
              </div>

              {hasil.alternatif.length > 0 && (
                <>
                  <p style={{
                    margin: "0 0 6px", fontSize: "var(--teks-label)",
                    fontWeight: 700, letterSpacing: ".05em",
                    textTransform: "uppercase", color: C.muted,
                  }}>
                    Alternatif yang juga memenuhi
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 18, color: C.mid, lineHeight: 1.8 }}>
                    {hasil.alternatif.map((a, i) => (
                      <li key={i}>
                        {tulisUsulan(a, hasil.jenis)} sengkang {tulisSengkang(a)}
                        {" — "}{a.besiKg!.toFixed(1)} kg
                        {" · "}{(a.rasioKritis! * 100).toFixed(0)}% kapasitas
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Kartu>
          ) : (
            /*
              Kegagalan sebagai JAWABAN, bukan galat sistem. Lihat header.
            */
            <Kartu>
              <JudulKartu>Penampang ini belum cukup</JudulKartu>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <TriangleAlert size={18} aria-hidden="true" style={{ color: C.yellow, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ margin: "0 0 8px", color: C.mid, lineHeight: 1.7 }}>
                    Tak ada kombinasi tulangan yang memenuhi syarat untuk dimensi
                    dan beban ini — dari {hasil.kandidatDicoba} kombinasi yang diuji.
                  </p>
                  {hasil.usulTinggiMm && (
                    <p style={{ margin: 0, color: C.text, fontWeight: 600 }}>
                      Coba tinggi {hasil.usulTinggiMm} mm — sudah diuji dan bisa dibesi.
                    </p>
                  )}
                </div>
              </div>
            </Kartu>
          )}

          {/*
            Catatan & batas — WAJIB tampil, tak bisa ditutup. Lihat header.
          */}
          <Kartu>
            <JudulKartu>Catatan &amp; batas</JudulKartu>
            <ul style={{ margin: 0, paddingLeft: 18, color: C.mid, lineHeight: 1.8 }}>
              {hasil.catatan.map((c, i) => <li key={i}>{c}</li>)}
            </ul>

            <div style={{
              marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`,
              display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
            }}>
              <Info size={15} aria-hidden="true" style={{ color: C.muted }} />
              <span style={{ color: C.muted, fontSize: "var(--teks-label)" }}>
                Sudah punya angka tulangannya dan ingin memeriksanya?
              </span>
              <Link
                href="/estimasi/struktur"
                style={{
                  color: C.navy, fontWeight: 600, textDecoration: "none",
                  display: "inline-flex", alignItems: "center", gap: 4,
                }}
              >
                Analisa Struktur <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </Kartu>
        </>
      )}
    </>
  );
}
