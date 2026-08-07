// ============================================================================
// REKONSILIASI BANK — mencocokkan buku kas dengan rekening koran.
//
// ══════════════════════════════════════════════════════════════════════════
// APA YANG DIJAWAB BERKAS INI
// ══════════════════════════════════════════════════════════════════════════
//
// Tiap akhir bulan orang keuangan menaruh koran di sebelah buku kas dan
// mencocokkan baris demi baris. Yang dicari BUKAN yang cocok — melainkan yang
// tidak:
//
//   • setoran yang sudah dicatat tapi belum masuk rekening (dalam perjalanan)
//   • cek/transfer yang sudah dicatat tapi belum dicairkan penerimanya
//   • biaya admin & jasa giro yang tak pernah dicatat siapa pun
//   • yang paling mahal: uang KELUAR dari rekening tanpa ada catatannya
//
// ── Kenapa fungsi murni, bukan query
//
// Ini aritmetika uang. Pola repo ini (lihat `varians-cost-code.ts`,
// `laporan-keuangan.ts`): perhitungan yang menentukan angka finansial hidup
// sebagai fungsi tanpa DB, supaya bisa dikunci test tanpa menyiapkan basis —
// dan supaya kesalahannya ketahuan sebagai test merah, bukan sebagai angka
// yang salah di layar.
//
// ── NUMERIC datang sebagai STRING
//
// Postgres mengirim `numeric` sebagai string, dan `+` pada string adalah
// PENGGABUNGAN, bukan penjumlahan: "1000" + "2000" = "10002000". Seluruh
// nominal di berkas ini dilewatkan `angka()` lebih dulu. Ini bukan kehati-
// hatian berlebihan — cacat kelas ini sudah pernah terjadi di repo ini.
// ============================================================================

/** Ambang toleransi pencocokan longgar, dalam hari. */
export const TOLERANSI_HARI = 3;

export type SumberBuku = 'payments' | 'supplier_payments' | 'cash_transfers';

export interface BarisKoran {
  id: string;
  tanggal: string;
  keterangan: string;
  /** Uang KELUAR dari rekening. */
  debit: number | string;
  /** Uang MASUK ke rekening. */
  kredit: number | string;
  sudah_cocok?: boolean;
}

export interface TransaksiBuku {
  id: string;
  sumber: SumberBuku;
  tanggal: string;
  /** Positif = masuk, negatif = keluar. Arah ditentukan pemanggil dari sumbernya. */
  nominal: number | string;
  keterangan: string;
  sudah_cocok?: boolean;
}

export interface UsulCocok {
  baris_id: string;
  sumber: SumberBuku;
  sumber_id: string;
  /** `persis` = nominal & tanggal sama. `dekat` = nominal sama, tanggal beda ≤ TOLERANSI_HARI. */
  keyakinan: 'persis' | 'dekat';
  selisih_hari: number;
}

export interface Penyesuaian {
  jenis: string;
  nominal: number | string;
}

export interface LaporanRekonsiliasi {
  saldo_bank: number;
  setoran_dalam_perjalanan: number;
  cek_beredar: number;
  penyesuaian: number;
  /** Saldo bank disesuaikan — inilah yang harus sama dengan saldo buku. */
  saldo_buku_seharusnya: number;
  saldo_buku: number;
  /** Nol berarti rekonsiliasi tuntas. Selisih apa pun adalah pertanyaan terbuka. */
  selisih: number;
  tuntas: boolean;
  baris_belum_cocok: number;
  transaksi_belum_cocok: number;
}

