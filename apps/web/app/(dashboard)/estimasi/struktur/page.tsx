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
import { Isian, KotakIsian, PilihanIsian, TeksIsian } from "@/components/isian";
import { formatAngka } from "@/lib/format";
import {
  AlertTriangle, Boxes, CheckCircle2, Eye, Info, Plus, RefreshCw, Ruler, Trash2, X,
} from "lucide-react";
import { Modal, btnPrimary, btnGhost } from "../_bersama/kerangka";
import { LayarKosong } from "../_bersama/layar-kosong";

// ── Bentuk respons API ────────────────────────────────────────────────────
interface Project { id: string; name: string }

type JenisBeton =
  | "balok" | "kolom" | "kolom_bulat" | "plat" | "footplat" | "pilecap" | "tiang"
  | "sloof" | "tangga" | "balok_t"
  | "pondasi_menerus" | "raft" | "dinding_penahan" | "dinding_geser"
  | "kolom_komposit" | "bondek";

type JenisBaja =
  | "baja_balok" | "baja_kolom" | "baja_gording" | "baja_bracing"
  | "baja_rangka" | "baja_base_plate" | "baja_angkur"
  | "baja_sambungan_baut" | "baja_sambungan_las" | "baja_interaksi"
  | "baja_gusset" | "baja_sambungan_momen" | "kuda_kuda_kayu" | "baja_ringan"
  | "sambungan_kayu" | "sekrup_baja_ringan";

type Jenis = JenisBeton | JenisBaja;

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

interface Periksa {
  nama: string; nilai: number; syarat: number; satuan: string;
  aman: boolean; rasio: number; rumus: string;
}

interface PenjelasanAwam {
  nama: string; judul: string; apa: string; risiko: string; tindakan: string;
}

interface PemeriksaanAwam {
  nama: string;
  tingkat: "aman" | "mepet" | "bahaya";
  persenTerpakai: number;
  penjelasan: PenjelasanAwam | null;
}

interface MuatanDetail {
  elemen: BarisElemen;
  awam?: {
    ringkasan: { tingkat: "aman" | "mepet" | "bahaya"; kalimat: string };
    pemeriksaan: PemeriksaanAwam[];
  };
  hasil: {
    aman?: boolean;
    periksa?: Periksa[];
    catatan?: string[];
    dasar?: { periksa?: Periksa[]; catatan?: string[] };
  };
  gambar?: Record<string, string>;
}

interface UsulanRab {
  jenis: string;
  uraian: string;
  kuantitas: number;
  satuan: string;
  asal: { kodeElemen: string; jenisElemen: string }[];
  catatan: string[];
  assembly: { id: string; code: string; name: string; unit: string } | null;
  beli?: {
    kuantitas: number; satuan: string;
    ukuranPerSatuan: string; asumsi: string; terpasangKg: number;
  };
}

interface MuatanUsulanRab {
  usulan: UsulanRab[];
  jumlahUsulan: number;
  tanpaAssembly: { uraian: string; satuan: string; pola: string[] }[];
  gagal: { kode: string; alasan: string }[];
  catatan: string[];
  belumSegar: number;
}

interface HasilKirim {
  masuk: { uraian: string; kuantitas: number; satuan: string; assembly: string }[];
  dilewati: { uraian: string; alasan: string }[];
  jumlahMasuk: number;
  jumlahDilewati: number;
  langkahBerikut: string;
}

interface VersiEstimasi {
  id: string;
  version_number: number;
  status: string;
  project_id: string;
  scenario_name?: string;
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
  // Beton
  balok: "Balok",
  kolom: "Kolom persegi",
  kolom_bulat: "Kolom bulat",
  plat: "Pelat lantai",
  footplat: "Pondasi footplat",
  pilecap: "Pilecap",
  tiang: "Tiang pancang",
  sloof: "Sloof (tie beam)",
  tangga: "Tangga beton",
  balok_t: "Balok anak (T)",
  pondasi_menerus: "Pondasi menerus",
  raft: "Raft (pelat pondasi)",
  dinding_penahan: "Dinding penahan tanah",
  dinding_geser: "Dinding geser",
  kolom_komposit: "Kolom komposit",
  bondek: "Pelat bondek",
  baja_gusset: "Pelat buhul (gusset)",
  baja_sambungan_momen: "Sambungan momen",
  kuda_kuda_kayu: "Kuda-kuda kayu",
  baja_ringan: "Rangka baja ringan",
  sambungan_kayu: "Sambungan kayu (paku / baut)",
  sekrup_baja_ringan: "Sekrup baja ringan",
  // Baja
  baja_balok: "Balok baja",
  baja_kolom: "Kolom baja",
  baja_gording: "Gording atap",
  baja_bracing: "Bracing (pengaku)",
  baja_rangka: "Kuda-kuda / rangka batang",
  baja_base_plate: "Pelat landas (base plate)",
  baja_angkur: "Angkur",
  baja_sambungan_baut: "Sambungan baut",
  baja_sambungan_las: "Sambungan las",
  baja_interaksi: "Kolom tekan + momen",
};

/**
 * Jenis dikelompokkan BETON vs BAJA di daftar pilihan.
 *
 * Tanpa pengelompokan, tujuh belas jenis dalam satu daftar datar membuat
 * orang harus membaca semuanya untuk menemukan yang dicari — dan "Balok"
 * serta "Balok baja" berdampingan tanpa penanda apa pun mudah tertukar.
 * Salah pilih di antara keduanya menghasilkan verdict untuk bahan yang salah.
 */
