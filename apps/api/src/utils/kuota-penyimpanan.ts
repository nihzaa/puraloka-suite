import { supabase } from './supabase.js'
import { bacaBatasPaket } from './batas-paket.js'

/**
 * KUOTA PENYIMPANAN — apakah berkas ini masih muat.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `kuota.penyimpanan_gb` terdaftar di katalog fitur sejak migrasi 538, dijual
 * di halaman paket, dan angkanya tersimpan per paket. Yang tak pernah ada:
 * satu pun pembaca (diukur 2026-09-01, nol pemanggil di seluruh `apps/`).
 *
 * Jadi paket yang menjanjikan "5 GB" tak membatasi apa pun. Yang bergejala
 * cuma tagihan penyimpanan vendor yang naik tanpa ada yang tahu sebabnya —
 * berbulan kemudian.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DIPERIKSA SEBELUM MENULIS, BUKAN SESUDAH
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pemeriksaan sesudah unggah berarti berkasnya sudah ada di penyimpanan saat
 * ditolak — dan menghapusnya kembali adalah operasi kedua yang bisa gagal
 * sendiri, meninggalkan berkas yatim yang tetap memakan kuota tapi tak
 * tertaut ke apa pun.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ARAH KEGAGALAN: TERBUKA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sama dengan gerbang modul dan batas paket lain di repo ini, dan karena
 * alasan yang sama: gagal-tertutup berarti satu gangguan basis membuat SELURUH
 * pelanggan tak bisa mengunggah apa pun — termasuk yang membayar. Kerugian itu
 * jauh melebihi risiko beberapa megabyte yang lolos saat gangguan.
 *
 * ⚠ Yang TIDAK dilakukan: `catch → true` polos. Kegagalan DICATAT, supaya
 * gerbang yang membuka diam-diam bisa dibedakan dari gerbang yang bekerja.
 */

/** 1 GB = 1024³ byte. Vendor penyimpanan menagih dalam satuan ini. */
const BYTE_PER_GB = 1024 * 1024 * 1024

export interface HasilKuota {
  boleh: boolean
  /** Kalimat siap tampil. NULL bila boleh. */
  alasan: string | null
  /** Byte terpakai saat diperiksa. NULL bila tak terhitung. */
  terpakai: number | null
  /** Batas dalam byte. NULL = tak terbatas. */
  batas: number | null
  /** True bila jawabannya diberikan karena perhitungan gagal. */
  daruratTerbuka: boolean
}

const BOLEH: HasilKuota = Object.freeze({
  boleh: true,
  alasan: null,
  terpakai: null,
  batas: null,
  daruratTerbuka: false,
})

function ramah(byte: number): string {
  if (byte >= BYTE_PER_GB) return `${(byte / BYTE_PER_GB).toFixed(2)} GB`
  if (byte >= 1024 * 1024) return `${(byte / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.ceil(byte / 1024)} KB`
}

/**
 * Apakah menambah `byteBaru` masih muat dalam kuota perusahaan.
 *
 * Dipanggil SEBELUM `storage.upload()`. `byteBaru` adalah ukuran berkas yang
 * akan ditulis — bukan ukuran sesudahnya.
 */
export async function muatPenyimpanan(
  companyId: string,
  byteBaru: number
): Promise<HasilKuota> {
  if (!companyId) return BOLEH
  if (!Number.isFinite(byteBaru) || byteBaru <= 0) return BOLEH

  let batas: Awaited<ReturnType<typeof bacaBatasPaket>>
  try {
    batas = await bacaBatasPaket(companyId)
  } catch {
    // Batas paket tak terbaca. Membuka, tapi ditandai — lihat kepala berkas.
    return { ...BOLEH, daruratTerbuka: true }
  }

  if (!batas.dibatasi) return BOLEH

  const f = batas.fitur.get('kuota.penyimpanan_gb')
  if (!f || f.jenis !== 'integer') return BOLEH
  // ⚠ NULL = TAK TERBATAS, bukan nol. Membalik artinya membuat paket termahal
  // jadi paket yang tak bisa mengunggah apa pun.
  if (f.angka === null) return BOLEH

  const batasByte = f.angka * BYTE_PER_GB

  // Pemakaian dihitung dari `storage.objects` lewat fungsi basis (migrasi
  // 555) — BUKAN dari tabel penghitung. Tujuh titik unggah berarti tujuh
  // kesempatan lupa, dan hitungan yang meleset pelan-pelan lebih buruk
  // daripada tak ada hitungan: ia terlihat seperti bekerja.
  const { data, error } = await supabase.rpc('hitung_penyimpanan_tenant', {
    p_company_id: companyId,
  })

  if (error) {
    return { ...BOLEH, daruratTerbuka: true }
  }

  const terpakai = Number(data ?? 0)
  if (terpakai + byteBaru <= batasByte) {
    return { boleh: true, alasan: null, terpakai, batas: batasByte, daruratTerbuka: false }
  }

  return {
    boleh: false,
    // Kalimatnya menyebut ANGKANYA — berapa terpakai, berapa batasnya, dan
    // berapa besar berkas yang ditolak. "Kuota penuh" memaksa penggunanya
    // menebak ketiganya, padahal semuanya sudah kita ketahui saat menolak.
    alasan:
      `Penyimpanan paket ${batas.paketNama ?? batas.paketKode ?? 'Anda'} sudah terpakai ` +
      `${ramah(terpakai)} dari ${f.angka} GB. Berkas ${ramah(byteBaru)} ini tak lagi muat. ` +
      `Hapus berkas lama, atau naikkan paket.`,
    terpakai,
    batas: batasByte,
    daruratTerbuka: false,
  }
}