/** Postgres NUMERIC tiba sebagai string; `+` pada string menggabung, bukan menjumlah. */
function angka(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function hari(a: string, b: string): number {
  const ms = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.round(ms / 86_400_000);
}

/**
 * Nilai bersih satu baris koran dari sudut pandang BUKU.
 *
 * Koran ditulis dari sudut pandang bank: "kredit" berarti uang masuk ke
 * rekening kita. Buku kas kita menulisnya sebagai penerimaan (positif). Kalau
 * kedua sudut pandang ini tertukar, seluruh pencocokan akan gagal dengan
 * gejala "tak ada yang cocok" — dan orang akan menyimpulkan datanya salah,
 * bukan tandanya.
 */
export function nilaiBaris(b: BarisKoran): number {
  return angka(b.kredit) - angka(b.debit);
}

/**
 * Usulkan pencocokan otomatis.
 *
 * Dua tahap, dan urutannya penting:
 *
 *   1. PERSIS  — nominal sama DAN tanggal sama. Diambil lebih dulu supaya
 *      pasangan yang jelas tak "dicuri" oleh kecocokan longgar.
 *   2. DEKAT   — nominal sama, tanggal beda ≤ TOLERANSI_HARI. Transfer antar
 *      bank memang butuh 1–3 hari kerja untuk muncul di koran; menuntut
 *      tanggal persis akan menyisakan hampir semuanya tak cocok.
 *
 * Toleransi hanya pada TANGGAL, tak pernah pada NOMINAL. Dua transaksi
 * bernominal mirip adalah dua transaksi berbeda — mencocokkannya "karena
 * dekat" menyembunyikan selisih yang justru sedang dicari.
 *
 * Tak ada usul yang memakai baris atau transaksi yang sudah terpakai: basis
 * menolaknya lewat UNIQUE, tapi mengusulkannya berarti menyuruh orang mengklik
 * sesuatu yang pasti gagal.
 */
export function usulkanPencocokan(
  koran: BarisKoran[],
  buku: TransaksiBuku[],
): UsulCocok[] {
  const barisTerpakai = new Set<string>();
  const bukuTerpakai = new Set<string>();
  const usul: UsulCocok[] = [];

  const bebasBaris = koran.filter((b) => !b.sudah_cocok);
  const bebasBuku = buku.filter((t) => !t.sudah_cocok);

  for (const tahap of ['persis', 'dekat'] as const) {
    for (const b of bebasBaris) {
      if (barisTerpakai.has(b.id)) continue;
      const nilai = nilaiBaris(b);

      for (const t of bebasBuku) {
        if (bukuTerpakai.has(t.id)) continue;
        // Nominal WAJIB sama persis. Lihat catatan di atas.
        if (angka(t.nominal) !== nilai) continue;

        const jarak = hari(b.tanggal, t.tanggal);
        if (tahap === 'persis' ? jarak !== 0 : jarak > TOLERANSI_HARI) continue;

        usul.push({
          baris_id: b.id, sumber: t.sumber, sumber_id: t.id,
          keyakinan: tahap, selisih_hari: jarak,
        });
        barisTerpakai.add(b.id);
        bukuTerpakai.add(t.id);
        break;
      }
    }
  }

  return usul;
}

/**
 * Laporan rekonsiliasi empat baris — bentuk baku yang dipakai akuntan.
 *
 *     saldo menurut BANK
 *   + setoran dalam perjalanan   (sudah dicatat, belum masuk rekening)
 *   − cek/transfer beredar       (sudah dicatat, belum dicairkan)
 *   ± penyesuaian                (biaya admin, jasa giro, koreksi bank)
 *   ─────────────────────────────
 *   = saldo yang SEHARUSNYA ada di buku
 *
 * Yang menjual modul ini bukan daftar yang cocok, melainkan `selisih` yang
 * mengecil sampai nol. Selisih apa pun adalah pertanyaan yang belum terjawab —
 * jadi ia tak pernah dibulatkan atau disembunyikan.
 *
 * @param saldoBank   saldo AKHIR yang TERTULIS di koran, bukan dihitung
 * @param saldoBuku   saldo menurut catatan kita
 * @param bukuBelumCocok transaksi buku yang tak ditemukan di koran
 */
export function hitungLaporan(
  saldoBank: number | string,
  saldoBuku: number | string,
  koran: BarisKoran[],
  bukuBelumCocok: TransaksiBuku[],
  penyesuaian: Penyesuaian[] = [],
): LaporanRekonsiliasi {
  const bank = angka(saldoBank);
  const buku = angka(saldoBuku);

  // Transaksi buku yang belum muncul di koran, dipisah menurut arahnya.
  // Penerimaan yang belum masuk MENAMBAH saldo bank; pengeluaran yang belum
  // dicairkan MENGURANGINYA. Menjumlahkan keduanya sebagai satu angka
  // menghasilkan bilangan yang benar secara aritmetika tapi tak bisa
  // dijelaskan ke siapa pun.
  let setoran = 0;
  let cek = 0;
  for (const t of bukuBelumCocok) {
    const n = angka(t.nominal);
    if (n > 0) setoran += n;
    else cek += Math.abs(n);
  }

  const sesuai = penyesuaian.reduce((s, p) => s + angka(p.nominal), 0);
  const seharusnya = bank + setoran - cek + sesuai;

  const belumCocokKoran = koran.filter((b) => !b.sudah_cocok).length;

  // Dibulatkan ke rupiah utuh sebelum dibandingkan: `numeric(18,2)` bisa
  // menyisakan sen dari pembagian, dan selisih Rp 0,004 yang ditampilkan
  // sebagai "tidak tuntas" membuat orang berhenti memercayai penanda itu.
  const selisih = Math.round((seharusnya - buku) * 100) / 100;

  return {
    saldo_bank: bank,
    setoran_dalam_perjalanan: setoran,
    cek_beredar: cek,
    penyesuaian: sesuai,
    saldo_buku_seharusnya: seharusnya,
    saldo_buku: buku,
    selisih,
    tuntas: selisih === 0 && belumCocokKoran === 0,
    baris_belum_cocok: belumCocokKoran,
    transaksi_belum_cocok: bukuBelumCocok.length,
  };
}

/**
 * Sidik baris koran, untuk mencegah impor ganda.
 *
 * Dihitung dari ISI barisnya, bukan dari urutannya: berkas yang sama diimpor
 * ulang menghasilkan sidik yang sama, jadi `UNIQUE (koran_id, hash_baris)`
 * menolaknya. Orang MEMANG mengimpor ulang saat berkasnya diperbaiki, dan
 * tanpa ini tiap perbaikan menggandakan seluruh isinya.
 *
 * Urutan ikut dihitung karena satu koran bisa memuat dua baris identik yang
 * sah — dua biaya admin Rp 6.500 di hari yang sama benar-benar terjadi.
 */
export function sidikBaris(
  tanggal: string, keterangan: string,
  debit: number | string, kredit: number | string, urutan: number,
): string {
  const bersih = keterangan.trim().replace(/\s+/g, ' ').toLowerCase();
  return `${tanggal}|${bersih}|${angka(debit).toFixed(2)}|${angka(kredit).toFixed(2)}|${urutan}`;
}