const KELOMPOK_JENIS: { label: string; jenis: Jenis[] }[] = [
  {
    label: "Beton bertulang",
    /*
      Urutannya mengikuti urutan PENGERJAAN di lapangan, bukan abjad: pondasi
      (footplat, pilecap, tiang) → sloof → kolom → balok → pelat → tangga.
      Estimator yang menyusun RAB bekerja dari bawah ke atas, dan daftar yang
      urutannya acak membuatnya membaca seluruh isinya tiap kali.
    */
    jenis: [
      "pondasi_menerus", "footplat", "pilecap", "raft", "tiang", "sloof",
      "kolom", "kolom_bulat", "balok", "balok_t", "plat", "tangga",
      "dinding_penahan", "dinding_geser",
      "kolom_komposit", "bondek",
    ],
  },
  {
    label: "Baja profil",
    jenis: [
      "baja_balok", "baja_kolom", "baja_gording", "baja_bracing", "baja_rangka",
      "baja_base_plate", "baja_angkur",
      "baja_sambungan_baut", "baja_sambungan_las", "baja_interaksi",
      "baja_gusset", "baja_sambungan_momen",
    ],
  },
  {
    /*
      Kelompok ketiga: rangka atap ringan. Dipisahkan dari "Baja profil" karena
      bahannya berbeda perilakunya — baja ringan dikendalikan TEKUK LOKAL
      (luas efektif bisa sepertiga bruto) dan kayu oleh ARAH SERAT. Menaruhnya
      bersama baja profil membuat orang menyangka rumusnya sama.
    */
    label: "Atap ringan & kayu",
    /*
      Sambungan ikut kelompok ini, bukan kelompok sendiri, karena orang yang
      baru saja memeriksa batangnya justru yang perlu diingatkan bahwa
      batangnya bukan titik gagalnya. Menaruhnya di kelompok terpisah membuat
      keduanya terlihat sebagai pekerjaan yang berbeda.
    */
    jenis: [
      "kuda_kuda_kayu", "baja_ringan",
      "sambungan_kayu", "sekrup_baja_ringan",
    ],
  },
];

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
  /*
    SLOOF — bebannya DIHITUNG dari dinding, tidak diketik.

    Medan `muKnm`/`vuKn` sengaja TIDAK ada di sini, berbeda dengan balok.
    Estimator yang harus menghitung momen sloof sendiri di kertas akan salah,
    dan salahnya tak terlihat karena angka momen tak punya "rasa benar" seperti
    dimensi. Yang diisi: tinggi dan tebal dinding di atasnya.
  */
  sloof: [
    { kunci: "bMm", label: "Lebar b", satuan: "mm" },
    { kunci: "hMm", label: "Tinggi h", satuan: "mm" },
    { kunci: "bentangM", label: "Bentang antar kolom", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan utama", satuan: "mm" },
    { kunci: "nBawah", label: "Jumlah tulangan bawah" },
    { kunci: "nAtas", label: "Jumlah tulangan atas (wajib = bawah)" },
    { kunci: "dSengkangMm", label: "Ø sengkang", satuan: "mm" },
    { kunci: "jarakSengkangMm", label: "Jarak sengkang", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "tinggiDindingM", label: "Tinggi dinding di atasnya", satuan: "m" },
    { kunci: "tebalDindingM", label: "Tebal dinding", satuan: "m" },
  ],
  /*
    TANGGA — optrede & antrede diisi, sisanya dihitung.

    Panjang miring, jumlah anak tangga, dan kemiringannya TIDAK diminta:
    ketiganya turunan dari tinggi, optrede, dan antrede. Meminta orang
    mengisinya membuka peluang isian yang saling bertentangan — dan yang
    bertentangan itu tak akan ketahuan sampai tangganya dicor.
  */
  tangga: [
    { kunci: "tebalPelatMm", label: "Tebal pelat", satuan: "mm" },
    { kunci: "lebarM", label: "Lebar tangga", satuan: "m" },
    { kunci: "tinggiM", label: "Tinggi antar lantai", satuan: "m" },
    { kunci: "optredeMm", label: "Optrede (tinggi anak tangga)", satuan: "mm" },
    { kunci: "antredeMm", label: "Antrede (lebar injakan)", satuan: "mm" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan utama", satuan: "mm" },
    { kunci: "jarakUtamaMm", label: "Jarak tulangan utama", satuan: "mm" },
    { kunci: "dBagiMm", label: "Ø tulangan bagi", satuan: "mm" },
    { kunci: "jarakBagiMm", label: "Jarak tulangan bagi", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "panjangBordesM", label: "Panjang bordes (0 bila tak ada)", satuan: "m" },
  ],
  kolom_komposit: [
    { kunci: "jenis", label: "Jenis (terbungkus / terisi)" },
    { kunci: "asBajaMm2", label: "Luas penampang baja", satuan: "mm²" },
    { kunci: "inersiaBajaMm4", label: "Inersia baja arah lemah", satuan: "mm⁴" },
    { kunci: "lebarBetonMm", label: "Lebar beton", satuan: "mm" },
    { kunci: "tinggiBetonMm", label: "Tinggi beton", satuan: "mm" },
    { kunci: "panjangTekukM", label: "Panjang tekuk", satuan: "m" },
    { kunci: "asTulanganMm2", label: "Luas tulangan longitudinal", satuan: "mm²" },
    { kunci: "mutuBaja.fyMpa", label: "Mutu baja fy", satuan: "MPa" },
    { kunci: "mutuBeton.fcMpa", label: "Mutu beton f'c", satuan: "MPa" },
    { kunci: "mutuTulangan.fyMpa", label: "Mutu tulangan fy", satuan: "MPa" },
    { kunci: "puKn", label: "Gaya aksial Pu", satuan: "kN" },
  ],
  bondek: [
    { kunci: "bentangM", label: "Bentang bersih", satuan: "m" },
    { kunci: "tebalTotalMm", label: "Tebal pelat total", satuan: "mm" },
    { kunci: "tinggiGelombangMm", label: "Tinggi gelombang bondek", satuan: "mm" },
    { kunci: "tebalBajaMm", label: "Tebal baja bondek", satuan: "mm" },
    { kunci: "asBondekMm2PerM", label: "Luas bondek per m lebar", satuan: "mm²/m" },
    { kunci: "inersiaBondekMm4PerM", label: "Inersia bondek per m", satuan: "mm⁴/m" },
    { kunci: "mutuBondek.fyMpa", label: "Mutu bondek fy", satuan: "MPa" },
    { kunci: "mutuBeton.fcMpa", label: "Mutu beton f'c", satuan: "MPa" },
    { kunci: "bebanHidupKpa", label: "Beban hidup", satuan: "kPa" },
    { kunci: "bebanMatiTambahanKpa", label: "Beban mati tambahan", satuan: "kPa" },
    { kunci: "luasM2", label: "Luas pelat", satuan: "m²" },
  ],
  baja_gusset: [
    { kunci: "tebalMm", label: "Tebal pelat buhul", satuan: "mm" },
    { kunci: "lebarSambunganMm", label: "Lebar sambungan", satuan: "mm" },
    { kunci: "panjangSambunganMm", label: "Panjang sambungan", satuan: "mm" },
    { kunci: "panjangBebasMm", label: "Panjang bebas ke tumpuan", satuan: "mm" },
    { kunci: "gayaKn", label: "Gaya batang (− untuk tekan)", satuan: "kN" },
    { kunci: "mutu.fyMpa", label: "Mutu baja fy", satuan: "MPa" },
    { kunci: "mutu.fuMpa", label: "Mutu baja fu", satuan: "MPa" },
    { kunci: "agvMm2", label: "Luas geser bruto (blok)", satuan: "mm²" },
    { kunci: "anvMm2", label: "Luas geser neto (blok)", satuan: "mm²" },
    { kunci: "antMm2", label: "Luas tarik neto (blok)", satuan: "mm²" },
  ],
  baja_sambungan_momen: [
    { kunci: "tipe", label: "Tipe (pelat_ujung / sayap_dilas / siku_sayap)" },
    { kunci: "tinggiBalokMm", label: "Tinggi balok", satuan: "mm" },
    { kunci: "tebalSayapMm", label: "Tebal sayap balok", satuan: "mm" },
    { kunci: "lebarSayapMm", label: "Lebar sayap balok", satuan: "mm" },
    { kunci: "muKnm", label: "Momen Mu", satuan: "kNm" },
    { kunci: "vuKn", label: "Geser Vu", satuan: "kN" },
    { kunci: "inersiaBalokMm4", label: "Inersia balok", satuan: "mm⁴" },
    { kunci: "bentangM", label: "Bentang balok", satuan: "m" },
    { kunci: "kekakuanKnmPerRad", label: "Kekakuan rotasi sambungan", satuan: "kNm/rad" },
    { kunci: "asBautTarikMm2", label: "Luas baut tarik di sayap", satuan: "mm²" },
    { kunci: "fuBautMpa", label: "Kuat tarik baut", satuan: "MPa" },
    { kunci: "mutu.fyMpa", label: "Mutu baja fy", satuan: "MPa" },
    { kunci: "mutu.fuMpa", label: "Mutu baja fu", satuan: "MPa" },
  ],
  kuda_kuda_kayu: [
    { kunci: "kelas", label: "Kelas kuat kayu (I / II / III / IV)" },
    { kunci: "lebarMm", label: "Lebar penampang", satuan: "mm" },
    { kunci: "tinggiMm", label: "Tinggi penampang", satuan: "mm" },
    { kunci: "panjangM", label: "Panjang batang", satuan: "m" },
    { kunci: "gayaKn", label: "Gaya batang (− untuk tekan)", satuan: "kN" },
    { kunci: "momenKnm", label: "Momen lentur", satuan: "kNm" },
    { kunci: "durasi", label: "Durasi beban (tetap / sepuluh_menit / …)" },
    { kunci: "kadarAir", label: "Kadar air (kering / basah)" },
    { kunci: "lebarTumpuanMm", label: "Lebar landasan tumpuan", satuan: "mm" },
    { kunci: "gayaTumpuKn", label: "Gaya tumpu tegak lurus serat", satuan: "kN" },
  ],
  sambungan_kayu: [
    { kunci: "alat", label: "Alat sambung (paku / baut / pelat_bergigi)" },
    { kunci: "diameterMm", label: "Ø alat sambung", satuan: "mm" },
    { kunci: "jumlahAlat", label: "Jumlah alat sambung" },
    { kunci: "tebalUtamaMm", label: "Tebal kayu utama", satuan: "mm" },
    { kunci: "tebalSisiMm", label: "Tebal kayu penyambung", satuan: "mm" },
    { kunci: "penetrasiMm", label: "Kedalaman tembus ke kayu utama", satuan: "mm" },
    { kunci: "kelas", label: "Kelas kayu (I / II / III / IV)" },
    { kunci: "durasi", label: "Durasi beban (tetap / sepuluh_menit / …)" },
    { kunci: "kadarAir", label: "Kadar air (kering / basah)" },
    { kunci: "gayaKn", label: "Gaya yang dipindahkan sambungan", satuan: "kN" },
    { kunci: "jarakTepiSejajarMm", label: "Jarak ke UJUNG kayu (arah serat)", satuan: "mm" },
    { kunci: "jarakTepiTegakMm", label: "Jarak ke TEPI kayu (tegak serat)", satuan: "mm" },
    { kunci: "jarakAntarAlatMm", label: "Jarak antar alat sambung", satuan: "mm" },
    /*
      SUDUT terhadap serat — hanya berpengaruh pada BAUT.

      Bawaannya 0 (sejajar serat) yang justru arah PALING KUAT, jadi
      mengosongkannya memberi hasil optimistis. Labelnya menyebut akibatnya
      supaya yang mengisi tahu kenapa ini penting.
    */
    { kunci: "sudutTerhadapSeratDerajat", label: "Sudut gaya ke serat kayu (0=sejajar, 45=turun jadi 40%) — baut saja", satuan: "°" },
  ],
  sekrup_baja_ringan: [
    { kunci: "diameterMm", label: "Ø sekrup", satuan: "mm" },
    { kunci: "jumlahSekrup", label: "Jumlah sekrup di titik ini" },
    { kunci: "tebal1Mm", label: "Tebal pelat sisi kepala", satuan: "mm" },
    { kunci: "tebal2Mm", label: "Tebal pelat sisi ulir", satuan: "mm" },
    { kunci: "fuMpa", label: "Kuat tarik baja profil fu", satuan: "MPa" },
    { kunci: "gayaGeserKn", label: "Gaya geser per sambungan", satuan: "kN" },
    { kunci: "gayaTarikKn", label: "Gaya cabut (hisapan angin)", satuan: "kN" },
    { kunci: "jarakTepiMm", label: "Jarak sekrup ke ujung profil", satuan: "mm" },
  ],
  baja_ringan: [
    { kunci: "profil", label: "Profil (C75_075 / C75_100 / C100_100 / R30_045)" },
    { kunci: "panjangM", label: "Panjang batang", satuan: "m" },
    { kunci: "gayaKn", label: "Gaya batang (− untuk tekan)", satuan: "kN" },
    { kunci: "jarakKudaKudaM", label: "Jarak antar kuda-kuda", satuan: "m" },
    { kunci: "lapisanGM2", label: "Lapisan antikarat", satuan: "g/m²" },
    { kunci: "lingkungan", label: "Lingkungan (biasa / pantai)" },
  ],
  balok_t: [
    { kunci: "bwMm", label: "Lebar badan bw", satuan: "mm" },
    { kunci: "hMm", label: "Tinggi total (termasuk pelat)", satuan: "mm" },
    { kunci: "hfMm", label: "Tebal pelat hf", satuan: "mm" },
    { kunci: "bentangBersihM", label: "Bentang bersih", satuan: "m" },
    { kunci: "jarakAsAsM", label: "Jarak as-as ke balok sebelah", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan utama", satuan: "mm" },
    { kunci: "nTarik", label: "Jumlah tulangan bawah" },
    { kunci: "nAtas", label: "Jumlah tulangan atas" },
    { kunci: "dSengkangMm", label: "Ø sengkang", satuan: "mm" },
    { kunci: "jarakSengkangMm", label: "Jarak sengkang", satuan: "mm" },
    ...MEDAN_MUTU,
    { kunci: "muPositifKnm", label: "Momen lapangan Mu+", satuan: "kNm" },
    { kunci: "muNegatifKnm", label: "Momen tumpuan Mu− (0 bila sederhana)", satuan: "kNm" },
    { kunci: "vuKn", label: "Gaya geser Vu", satuan: "kN" },
  ],
  pondasi_menerus: [
    { kunci: "lebarBawahM", label: "Lebar dasar", satuan: "m" },
    { kunci: "lebarAtasM", label: "Lebar puncak", satuan: "m" },
    { kunci: "tinggiM", label: "Tinggi badan", satuan: "m" },
    { kunci: "panjangM", label: "Panjang total", satuan: "m" },
    { kunci: "kedalamanM", label: "Kedalaman dari muka tanah", satuan: "m" },
    { kunci: "bebanKnPerM", label: "Beban dinding", satuan: "kN/m" },
    { kunci: "qaKnM2", label: "Daya dukung tanah izin", satuan: "kPa" },
    { kunci: "gammaTanahKnM3", label: "Berat volume tanah", satuan: "kN/m³" },
    { kunci: "tebalPasirM", label: "Tebal pasir urug", satuan: "m" },
    { kunci: "tinggiAanstampingM", label: "Tinggi aanstamping", satuan: "m" },
  ],
  raft: [
    { kunci: "panjangM", label: "Panjang raft", satuan: "m" },
    { kunci: "lebarM", label: "Lebar raft", satuan: "m" },
    { kunci: "tebalMm", label: "Tebal pelat", satuan: "mm" },
    { kunci: "bebanTotalKn", label: "Jumlah beban semua kolom", satuan: "kN" },
    { kunci: "eksentrisitasXM", label: "Eksentrisitas arah panjang", satuan: "m" },
    { kunci: "eksentrisitasYM", label: "Eksentrisitas arah lebar", satuan: "m" },
    { kunci: "qaKnM2", label: "Daya dukung tanah izin", satuan: "kPa" },
    { kunci: "bentangKolomM", label: "Bentang terbesar antar kolom", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan", satuan: "mm" },
    { kunci: "jarakUtamaMm", label: "Jarak tulangan", satuan: "mm" },
    ...MEDAN_MUTU,
  ],
  dinding_penahan: [
    { kunci: "tinggiM", label: "Tinggi total", satuan: "m" },
    { kunci: "tebalAtasM", label: "Tebal badan di puncak", satuan: "m" },
    { kunci: "tebalBawahM", label: "Tebal badan di dasar", satuan: "m" },
    { kunci: "panjangTelapakM", label: "Panjang telapak", satuan: "m" },
    { kunci: "tebalTelapakM", label: "Tebal telapak", satuan: "m" },
    { kunci: "kakiM", label: "Panjang kaki depan", satuan: "m" },
    { kunci: "gammaTanahKnM3", label: "Berat volume tanah", satuan: "kN/m³" },
    { kunci: "phiDerajat", label: "Sudut geser dalam tanah φ", satuan: "°" },
    { kunci: "kohesiKpa", label: "Kohesi tanah (0 untuk pasir)", satuan: "kPa" },
    { kunci: "surchargeKpa", label: "Beban di atas tanah urug", satuan: "kPa" },
    { kunci: "qaKnM2", label: "Daya dukung tanah izin", satuan: "kPa" },
    { kunci: "panjangDindingM", label: "Panjang dinding", satuan: "m" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan", satuan: "mm" },
    { kunci: "jarakUtamaMm", label: "Jarak tulangan", satuan: "mm" },
    ...MEDAN_MUTU,
    /*
      GEMPA — opsional, dan kosongnya BUKAN berarti aman.

      Labelnya sengaja menyebut SUMBER angkanya (peta gempa SNI 1726), bukan
      cuma nama besarannya. "PGA" tak berarti apa-apa bagi yang mengisi;
      "dari peta gempa SNI 1726" memberi tahu ke mana harus mencari.
    */
    { kunci: "pgaG", label: "Percepatan gempa PGA (peta SNI 1726) — kosongkan bila belum tahu", satuan: "g" },
  ],
  dinding_geser: [
    { kunci: "panjangM", label: "Panjang dinding (arah gaya)", satuan: "m" },
    { kunci: "tebalMm", label: "Tebal", satuan: "mm" },
    { kunci: "tinggiM", label: "Tinggi total", satuan: "m" },
    { kunci: "vuKn", label: "Gaya geser Vu", satuan: "kN" },
    { kunci: "muKnm", label: "Momen guling Mu", satuan: "kNm" },
    { kunci: "puKn", label: "Gaya aksial Pu", satuan: "kN" },
    { kunci: "rhoHorizontal", label: "Rasio tulangan mendatar ρt" },
    { kunci: "rhoVertikal", label: "Rasio tulangan tegak ρl" },
    { kunci: "asUjungMm2", label: "Luas tulangan ujung tiap sisi", satuan: "mm²" },
    { kunci: "selimutMm", label: "Selimut beton", satuan: "mm" },
    { kunci: "dUtamaMm", label: "Ø tulangan", satuan: "mm" },
    { kunci: "jarakUtamaMm", label: "Jarak tulangan", satuan: "mm" },
    ...MEDAN_MUTU,
  ],
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
    /*
      KETAHANAN API — opsional, dan kosongnya BUKAN "tak perlu tahan api".

      Labelnya menyebut ANGKANYA yang lazim, bukan cuma nama besarannya:
      yang mengisi biasanya tak hafal tingkat mana yang diminta peraturan
      untuk bangunannya.
    */
    { kunci: "tingkatApiMenit", label: "Ketahanan api yang diminta (30/60/90/120/180/240) — kosongkan bila tak disyaratkan", satuan: "menit" },
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
    /*
      PENURUNAN — tiga medan opsional.

      Daya dukung izin di atas menahan KERUNTUHAN tanah, bukan penurunan.
      Pada lempung lunak, pondasi bisa lulus daya dukung dengan angka
      keamanan 3 dan tetap turun berlebihan — dan yang meretakkan bangunan
      justru selisih turun antar kolom, bukan turunnya sendiri.
    */
    { kunci: "jenisTanahPenurunan", label: "Jenis tanah untuk penurunan (pasir / lempung_kaku / lempung)" },
    { kunci: "nSptPenurunan", label: "N-SPT rata-rata di bawah telapak" },
    { kunci: "jarakKolomM", label: "Jarak ke kolom tetangga (untuk cek lantai miring)", satuan: "m" },
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

  /*
    ── BAJA

    Medan yang ditampilkan hanya yang BERUPA ANGKA TUNGGAL. Profil baja,
    daftar batang rangka, dan mutu adalah objek bersarang — ketiganya diisi
    lewat editor JSON di bawah form, dan contohnya sudah terisi lengkap.

    Alasannya bukan kemalasan: memilih profil semestinya lewat pencarian ke
    tabel `steel_profiles` (58 profil, tiap tipe bermedan berbeda), dan
    membuat pemilih itu setengah jadi lebih buruk daripada tak ada — orang
    akan mengira daftarnya lengkap padahal cuma sebagian. Ditandai sebagai
    pekerjaan berikutnya, bukan disamarkan.
  */
  baja_balok: [
    { kunci: "bentangM", label: "Bentang balok", satuan: "m" },
    { kunci: "jarakPengakuM", label: "Jarak pengaku lateral (0 = terpegang pelat)", satuan: "m" },
    { kunci: "muKnm", label: "Momen rencana Mu", satuan: "kNm" },
    { kunci: "vuKn", label: "Geser rencana Vu", satuan: "kN" },
    { kunci: "bebanLayanKnPerM", label: "Beban layan (untuk lendutan)", satuan: "kN/m" },
    { kunci: "batasLendutan", label: "Batas lendutan L/n (360 lantai, 240 atap)" },
  ],
  baja_kolom: [
    { kunci: "tinggiM", label: "Tinggi kolom", satuan: "m" },
    { kunci: "faktorK", label: "Faktor K (1,0 sendi | 0,65 jepit | 2,0 kantilever)" },
    { kunci: "puKn", label: "Beban tekan Pu", satuan: "kN" },
  ],
  baja_gording: [
    { kunci: "bentangM", label: "Bentang gording", satuan: "m" },
    { kunci: "kemiringanDerajat", label: "Kemiringan atap", satuan: "derajat" },
    { kunci: "bebanVertikalKnPerM", label: "Beban vertikal terfaktor", satuan: "kN/m" },
    { kunci: "bebanAnginKnPerM", label: "Beban angin (negatif = hisap)", satuan: "kN/m" },
    { kunci: "bebanLayanKnPerM", label: "Beban layan (untuk lendutan)", satuan: "kN/m" },
    { kunci: "jarakSagrodM", label: "Jarak sagrod (kosong = tanpa sagrod)", satuan: "m" },
  ],
  baja_bracing: [
    { kunci: "panjangM", label: "Panjang bracing", satuan: "m" },
    { kunci: "gayaKn", label: "Gaya (positif tarik, negatif tekan)", satuan: "kN" },
  ],
  baja_rangka: [],
  baja_base_plate: [
    { kunci: "panjangPelatMm", label: "Panjang pelat", satuan: "mm" },
    { kunci: "lebarPelatMm", label: "Lebar pelat", satuan: "mm" },
    { kunci: "tebalPelatMm", label: "Tebal pelat", satuan: "mm" },
    { kunci: "fcBetonMpa", label: "Mutu beton pondasi f'c", satuan: "MPa" },
    { kunci: "luasPondasiMm2", label: "Luas pondasi (kosong = tanpa pengekangan)", satuan: "mm2" },
    { kunci: "puKn", label: "Beban tekan Pu", satuan: "kN" },
    { kunci: "tuKn", label: "Gaya cabut Tu (angin/gempa)", satuan: "kN" },
  ],
  baja_angkur: [
    { kunci: "diameterMm", label: "Diameter angkur", satuan: "mm" },
    { kunci: "jumlahAngkur", label: "Jumlah angkur" },
    { kunci: "kedalamanMm", label: "Kedalaman tanam", satuan: "mm" },
    { kunci: "fcBetonMpa", label: "Mutu beton f'c", satuan: "MPa" },
    { kunci: "tuKn", label: "Gaya cabut Tu", satuan: "kN" },
    { kunci: "vuKn", label: "Gaya geser Vu", satuan: "kN" },
  ],
  baja_sambungan_baut: [
    { kunci: "diameterMm", label: "Diameter baut", satuan: "mm" },
    { kunci: "jumlahBaut", label: "Jumlah baut" },
    { kunci: "bidangGeser", label: "Bidang geser (1 tunggal, 2 ganda)" },
    { kunci: "tebalPelatMm", label: "Tebal pelat tertipis", satuan: "mm" },
    { kunci: "vuKn", label: "Gaya geser Vu", satuan: "kN" },
  ],
  baja_sambungan_las: [
    { kunci: "ukuranMm", label: "Ukuran kaki las", satuan: "mm" },
    { kunci: "panjangMm", label: "Panjang las efektif", satuan: "mm" },
    { kunci: "fuElektrodaMpa", label: "Kuat elektroda (E70XX = 490)", satuan: "MPa" },
    { kunci: "tebalPelatMm", label: "Tebal pelat tertipis", satuan: "mm" },
    { kunci: "vuKn", label: "Gaya Vu", satuan: "kN" },
  ],
  baja_interaksi: [
    { kunci: "panjangM", label: "Panjang batang", satuan: "m" },
    { kunci: "faktorK", label: "Faktor K" },
    { kunci: "puKn", label: "Beban tekan Pu", satuan: "kN" },
    { kunci: "muxKnm", label: "Momen sumbu kuat Mux", satuan: "kNm" },
    { kunci: "muyKnm", label: "Momen sumbu lemah Muy", satuan: "kNm" },
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
/*
  Profil & mutu contoh — angkanya dari tabel `steel_profiles` di basis.

  Ditulis sebagai konstanta, bukan diketik ulang di tiap contoh: tiga profil
  ini dipakai delapan kali, dan menyalinnya berarti delapan tempat yang bisa
  menyimpang saat angkanya diperbaiki.

  Ini CONTOH, bukan katalog. Pemilih profil yang membaca 58 baris
  `steel_profiles` belum ada — pengguna mengubahnya lewat editor JSON.
*/
/** Satu baris `steel_profiles` seperti dikirim `GET /cecep/steel-profiles`. */
interface ProfilBasis {
  id: string
  profile_type: string
  designation: string
  h_mm: number | string
  b_mm: number | string
  t1_mm: number | string
  t2_mm: number | string
  weight_kg_per_m: number | string
  standard_length_m: number | string
}

/**
 * Jenis yang inputnya memuat SATU profil di medan `profil`.
 *
 * `baja_rangka` sengaja TIDAK di sini: tiap batangnya punya profil sendiri,
 * jadi ia butuh pemilih per-batang — dan itu bentuk layar yang berbeda, bukan
 * satu dropdown. Memaksakannya ke pemilih tunggal akan menimpa profil seluruh
 * batang sekaligus, yang justru kebalikan dari yang dibutuhkan.
 */
const JENIS_BERPROFIL: ReadonlySet<string> = new Set([
  "baja_balok", "baja_kolom", "baja_gording", "baja_bracing",
  "baja_base_plate", "baja_interaksi",
]);

/** Ubah baris basis jadi bentuk yang dipakai modul analisa. */
function keProfilAnalisa(b: ProfilBasis) {
  return {
    designation: b.designation,
    profile_type: b.profile_type,
    hMm: Number(b.h_mm),
    bMm: Number(b.b_mm),
    t1Mm: Number(b.t1_mm),
    t2Mm: Number(b.t2_mm),
    beratKgPerM: Number(b.weight_kg_per_m),
    panjangStandarM: Number(b.standard_length_m),
  };
}

const PROFIL_WF200 = {
  designation: "200x100x5.5x8", profile_type: "WF",
  hMm: 200, bMm: 100, t1Mm: 5.5, t2Mm: 8,
  beratKgPerM: 21.3333, panjangStandarM: 12,
};
const PROFIL_CNP150 = {
  designation: "150x65x20x3.2", profile_type: "CNP",
  hMm: 150, bMm: 65, t1Mm: 3.2, t2Mm: 3.2,
  beratKgPerM: 8.01, panjangStandarM: 6,
};
const PROFIL_SIKU70 = {
  designation: "70x70x7", profile_type: "L",
  hMm: 70, bMm: 70, t1Mm: 7, t2Mm: 7,
  beratKgPerM: 7.38, panjangStandarM: 6,
};
const MUTU_BJ37 = { fyMpa: 240, fuMpa: 370 };
const MUTU_BAUT_A325 = { nama: "A325", fubMpa: 825 };

const CONTOH: Record<Jenis, Record<string, unknown>> = {
  balok: {
    bMm: 300, hMm: 520, panjangM: 6, selimutMm: 30, dUtamaMm: 16,
    nTarik: 5, nTekan: 2, dSengkangMm: 8, jarakSengkangMm: 150,
    mutu: { fcMpa: 25, fyMpa: 400 }, muKnm: 120, vuKn: 90,
    /* 120 menit — lazim untuk bangunan bertingkat. */
    tingkatApiMenit: 120,
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
  /*
    Contoh sloof rumah tinggal 1 lantai: 15/25 dengan dinding bata merah
    setinggi 3 m — ukuran yang paling sering dipakai, dan yang paling sering
    diperkecil tanpa hitungan.
  */
  sloof: {
    bMm: 150, hMm: 250, bentangM: 3, selimutMm: 30,
    dUtamaMm: 12, nBawah: 2, nAtas: 2,
    dSengkangMm: 8, jarakSengkangMm: 150,
    mutu: { fcMpa: 20, fyMpa: 400 },
    tinggiDindingM: 3, tebalDindingM: 0.15, jenisDinding: "bata_merah",
  },
  /*
    Contoh tangga rumah tinggal: tinggi antar lantai 3,2 m dengan optrede 175
    dan antrede 280 — kombinasi yang memenuhi Blondel dan lazim dipakai.
  */
  tangga: {
    tebalPelatMm: 150, lebarM: 1.2, tinggiM: 3.2,
    optredeMm: 175, antredeMm: 280, selimutMm: 20,
    dUtamaMm: 12, jarakUtamaMm: 150, dBagiMm: 8, jarakBagiMm: 200,
    mutu: { fcMpa: 25, fyMpa: 400 },
    pemakaian: "hunian", panjangBordesM: 0,
  },
  kolom_komposit: {
    jenis: "terbungkus", asBajaMm2: 6353, inersiaBajaMm4: 13400000,
    lebarBetonMm: 400, tinggiBetonMm: 400, panjangTekukM: 3.5,
    asTulanganMm2: 1256,
    mutuBaja: { fyMpa: 240 }, mutuBeton: { fcMpa: 30 },
    mutuTulangan: { fyMpa: 400 }, puKn: 3000,
  },
  bondek: {
    bentangM: 2.5, tebalTotalMm: 120, tinggiGelombangMm: 50, tebalBajaMm: 0.75,
    asBondekMm2PerM: 1300, inersiaBondekMm4PerM: 540000,
    mutuBondek: { fyMpa: 550 }, mutuBeton: { fcMpa: 25 },
    bebanHidupKpa: 2.5, bebanMatiTambahanKpa: 1.2, luasM2: 100,
    adaPenyanggaSementara: true,
  },
  baja_gusset: {
    tebalMm: 10, lebarSambunganMm: 150, panjangSambunganMm: 200,
    panjangBebasMm: 80, gayaKn: -300,
    mutu: { fyMpa: 240, fuMpa: 370 },
    agvMm2: 4000, anvMm2: 3000, antMm2: 1500,
  },
  baja_sambungan_momen: {
    tipe: "pelat_ujung", tinggiBalokMm: 400, tebalSayapMm: 13, lebarSayapMm: 200,
    muKnm: 150, vuKn: 80, inersiaBalokMm4: 237000000, bentangM: 6,
    kekakuanKnmPerRad: 200000, asBautTarikMm2: 1200, fuBautMpa: 800,
    mutu: { fyMpa: 240, fuMpa: 370 },
  },
  kuda_kuda_kayu: {
    kelas: "II", lebarMm: 60, tinggiMm: 120, panjangM: 3,
    gayaKn: -15, momenKnm: 0.5,
    durasi: "tetap", kadarAir: "kering",
    lebarTumpuanMm: 80, gayaTumpuKn: 12,
  },
  /*
    Contoh sambungan paku kuda-kuda kayu — dan angkanya sengaja diambil dari
    praktik lapangan yang biasa: paku 4,1 mm, delapan buah, jarak ke ujung
    70 mm. Yang memakai layar ini akan mengenali angkanya, lalu melihat
    pemeriksaan mana yang sebenarnya menahan.
  */
  sambungan_kayu: {
    alat: "paku", diameterMm: 4.1, jumlahAlat: 8,
    tebalUtamaMm: 60, tebalSisiMm: 30, penetrasiMm: 45,
    kelas: "II", durasi: "tetap", kadarAir: "kering",
    gayaKn: 6,
    jarakTepiSejajarMm: 70, jarakTepiTegakMm: 25, jarakAntarAlatMm: 45,
    /* Sudut tak berpengaruh pada paku, tetapi diisi supaya medannya terlihat. */
    sudutTerhadapSeratDerajat: 0,
  },
  sekrup_baja_ringan: {
    diameterMm: 4.8, jumlahSekrup: 4, tebal1Mm: 0.75, tebal2Mm: 1,
    fuMpa: 550, gayaGeserKn: 3, gayaTarikKn: 1.2, jarakTepiMm: 15,
  },
  baja_ringan: {
    profil: "C75_100", panjangM: 1.5, gayaKn: -4,
    jarakKudaKudaM: 1.2, lapisanGM2: 100, lingkungan: "biasa",
  },
  balok_t: {
    bwMm: 200, hMm: 400, hfMm: 120, bentangBersihM: 4, jarakAsAsM: 3,
    selimutMm: 30, dUtamaMm: 16, nTarik: 3, nAtas: 2,
    dSengkangMm: 8, jarakSengkangMm: 150,
    mutu: { fcMpa: 25, fyMpa: 400 },
    muPositifKnm: 60, muNegatifKnm: 40, vuKn: 70,
  },
  /*
    Contoh pondasi batu kali rumah tinggal — ukuran yang diwariskan
    turun-temurun (60/30/60), justru yang paling perlu diperiksa.
  */
  pondasi_menerus: {
    jenis: "batu_kali",
    lebarBawahM: 0.6, lebarAtasM: 0.3, tinggiM: 0.6,
    panjangM: 40, kedalamanM: 0.8,
    bebanKnPerM: 25, qaKnM2: 150, gammaTanahKnM3: 17,
    tebalPasirM: 0.05, tinggiAanstampingM: 0.2,
  },
  raft: {
    panjangM: 12, lebarM: 8, tebalMm: 400, bebanTotalKn: 4800,
    eksentrisitasXM: 0.5, eksentrisitasYM: 0.3, qaKnM2: 120,
    selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150,
    mutu: { fcMpa: 30, fyMpa: 400 }, bentangKolomM: 4,
  },
  dinding_penahan: {
    tinggiM: 3, tebalAtasM: 0.25, tebalBawahM: 0.4,
    panjangTelapakM: 2, tebalTelapakM: 0.4, kakiM: 0.5,
    gammaTanahKnM3: 18, phiDerajat: 30, kohesiKpa: 0, surchargeKpa: 0,
    qaKnM2: 200, panjangDindingM: 20,
    selimutMm: 50, dUtamaMm: 16, jarakUtamaMm: 150,
    mutu: { fcMpa: 25, fyMpa: 400 },
    /*
      PGA 0,3 g — lazim untuk Jawa & Sumatera. Diisi di contoh supaya
      pemeriksaan gempa langsung terlihat; tanpanya orang tak tahu
      pemeriksaan itu ada.
    */
    pgaG: 0.3,
  },
  dinding_geser: {
    panjangM: 4, tebalMm: 250, tinggiM: 12,
    vuKn: 800, muKnm: 6000, puKn: 1500,
    rhoHorizontal: 0.003, rhoVertikal: 0.003, asUjungMm2: 2000,
    selimutMm: 40, dUtamaMm: 13, jarakUtamaMm: 200,
    mutu: { fcMpa: 30, fyMpa: 400 },
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
    /*
      Lempung kaku N=15, jarak kolom 4 m — tanah yang lazim di perkotaan
      Jawa. Diisi supaya pemeriksaan penurunan langsung terlihat.
    */
    jenisTanahPenurunan: "lempung_kaku",
    nSptPenurunan: 15,
    jarakKolomM: 4,
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

  // -- BAJA. Profil & mutu terisi lengkap supaya bisa langsung dihitung.
  baja_balok: {
    profil: PROFIL_WF200, mutu: MUTU_BJ37,
    bentangM: 6, jarakPengakuM: 0,
    muKnm: 30, vuKn: 60, bebanLayanKnPerM: 3, batasLendutan: 360,
  },
  baja_kolom: {
    profil: PROFIL_WF200, mutu: MUTU_BJ37,
    tinggiM: 3, faktorK: 1.0, puKn: 200,
  },
  baja_gording: {
    profil: PROFIL_CNP150, mutu: MUTU_BJ37,
    bentangM: 4, kemiringanDerajat: 30,
    bebanVertikalKnPerM: 1.2, bebanAnginKnPerM: -0.5,
    bebanLayanKnPerM: 0.9, jarakSagrodM: 2, batasLendutan: 240,
  },
  baja_bracing: {
    profil: PROFIL_SIKU70, mutu: MUTU_BJ37,
    panjangM: 3, gayaKn: 40,
  },
  baja_rangka: {
    nama: "KK-1", mutu: MUTU_BJ37,
    batang: [
      { nama: "atas-1", profil: PROFIL_WF200, panjangM: 2, gayaKn: -120 },
      { nama: "bawah-1", profil: PROFIL_SIKU70, panjangM: 2, gayaKn: 100, gayaBalikKn: -20 },
      { nama: "diagonal-1", profil: PROFIL_SIKU70, panjangM: 1.5, gayaKn: -40 },
    ],
  },
  baja_base_plate: {
    profil: PROFIL_WF200, mutuPelat: MUTU_BJ37,
    panjangPelatMm: 350, lebarPelatMm: 350, tebalPelatMm: 30,
    fcBetonMpa: 25, puKn: 500,
  },
  baja_angkur: {
    diameterMm: 16, mutu: MUTU_BAUT_A325, jumlahAngkur: 4,
    kedalamanMm: 300, fcBetonMpa: 25, tuKn: 100, vuKn: 60,
  },
  baja_sambungan_baut: {
    diameterMm: 16, mutu: MUTU_BAUT_A325, jumlahBaut: 4, bidangGeser: 1,
    tebalPelatMm: 8, mutuPelat: MUTU_BJ37, vuKn: 150,
  },
  baja_sambungan_las: {
    ukuranMm: 6, panjangMm: 200, fuElektrodaMpa: 490,
    mutuPelat: MUTU_BJ37, tebalPelatMm: 10, vuKn: 100,
  },
  baja_interaksi: {
    profil: PROFIL_WF200, mutu: MUTU_BJ37,
    panjangM: 3.5, faktorK: 1.0, puKn: 100, muxKnm: 10,
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
    ══════════════════════════════════════════════════════════════════════════
    USULAN RAB — inilah alasan seluruh modul ini dibangun.

    Volume yang dihitung di layar ini selama ini berhenti di layar: estimator
    membacanya, lalu MENGETIK ULANG angkanya ke RAB. Begitu desainnya berubah,
    RAB tidak ikut berubah, dan tak ada satu pun galat yang memberi tahu.

    Panel ini memasangkan tiap volume dengan AHSP-nya dan mengirimkannya ke
    versi estimasi — yang menghitung harganya dari analisa × price book, lalu
    "Terapkan ke Proyek" memindahkannya ke RAB. Tak ada angka yang diketik dua
    kali.
    ══════════════════════════════════════════════════════════════════════════
  */
  const { data: usulanRab, muatUlang: muatUlangUsulan } = useData<MuatanUsulanRab>(
    projectId ? `/api/v1/projects/${projectId}/struktur/usulan-rab` : null);

  const { data: versiData } = useData<VersiEstimasi[] | { versions: VersiEstimasi[] }>(
    projectId ? "/api/v1/estimate-versions" : null);

  /*
    Hanya versi DRAFT milik proyek ini. Versi yang sudah disetujui menolak item
    baru di sisi API — menawarkannya di daftar cuma menghasilkan galat sesudah
    tombol ditekan.
  */
  const versiDraft = useMemo(() => {
    const semua = Array.isArray(versiData) ? versiData : (versiData?.versions ?? []);
    return semua.filter((v) => v.status === "draft" && v.project_id === projectId);
  }, [versiData, projectId]);

  const [versiPilih, setVersiPilih] = useState("");
  const [lokasiHarga, setLokasiHarga] = useState("");
  const [hasilKirim, setHasilKirim] = useState<HasilKirim | null>(null);
  const [kirimBuka, setKirimBuka] = useState(false);

  /*
    ══════════════════════════════════════════════════════════════════════════
    GAMBAR KERJA DITAMPILKAN — sebelumnya TIDAK, dan itu cacat besar.

    Fase penggambar membangun tujuh jenis gambar SVG (penampang persegi &
    lingkaran, potongan pelat, denah+potongan pondasi, potongan tiang berikut
    profil tanahnya, diagram P-M, bar bending schedule) — dan halaman ini
    tak menampilkan satu pun. Endpoint `?gambar=1` ada sejak awal dan tak
    pernah dipanggil.

    Kelas cacat yang sudah tercatat di repo ini: lapis cache dibangun 2026-08-04
    lalu tak dipakai satu halaman pun. Kode yang tak terpanggil sama dengan
    kode yang tak ada — dengan tambahan biaya perawatan.

    Dimuat HANYA saat elemen dibuka: SVG penampang + diagram P-M beberapa KB
    per elemen, dan daftar 200 elemen tak membutuhkannya.
    ══════════════════════════════════════════════════════════════════════════
  */
  const [dibuka, setDibuka] = useState<string | null>(null);
  const { data: detail, memuat: memuatDetail, galat: galatDetail } =
    useData<MuatanDetail>(dibuka ? `/api/v1/struktur/${dibuka}?gambar=1` : null);

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

  /*
    Teks JSON disimpan TERPISAH dari objek `input`.

    Kalau layar merender `JSON.stringify(input)` langsung, tiap ketikan yang
    belum sah akan dibuang dan kursor melompat — mengetik jadi mustahil.
    Teksnya milik pengguna; `input` hanya diperbarui saat teksnya bisa diurai.
  */
  const [teksJson, setTeksJson] = useState(() => JSON.stringify(CONTOH.balok, null, 2));
  const [galatJson, setGalatJson] = useState<string | null>(null);

  const gantiJenis = useCallback((j: Jenis) => {
    setJenis(j);
    setInput(CONTOH[j]);
    setTeksJson(JSON.stringify(CONTOH[j], null, 2));
    setGalatJson(null);
  }, []);

  const segarkan = useCallback(async () => {
    /*
      Usulan RAB IKUT dimuat ulang. Tanpa itu, mengubah desain lalu menghitung
      ulang menyegarkan volumenya sementara panel usulan tetap menampilkan
      kuantitas LAMA — dan yang terkirim ke estimasi adalah angka yang sudah
      tak berlaku. Persis kelas cacat yang modul ini dibangun untuk mencegah.
    */
    await Promise.all([muatUlang(), muatUlangVolume(), muatUlangUsulan()]);
  }, [muatUlang, muatUlangVolume, muatUlangUsulan]);

  const kirimKeEstimasi = useCallback(async (izinkanGanda: boolean) => {
    setGalatAksi(null); setPesan(null); setHasilKirim(null); setSibuk(true);
    try {
      const r = await api.post<HasilKirim>(
        `/api/v1/projects/${projectId}/struktur/kirim-ke-estimasi`,
        {
          estimateVersionId: versiPilih,
          location: lokasiHarga || null,
          bukFraction: 0,
          rounding: { mode: "none", step: 0 },
          izinkanGanda,
        });
      setHasilKirim(r.data);
      /*
        Yang MASUK dan yang DILEWATI sama-sama ditampilkan.

        "5 item terkirim" tanpa menyebut empat yang tidak adalah kekurangan
        anggaran yang tak terlihat — sisanya tetap terlihat lengkap. Dua
        angkanya diletakkan dalam satu kalimat supaya tak bisa dibaca separuh.
      */
      setPesan(
        `${r.data.jumlahMasuk} item masuk ke estimasi` +
        (r.data.jumlahDilewati ? `, ${r.data.jumlahDilewati} dilewati.` : "."),
      );
    } catch (e) {
      setGalatAksi(e instanceof Error ? e.message : "Gagal mengirim ke estimasi");
    } finally { setSibuk(false); }
  }, [projectId, versiPilih, lokasiHarga]);

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
                      <button type="button" style={btnGhost}
                        onClick={() => setDibuka(dibuka === el.id ? null : el.id)}
                        aria-expanded={dibuka === el.id}
                        aria-label={`Lihat detail & gambar kerja ${el.kode}`}>
                        <Eye size={13} aria-hidden="true" />
                      </button>
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

          {/* ── Detail elemen: pemeriksaan + GAMBAR KERJA ───────────── */}
          {dibuka && (
            <div style={GAYA_KARTU}>
              {memuatDetail ? (
                <p style={{ color: C.mid, fontSize: "var(--teks-label)", margin: 0 }}>
                  Memuat detail & gambar kerja…
                </p>
              ) : galatDetail ? (
                <p role="alert" style={{ color: C.onDangerBg, fontSize: "var(--teks-label)", margin: 0 }}>
                  Gagal memuat detail elemen ini.
                </p>
              ) : detail ? (
                <PanelDetail detail={detail} onTutup={() => setDibuka(null)} />
              ) : null}
            </div>
          )}

          {/* ── Rekap besi per diameter + batasnya ───────────────────── */}
          {volume && volume.rekap.besi.length > 0 && (
            <div style={GAYA_KARTU}>
              <h2 style={{
                fontSize: "var(--teks-badan)", fontWeight: 600,
                color: C.text, margin: "0 0 8px",
              }}>
                Kebutuhan besi &amp; baja profil
              </h2>
              <p style={{ fontSize: "var(--teks-delta)", color: C.mid, margin: "0 0 10px" }}>
                Inilah satuan yang dipesan — total kilogram saja tak bisa
                dibelanjakan karena tiap ukuran berbeda harganya, dan tulangan
                beton dibeli per lonjor sementara profil baja per batang.
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
                caption="Kebutuhan besi tulangan dan baja profil dirinci per ukuran dan perannya"
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
                    /*
                      ══════════════════════════════════════════════════════════
                      BAJA PROFIL BUKAN TULANGAN ULIR — dan versi sebelumnya
                      menampilkannya begitu.

                      Baris `besi` memuat dua hal berbeda: tulangan beton
                      (BjTP/BjTS, berdiameter) dan PROFIL baja (WF/H/CNP/INP,
                      berdesignation). Render lama hanya mengenal dua tipe
                      tulangan, jadi WF 200×100 muncul sebagai:

                          "Ulir (BjTS) · D200 · profil WF 200x100x5.5x8"

                      Besi ulir D200 tidak ada di pasar. Estimator yang membaca
                      tabel ini memesan barang yang tak bisa dibeli — dan
                      "D200" itu sebenarnya TINGGI profil, bukan diameter.

                      Terlihat dari MEMOTRET layarnya; 597 test struktur hijau
                      sepanjang waktu karena tak satu pun memeriksa bagaimana
                      barisnya DITAMPILKAN.
                      ══════════════════════════════════════════════════════════
                    */
                    kunci: "jenis", judul: "Jenis", kepalaBaris: true,
                    render: (b) => (
                      b.peran.startsWith("profil ")
                        ? "Baja profil"
                        : b.tipe === "BjTS" ? "Ulir (BjTS)" : "Polos (BjTP)"
                    ),
                  },
                  {
                    kunci: "diameter", judul: "Ukuran",
                    /*
                      Judulnya "Ukuran", bukan "Diameter": profil baja tak punya
                      diameter, dan kolom bernama Diameter yang berisi
                      designation profil adalah label yang berbohong.
                    */
                    render: (b) => (
                      b.peran.startsWith("profil ")
                        ? b.peran.replace(/^profil /, "")
                        : `${b.tipe === "BjTS" ? "D" : "Ø"}${b.diameterMm}`
                    ),
                  },
                  {
                    kunci: "peran", judul: "Peran",
                    /*
                      Untuk profil, `peran` berisi designation yang sudah
                      tampil di kolom Ukuran. Mengulanginya membuat dua kolom
                      berisi teks sama dan menyita ruang tanpa menambah apa pun.
                    */
                    render: (b) => (b.peran.startsWith("profil ") ? "profil baja" : b.peran),
                  },
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

          {/* ── Usulan item RAB dari volume ──────────────────────────── */}
          {usulanRab && usulanRab.jumlahUsulan > 0 && (
            <div style={GAYA_KARTU}>
              <h2 style={{
                fontSize: "var(--teks-badan)", fontWeight: 600,
                color: C.text, margin: "0 0 8px",
              }}>
                Item RAB dari volume ini
              </h2>
              <p style={{ fontSize: "var(--teks-delta)", color: C.mid, margin: "0 0 12px" }}>
                Tiap volume sudah dipasangkan dengan analisa harga (AHSP) yang
                cocok mutunya. Kirim ke versi estimasi, lalu tekan{" "}
                <strong>Terapkan ke Proyek</strong> di layar Estimasi supaya
                angkanya masuk RAB — tanpa mengetik ulang satu pun.
              </p>

              {/*
                SELISIH DENGAN DAFTAR DI ATAS DIJELASKAN — dan itu memang benar
                berbeda.

                Usulan ini dihitung ULANG dari input, jadi elemen yang belum
                dihitung ulang IKUT di sini. Daftar elemen dan ubin ringkasan
                di atas MENGECUALIKANNYA. Keduanya benar menurut definisinya
                sendiri.

                Tanpa kalimat ini, pembaca melihat "Belum dihitung / —" di
                tabel atas sementara panel ini menampilkan 0,94 m³ untuk elemen
                yang sama, lalu menyimpulkan salah satunya salah hitung —
                terlihat begitu halaman ini dipotret dengan satu elemen baru.

                Ditampilkan cuma saat bedanya BENAR-BENAR ada.
              */}
              {usulanRab.belumSegar > 0 && (
                <p role="note" style={{
                  fontSize: "var(--teks-delta)", color: C.onWarningBg,
                  background: C.warningBg, border: `1px solid ${C.warningBorder}`,
                  borderRadius: "var(--radius-dense)",
                  padding: "var(--pad-kartu)", margin: "0 0 10px",
                }}>
                  Angka di sini <strong>dihitung ulang dari input</strong>, jadi{" "}
                  {usulanRab.belumSegar} elemen yang belum dihitung ulang{" "}
                  <strong>ikut</strong> — sementara daftar elemen di atas
                  mengecualikannya. Itu sebabnya kedua angka berbeda. Tekan
                  “Hitung ulang semua” supaya keduanya bertemu.
                </p>
              )}

              <Tabel<UsulanRab>
                caption="Usulan item RAB beserta analisa harga yang dipasangkan"
                data={usulanRab.usulan}
                kunciBaris={(u) => `${u.jenis}-${u.uraian}`}
                kolom={[
                  {
                    kunci: "uraian", judul: "Pekerjaan", kepalaBaris: true,
                    render: (u) => (
                      <div>
                        <div>{u.uraian}</div>
                        <div style={{ fontSize: "var(--teks-delta)", color: C.mid }}>
                          dari {u.asal.map((a) => a.kodeElemen).join(", ")}
                        </div>
                      </div>
                    ),
                  },
                  {
                    kunci: "kuantitas", judul: "Volume", rata: "kanan",
                    render: (u) => `${formatAngka(u.kuantitas, 2)} ${u.satuan}`,
                  },
                  {
                    kunci: "beli", judul: "Dibeli", rata: "kanan",
                    /*
                      Satuan BELI ditampilkan berdampingan dengan satuan RAB.

                      RAB memakai kg; yang dipesan ke supplier batang atau
                      lembar. Estimator yang cuma melihat "132,58 kg" tetap
                      harus menghitung sendiri berapa batang — dan pembulatan
                      ke atas itulah selisih yang muncul di RAP.
                    */
                    render: (u) => u.beli ? (
                      /*
                        Ukuran per satuan ditulis di bawah angkanya, ASUMSINYA
                        jadi tooltip. Versi pertama menaruh seluruh paragraf
                        asumsi di sel ini — kalimat 40 kata di kolom selebar
                        80 px, yang terlihat begitu halamannya dipotret.
                      */
                      <span title={u.beli.asumsi}>
                        <span>{formatAngka(u.beli.kuantitas, 0)} {u.beli.satuan}</span>
                        <span style={{
                          display: "block",
                          fontSize: "var(--teks-delta)", color: C.mid,
                        }}>
                          {u.beli.ukuranPerSatuan}
                        </span>
                      </span>
                    ) : "—",
                  },
                  {
                    kunci: "assembly", judul: "Analisa harga (AHSP)",
                    render: (u) => u.assembly ? (
                      <div>
                        <div style={{ fontFamily: "var(--font-mono, monospace)" }}>
                          {u.assembly.code}
                        </div>
                        <div style={{ fontSize: "var(--teks-delta)", color: C.mid }}>
                          {u.assembly.name}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: C.onWarningBg }}>
                        belum ada AHSP yang cocok
                      </span>
                    ),
                  },
                ]}
              />

              {/*
                Yang TAK punya AHSP disebutkan lagi di luar tabel.

                Baris bertanda di tengah tabel panjang mudah terlewat, dan yang
                terlewat di sini adalah item RAB yang hilang — kekurangan
                anggaran yang tak terlihat karena sisanya tampak lengkap.
              */}
              {usulanRab.tanpaAssembly.length > 0 && (
                <div role="note" style={{
                  fontSize: "var(--teks-delta)", color: C.onWarningBg,
                  background: C.warningBg, border: `1px solid ${C.warningBorder}`,
                  borderRadius: "var(--radius-dense)",
                  padding: "var(--pad-kartu)", margin: "10px 0 0",
                }}>
                  <strong>{usulanRab.tanpaAssembly.length} pekerjaan belum punya
                  analisa harga</strong> dan tidak akan ikut terkirim:{" "}
                  {usulanRab.tanpaAssembly.map((t) => t.uraian).join("; ")}.
                  Tambahkan AHSP-nya lebih dulu, atau masukkan manual di layar
                  Estimasi.
                </div>
              )}

              {/*
                CATATAN BATAS SENGAJA TIDAK DIULANG DI SINI.

                Kartu "Kebutuhan besi per diameter" di atas sudah menampilkan
                daftar yang sama persis, di bawah judul yang menjelaskan
                maksudnya ("Yang BELUM termasuk dalam angka di atas"). Diukur
                dari tangkapan layar: kelima barisnya muncul dua kali dalam
                satu layar, dan salinan keduanya memakan ruang lebih besar
                daripada tabel yang seharusnya jadi isi panel ini.

                Teks yang diulang tidak dibaca dua kali — ia membuat pembaca
                berhenti membaca. `usulanRab.catatan` tetap dipulangkan API
                supaya pemakai lain (ekspor, API pihak ketiga) tak kehilangan
                keterangannya.
              */}

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button type="button" style={mati(btnPrimary, sibuk)} disabled={sibuk}
                  onClick={() => { setHasilKirim(null); setKirimBuka(true); }}>
                  <Boxes size={14} aria-hidden="true" /> Kirim ke estimasi
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Kirim usulan ke versi estimasi ───────────────────────────── */}
      {kirimBuka && (
        <Modal title="Kirim item RAB ke estimasi" onClose={() => setKirimBuka(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            {versiDraft.length === 0 ? (
              /*
                Tak ada versi draft = tak ada yang bisa dituju. Dikatakan APA
                yang harus dilakukan, bukan cuma bahwa daftarnya kosong —
                daftar kosong tanpa jalan keluar membuat orang menyangka
                fiturnya rusak.
              */
              <p style={{ fontSize: "var(--teks-delta)", color: C.mid, margin: 0 }}>
                Proyek ini belum punya versi estimasi berstatus <strong>draft</strong>.
                Buat satu lebih dulu di layar <strong>Estimasi</strong> — versi
                yang sudah disetujui sengaja menolak item baru, supaya penawaran
                yang sudah dikirim tak berubah diam-diam.
              </p>
            ) : (
              <>
                <Isian id="k-versi" label="Versi estimasi tujuan" wajib>
                  <PilihanIsian id="k-versi" value={versiPilih} style={{ width: "100%" }}
                    onChange={(e) => setVersiPilih(e.target.value)}>
                    <option value="">— pilih versi —</option>
                    {versiDraft.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.scenario_name ? `${v.scenario_name} — ` : ""}versi {v.version_number} (draft)
                      </option>
                    ))}
                  </PilihanIsian>
                </Isian>

                <Isian
                  id="k-lokasi"
                  label="Lokasi harga"
                  bantuan="Kosongkan bila price book memakai harga umum. Harga berlokasi sengaja tak dipakai saat lokasi tak diisi — memakai harga daerah lain adalah kesalahan yang tak meninggalkan jejak."
                >
                  <TeksIsian id="k-lokasi" value={lokasiHarga} style={{ width: "100%" }}
                    placeholder="mis. Kabupaten Bandung"
                    onChange={(e) => setLokasiHarga(e.target.value)} />
                </Isian>

                {hasilKirim && (
                  <div role="status" style={{
                    fontSize: "var(--teks-delta)",
                    background: C.successBg ?? C.warningBg,
                    border: `1px solid ${C.successBorder ?? C.warningBorder}`,
                    borderRadius: "var(--radius-dense)",
                    padding: "var(--pad-kartu)",
                  }}>
                    <div><strong>{hasilKirim.jumlahMasuk} item masuk</strong>
                      {hasilKirim.jumlahDilewati > 0 && <>, {hasilKirim.jumlahDilewati} dilewati</>}.
                    </div>
                    {hasilKirim.dilewati.length > 0 && (
                      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                        {hasilKirim.dilewati.map((d) => (
                          <li key={d.uraian}>{d.uraian} — {d.alasan}</li>
                        ))}
                      </ul>
                    )}
                    {hasilKirim.jumlahMasuk > 0 && (
                      <p style={{ margin: "8px 0 0" }}>{hasilKirim.langkahBerikut}</p>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" disabled={sibuk || !versiPilih}
                    style={mati(btnPrimary, sibuk || !versiPilih)}
                    onClick={() => void kirimKeEstimasi(false)}>
                    Kirim
                  </button>
                  {/*
                    Tombol kedua muncul HANYA sesudah ada yang ditahan sebagai
                    duplikat. Menampilkannya sejak awal menjadikan "kirim dua
                    kali" pilihan sejajar — padahal RAB berlipat dua adalah
                    kesalahan, bukan pilihan.
                  */}
                  {hasilKirim?.dilewati.some((d) => /sudah pernah dikirim/i.test(d.alasan)) && (
                    <button type="button" disabled={sibuk}
                      style={mati(btnGhost, sibuk)}
                      onClick={() => void kirimKeEstimasi(true)}>
                      Kirim lagi sebagai baris baru
                    </button>
                  )}
                  <button type="button" style={btnGhost} onClick={() => setKirimBuka(false)}>
                    Tutup
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ── Form tambah elemen ──────────────────────────────────────── */}
      {formBuka && (
        <Modal title="Tambah elemen struktur" onClose={() => setFormBuka(false)}>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
              <Isian id="f-jenis" label="Jenis elemen" wajib>
                <PilihanIsian id="f-jenis" value={jenis} style={{ width: "100%" }}
                  onChange={(e) => gantiJenis(e.target.value as Jenis)}>
                  {/*
                    Dikelompokkan BETON vs BAJA lewat <optgroup>.

                    Tujuh belas jenis dalam satu daftar datar membuat orang
                    harus membaca semuanya untuk menemukan yang dicari — dan
                    "Balok" serta "Balok baja" berdampingan tanpa penanda
                    mudah tertukar. Salah pilih di antara keduanya
                    menghasilkan verdict untuk bahan yang salah.
                  */}
                  {KELOMPOK_JENIS.map((k) => (
                    <optgroup key={k.label} label={k.label}>
                      {k.jenis.map((j) => (
                        <option key={j} value={j}>{NAMA_JENIS[j]}</option>
                      ))}
                    </optgroup>
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

            {/*
              PEMILIH PROFIL — hanya untuk jenis yang inputnya memuat SATU profil.

              `baja_rangka` dikecualikan: tiap batangnya punya profil sendiri,
              dan satu dropdown akan menimpa seluruhnya sekaligus. Rangka tetap
              memakai editor JSON sampai ada pemilih per-batang.
            */}
            {JENIS_BERPROFIL.has(jenis) && (
              <PemilihProfil
                nilai={input.profil as Record<string, unknown> | undefined}
                onPilih={(pr) => {
                  const baru = { ...input, profil: pr };
                  setInput(baru);
                  setTeksJson(JSON.stringify(baru, null, 2));
                  setGalatJson(null);
                }}
              />
            )}

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
                    onChange={(e) => {
                      /*
                        Isian angka dan editor JSON menyunting objek yang SAMA.
                        Keduanya harus disegarkan bersama — kalau tidak, yang
                        satu menimpa yang lain saat disimpan, dan pengguna tak
                        pernah tahu suntingannya hilang.
                      */
                      const baru = tulisMedan(input, m.kunci, e.target.value);
                      setInput(baru);
                      setTeksJson(JSON.stringify(baru, null, 2));
                      setGalatJson(null);
                    }}
                  />
                </Isian>
              ))}
            </div>

            {/*
              ══════════════════════════════════════════════════════════════
              EDITOR JSON untuk medan BERSARANG.

              Profil baja, mutu, dan daftar batang rangka adalah objek — tak
              bisa diisi lewat kotak angka. Ditampilkan apa adanya sebagai
              JSON, bukan disembunyikan: yang tersembunyi tak bisa diperbaiki
              pengguna, dan contoh yang selalu dipakai apa adanya menghasilkan
              seluruh proyek memakai WF 200.

              PROFIL kini punya pemilihnya sendiri (`PemilihProfil`, membaca 82
              baris `steel_profiles`). Yang tersisa di sini: mutu baja, dan
              daftar batang rangka yang butuh pemilih PER-BATANG — bentuk layar
              yang berbeda, dan belum ada.
              ══════════════════════════════════════════════════════════════
            */}
            {MEDAN[jenis].length < Object.keys(CONTOH[jenis]).length && (
              <Isian
                id="f-json"
                label="Profil, mutu, & daftar batang (JSON)"
                bantuan={
                  galatJson
                    ? undefined
                    : JENIS_BERPROFIL.has(jenis)
                      ? "Mutu baja dan medan lain yang berupa objek disunting di sini. "
                        + "Profil sudah punya pemilihnya sendiri di atas."
                      : "Daftar batang rangka belum punya pemilih per-batang — sunting "
                        + "di sini. Angkanya sudah terisi contoh yang lulus analisa."
                }
                galat={galatJson}
              >
                <TeksIsian
                  id="f-json"
                  value={teksJson}
                  rows={8}
                  style={{ width: "100%", fontFamily: "var(--font-mono, monospace)", fontSize: 12 }}
                  onChange={(e) => {
                    const t = e.target.value;
                    setTeksJson(t);
                    /*
                      Diurai SETIAP ketikan, dan galatnya ditampilkan seketika
                      — bukan saat menekan Simpan. JSON yang rusak baru
                      ketahuan di akhir berarti pengguna kehilangan seluruh
                      suntingannya kalau ia menutup form.
                    */
                    try {
                      const objek = JSON.parse(t) as Record<string, unknown>;
                      setInput(objek);
                      setGalatJson(null);
                    } catch (err) {
                      setGalatJson(
                        `JSON belum sah: ${(err as Error).message}. `
                        + "Isian angka di atas tetap tersimpan.",
                      );
                    }
                  }}
                />
              </Isian>
            )}

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

/**
 * Pemilih profil baja dari tabel `steel_profiles`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * KENAPA INI MENGGANTIKAN EDITOR JSON UNTUK MEDAN `profil`
 *
 * Sebelum ini profil diisi lewat JSON mentah, dengan catatan di layar bahwa itu
 * sementara. Yang membuatnya benar-benar bermasalah bukan bentuknya, melainkan
 * akibatnya: contoh WF 200 selalu dipakai apa adanya, sehingga SELURUH proyek
 * dihitung memakai profil yang sama — dan angka yang dihasilkan terlihat wajar
 * karena WF 200 memang profil yang wajar.
 *
 * Basis sudah punya 82 profil (23 WF, 9 H, 13 CNP, 11 INP, 26 siku) lewat
 * `GET /cecep/steel-profiles`. Yang kurang cuma layarnya.
 *
 * ── Kenapa dimensi ikut ditampilkan, bukan cuma nama
 *
 * "WF 200x100x5.5x8" dan "WF 198x99x4.5x7" berdampingan di daftar, berbeda
 * 2 mm, dan berat per meternya berbeda 17%. Yang memilih dari nama saja mudah
 * mengambil yang salah — berat per meter ditampilkan karena itulah yang
 * langsung jadi rupiah.
 * ══════════════════════════════════════════════════════════════════════════════
 */
function PemilihProfil({
  nilai, onPilih,
}: {
  nilai: Record<string, unknown> | undefined
  onPilih: (p: ReturnType<typeof keProfilAnalisa>) => void
}) {
  const [tipe, setTipe] = useState<string>(
    typeof nilai?.profile_type === "string" ? nilai.profile_type : "WF",
  );

  const { data, memuat, galat } = useData<{ data: ProfilBasis[] }>(
    `/api/v1/cecep/steel-profiles?type=${tipe}&limit=200`,
  );
  const daftar = useMemo(() => data?.data ?? [], [data]);

  const terpilih = typeof nilai?.designation === "string" ? nilai.designation : "";

  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "160px 1fr" }}>
      <Isian id="f-profil-tipe" label="Jenis profil">
        <PilihanIsian
          id="f-profil-tipe"
          value={tipe}
          style={{ width: "100%" }}
          onChange={(e) => setTipe(e.target.value)}
        >
          <option value="WF">WF</option>
          <option value="H">H-beam</option>
          <option value="CNP">CNP (kanal C)</option>
          <option value="INP">INP (kanal I)</option>
          <option value="L">Siku</option>
        </PilihanIsian>
      </Isian>

      <Isian
        id="f-profil"
        label="Profil"
        bantuan={
          galat
            ? undefined
            : memuat
              ? "Memuat katalog profil…"
              : `${daftar.length} profil ${tipe} di katalog. Berat per meter langsung jadi rupiah — periksa sebelum memilih.`
        }
        galat={galat ? "Gagal memuat katalog profil baja." : undefined}
      >
        <PilihanIsian
          id="f-profil"
          value={terpilih}
          style={{ width: "100%" }}
          onChange={(e) => {
            const b = daftar.find((x) => x.designation === e.target.value);
            if (b) onPilih(keProfilAnalisa(b));
          }}
        >
          {/*
            Pilihan kosong hanya muncul bila belum ada yang terpilih — tanpa
            itu, daftar tampak punya baris kosong yang bisa dipilih dan
            menghasilkan input tanpa profil.
          */}
          {!terpilih && <option value="">— pilih profil —</option>}
          {daftar.map((b) => (
            <option key={b.id} value={b.designation}>
              {b.profile_type} {b.designation} — {Number(b.weight_kg_per_m).toFixed(2)} kg/m
              {" · batang "}{Number(b.standard_length_m)} m
            </option>
          ))}
        </PilihanIsian>
      </Isian>
    </div>
  );
}

/**
 * Detail satu elemen: verdict ber-ANGKA + gambar kerjanya.
 *
 * ── Kenapa verdict-nya menampilkan angka, bukan cuma "aman"
 *
 * Sama dengan alasan `Periksa` menyimpan `nilai` & `syarat` di lapisan
 * perhitungan: verdict tanpa angka tak bisa ditanya "dari mana?", dan yang tak
 * bisa ditanya akan dipercaya bulat-bulat — termasuk saat ia salah. Rasio
 * ditampilkan karena itulah yang memberi tahu SEBERAPA dekat ke batas: 0,98
 * dan 0,42 sama-sama "aman", tetapi cuma satu yang aman kalau bebannya naik.
 *
 * ── Kenapa SVG ditanam langsung, bukan lewat <img>
 *
 * `<img src="data:...">` membuat gambar tak bisa dipilih, tak bisa diperbesar
 * tanpa buram, dan tak terbaca pembaca layar. SVG yang ditanam membawa
 * `role="img"` + `aria-label` dari penggambarnya sendiri.
 *
 * Isinya dibuat SEPENUHNYA oleh `lib/struktur-gambar.ts` dari angka — tak ada
 * teks pengguna yang masuk tanpa lewat `amankanTeks()`.
 */
function PanelDetail({ detail, onTutup }: { detail: MuatanDetail; onTutup: () => void }) {
  const h = detail.hasil ?? {};
  const periksa = h.periksa ?? h.dasar?.periksa ?? [];
  const catatan = h.catatan ?? h.dasar?.catatan ?? [];
  /*
    `meteran` DIKELUARKAN dari galeri gambar benda: ia sudah ditampilkan di
    atas bersama ringkasan awam. Tanpa penyaringan ini ia muncul dua kali —
    sekali sebagai penjelasan, sekali sebagai "gambar kerja" yang bukan.
  */
  const gambar = Object.entries(detail.gambar ?? {})
    .filter(([k]) => !k.endsWith("Gagal") && k !== "meteran");
  const gagal = Object.entries(detail.gambar ?? {}).filter(([k]) => k.endsWith("Gagal"));

  /*
    Judul tiap jenis gambar. Yang TAK terdaftar jatuh ke kunci mentahnya
    (`?? nama` di bawah), dan kunci mentah di layar terbaca seperti cacat —
    "pola", "tampak", "denah" bukan kalimat yang ditulis untuk dibaca orang.

    Ditambah 2026-08-19 bersama sepuluh gambar terakhir: sebelum itu hanya
    empat kunci yang punya judul, sementara gambar sudah terbit untuk 32 jenis.
  */
  const JUDUL_GAMBAR: Record<string, string> = {
    penampang: "Penampang",
    potongan: "Potongan",
    pondasi: "Denah & potongan",
    diagramPM: "Diagram interaksi P-M",
    denah: "Denah",
    tampak: "Tampak",
    pola: "Pola sambungan",
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ fontSize: "var(--teks-badan)", fontWeight: 600, color: C.text, margin: 0 }}>
          {detail.elemen.kode}
          {detail.elemen.nama && <span style={{ color: C.mid, fontWeight: 400 }}> — {detail.elemen.nama}</span>}
        </h2>
        <button type="button" style={btnGhost} onClick={onTutup} aria-label="Tutup detail">
          <X size={13} aria-hidden="true" /> Tutup
        </button>
      </div>

      {/*
        ══════════════════════════════════════════════════════════════════════
        LAPISAN AWAM DITAMPILKAN LEBIH DULU, tabel teknis di bawahnya.

        Bukan karena yang teknis kurang penting — melainkan karena yang
        MEMUTUSKAN membangun sering bukan insinyur. Kalau yang pertama terlihat
        adalah "φMn = 0.9 · As · fy · (d − a/2)", pemilik proyek berhenti
        membaca di situ, dan verdict merah pun ikut terlewat.

        Keduanya turunan dari verdict yang SAMA — jadi tak mungkin berselisih,
        dan insinyur tetap punya angkanya untuk diperiksa ulang.
        ══════════════════════════════════════════════════════════════════════
      */}
      {detail.awam && (
        <div style={{
          padding: "var(--pad-kartu)",
          borderRadius: "var(--radius-dense)",
          border: `1px solid ${
            detail.awam.ringkasan.tingkat === "bahaya" ? C.dangerBorder
              : detail.awam.ringkasan.tingkat === "mepet" ? C.warningBorder
              : C.successBorder}`,
          background:
            detail.awam.ringkasan.tingkat === "bahaya" ? C.dangerBg
              : detail.awam.ringkasan.tingkat === "mepet" ? C.warningBg
              : C.successBg,
          color:
            detail.awam.ringkasan.tingkat === "bahaya" ? C.onDangerBg
              : detail.awam.ringkasan.tingkat === "mepet" ? C.onWarningBg
              : C.onSuccessBg,
        }}>
          <p style={{ margin: 0, fontSize: "var(--teks-badan)", fontWeight: 600 }}>
            {detail.awam.ringkasan.kalimat}
          </p>
        </div>
      )}

      {/* Meteran: seberapa terpakai kapasitasnya, terbaca tanpa angka teknis. */}
      {detail.gambar?.meteran && (
        <div
          style={{
            background: "var(--kertas-gambar)", border: `1px solid ${C.border}`,
            borderRadius: "var(--radius-dense)", padding: 10, overflowX: "auto",
          }}
          dangerouslySetInnerHTML={{ __html: detail.gambar.meteran }}
        />
      )}

      {/*
        Penjelasan per pemeriksaan yang BERMASALAH saja.

        Menampilkan kelimanya sekaligus membuat yang penting tenggelam. Yang
        aman-berjarak tak butuh penjelasan; yang merah dan mepet justru harus
        dibaca sampai bagian TINDAKAN-nya.
      */}
      {detail.awam?.pemeriksaan
        .filter((pp) => pp.tingkat !== "aman" && pp.penjelasan)
        .map((pp) => (
          <details key={pp.nama} open={pp.tingkat === "bahaya"} style={{
            border: `1px solid ${pp.tingkat === "bahaya" ? C.dangerBorder : C.warningBorder}`,
            borderRadius: "var(--radius-dense)",
            padding: "var(--pad-kartu)",
            background: pp.tingkat === "bahaya" ? C.dangerBg : C.warningBg,
            color: pp.tingkat === "bahaya" ? C.onDangerBg : C.onWarningBg,
            fontSize: "var(--teks-delta)",
          }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>
              {pp.penjelasan!.judul} — terpakai {pp.persenTerpakai}%
              {pp.tingkat === "bahaya" ? " (melewati batas)" : " (mepet)"}
            </summary>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <p style={{ margin: 0 }}><strong>Apa ini:</strong> {pp.penjelasan!.apa}</p>
              <p style={{ margin: 0 }}><strong>Kalau dibiarkan:</strong> {pp.penjelasan!.risiko}</p>
              <p style={{ margin: 0 }}><strong>Yang bisa dilakukan:</strong> {pp.penjelasan!.tindakan}</p>
            </div>
          </details>
        ))}

      {periksa.length > 0 && (
        <details style={{ border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)", padding: "var(--pad-kartu)" }}>
          <summary style={{
            cursor: "pointer", fontWeight: 600, fontSize: "var(--teks-delta)", color: C.mid,
          }}>
            Angka teknis & rumusnya — untuk diperiksa ulang insinyur
          </summary>
          <div style={{ marginTop: 10 }}>
        <Tabel<Periksa>
          caption={`Hasil pemeriksaan struktural elemen ${detail.elemen.kode}`}
          data={periksa}
          kunciBaris={(p) => p.nama}
          tandaiBaris={(p) => (p.aman ? undefined : C.dangerBg)}
          kolom={[
            { kunci: "nama", judul: "Pemeriksaan", kepalaBaris: true, render: (p) => p.nama },
            {
              kunci: "nilai", judul: "Kapasitas", rata: "kanan",
              render: (p) => `${formatAngka(p.nilai, 2)} ${p.satuan}`,
            },
            {
              kunci: "syarat", judul: "Tuntutan", rata: "kanan",
              render: (p) => `${formatAngka(p.syarat, 2)} ${p.satuan}`,
            },
            {
              // Rasio > 1 berarti lewat batas — diberi warna, bukan cuma angka.
              kunci: "rasio", judul: "Rasio", rata: "kanan",
              render: (p) => (
                <span style={{ color: p.rasio > 1 ? C.danger : p.rasio > 0.9 ? C.warning : C.text, fontWeight: 600 }}>
                  {formatAngka(p.rasio, 3)}
                </span>
              ),
            },
            {
              kunci: "aman", judul: "Verdict",
              render: (p) => (p.aman
                ? <span style={{ color: C.success, fontWeight: 600 }}>Aman</span>
                : <span style={{ color: C.danger, fontWeight: 600 }}>Tidak aman</span>),
            },
          ]}
        />
          </div>
        </details>
      )}

      {gambar.length > 0 && (
        <div style={{
          display: "grid", gap: 14,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        }}>
          {gambar.map(([nama, svg]) => (
            <figure key={nama} style={{ margin: 0 }}>
              <figcaption style={{
                fontSize: "var(--teks-delta)", fontWeight: 600,
                color: C.mid, marginBottom: 6,
              }}>
                {JUDUL_GAMBAR[nama] ?? nama}
              </figcaption>
              {/*
                Latar PUTIH dipaku, bukan mengikuti tema.

                Gambar teknik memakai garis gelap di atas kertas putih; di mode
                gelap, latar tema membuat garis hitamnya nyaris hilang. Ini satu
                dari sedikit tempat yang benar untuk memaku warna: yang
                ditampilkan adalah dokumen cetak, bukan elemen antarmuka.
              */}
              <div
                style={{
                  background: "var(--kertas-gambar)", border: `1px solid ${C.border}`,
                  borderRadius: "var(--radius-dense)", padding: 10,
                  overflowX: "auto",
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </figure>
          ))}
        </div>
      )}

      {gagal.length > 0 && (
        <p role="note" style={{
          fontSize: "var(--teks-delta)", color: C.onWarningBg,
          background: C.warningBg, border: `1px solid ${C.warningBorder}`,
          borderRadius: "var(--radius-dense)", padding: "var(--pad-kartu)", margin: 0,
        }}>
          {gagal.map(([, pesan]) => pesan).join(" · ")}
        </p>
      )}

      {catatan.length > 0 && (
        <div role="note" style={{
          fontSize: "var(--teks-delta)", color: C.onInfoBg,
          background: C.infoBg, border: `1px solid ${C.infoBorder}`,
          borderRadius: "var(--radius-dense)", padding: "var(--pad-kartu)",
        }}>
          <strong style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
            <Info size={14} aria-hidden="true" /> Asumsi & batas
          </strong>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
            {catatan.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
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
