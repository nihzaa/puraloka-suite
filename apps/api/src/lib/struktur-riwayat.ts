/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RIWAYAT ELEMEN STRUKTUR — supaya "kenapa dulu 300×500?" punya jawaban
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `struktur_elemen` menyimpan SATU input dan SATU ringkasan. Menghitung ulang
 * menimpanya, jadi tiga pertanyaan yang pasti muncul di proyek sungguhan tak
 * punya jawaban sama sekali:
 *
 *   1. "Kenapa balok ini dulu 300×500, sekarang 300×520?"
 *   2. "Sejak kapan elemen ini jadi TIDAK AMAN — dan karena input apa?"
 *   3. "Siapa yang mengubah mutu betonnya, dan kapan?"
 *
 * Yang ketiga bukan soal saling menyalahkan. Ia muncul saat lembar perhitungan
 * yang SUDAH DITANDATANGANI memuat angka berbeda dari yang terpasang di
 * lapangan, dan yang menandatangani perlu tahu: dokumennya yang basi, atau
 * desainnya yang berubah sesudah diteken?
 *
 * ── Yang dicatat adalah KEADAAN YANG DIGANTIKAN, bukan yang baru
 *
 * Dipanggil SEBELUM update, membawa baris lama. Alasannya: yang baru sudah
 * tersimpan di `struktur_elemen` — mencatatnya lagi berarti baris terakhir
 * riwayat selalu kembar dengan keadaan sekarang, dan pembaca tak bisa
 * membedakan "belum pernah diubah" dari "baru saja diubah".
 *
 * ── Kegagalan mencatat TIDAK menggagalkan perhitungannya
 *
 * Ini keputusan yang sengaja, dan arahnya berlawanan dengan kebanyakan
 * penulisan di repo ini.
 *
 * Riwayat adalah catatan pendukung. Menggagalkan hitung-ulang karena
 * riwayatnya tak tercatat berarti satu tabel pendukung bisa melumpuhkan
 * fungsi inti modul — estimator tak bisa bekerja sama sekali karena tabel
 * yang ia bahkan tak tahu ada.
 *
 * TAPI diamnya dilarang: `audit-catch-senyap.mjs` ada justru untuk ini.
 * Kegagalannya dicatat ke log server dengan konteks yang cukup untuk
 * ditelusuri, sehingga "riwayat kok kosong" punya jejak.
 */
import type { FastifyBaseLogger } from 'fastify'
import { supabase } from '../utils/supabase.js'

/** Baris elemen yang akan digantikan — hanya medan yang dicatat. */
export interface ElemenUntukRiwayat {
  id: string
  company_id: string
  project_id: string
  jenis: string
  jumlah: number
  input: Record<string, unknown>
  aman: boolean | null
  beton_m3: number | string | null
  bekisting_m2: number | string | null
  besi_kg: number | string | null
}

/**
 * Catat keadaan elemen SEBELUM digantikan.
 *
 * Memulangkan nomor urut yang tercatat, atau `null` bila tak tercatat
 * (kegagalan sudah dicatat ke log; pemanggil TIDAK perlu menggagalkan
 * pekerjaannya karena ini).
 */
export async function catatRiwayat(
  el: ElemenUntukRiwayat,
  pelaku: string | null,
  alasan: string | null,
  log: FastifyBaseLogger,
): Promise<number | null> {
  try {
    /*
      Nomor urut diambil dari yang TERTINGGI, bukan dari jumlah baris.

      `count(*) + 1` salah begitu ada baris yang terhapus: dua revisi bisa
      dapat nomor sama, dan kunci unik (elemen_id, urutan) akan menolaknya —
      kegagalan yang muncul jauh dari sebabnya.
    */
    const { data: puncak, error: eBaca } = await supabase
      .from('struktur_riwayat')
      .select('urutan')
      .eq('elemen_id', el.id)
      .order('urutan', { ascending: false })
      .limit(1)

    if (eBaca) {
      log.warn({ err: eBaca.message, elemenId: el.id },
        'riwayat struktur: gagal membaca urutan terakhir — revisi ini tak tercatat')
      return null
    }

    const urutan = (puncak?.[0]?.urutan ?? 0) + 1

    const { data, error } = await supabase
      .from('struktur_riwayat')
      .insert({
        company_id: el.company_id,
        elemen_id: el.id,
        project_id: el.project_id,
        urutan,
        input: el.input,
        jenis: el.jenis,
        jumlah: el.jumlah,
        aman: el.aman,
        beton_m3: el.beton_m3,
        bekisting_m2: el.bekisting_m2,
        besi_kg: el.besi_kg,
        alasan: alasan?.trim() || null,
        dicatat_oleh: pelaku,
      })
      .select('urutan')

    if (error) {
      log.warn({ err: error.message, elemenId: el.id, urutan },
        'riwayat struktur: gagal menyimpan revisi — perhitungannya TETAP tersimpan')
      return null
    }
    /*
      Nol baris tanpa galat berarti tulisannya tak sampai (lazimnya RLS
      menyaringnya habis). Membalas "tercatat" di sini membuat riwayat yang
      kosong terlihat seperti riwayat yang memang belum pernah diisi.
    */
    if (!data?.length) {
      log.warn({ elemenId: el.id, urutan },
        'riwayat struktur: insert nol baris tanpa galat — periksa RLS/company_id')
      return null
    }
    return urutan
  } catch (e) {
    log.warn({ err: (e as Error).message, elemenId: el.id },
      'riwayat struktur: galat tak terduga saat mencatat revisi')
    return null
  }
}

/**
 * Apakah dua input BERBEDA secara bermakna?
 *
 * Dipakai supaya hitung-ulang yang tak mengubah apa pun tidak melahirkan
 * revisi baru. Menekan "Hitung ulang semua" tiga kali berturut-turut adalah
 * hal yang lumrah dilakukan orang; kalau tiap tekanan melahirkan revisi,
 * riwayatnya penuh baris identik dan yang benar-benar berubah tenggelam.
 *
 * Perbandingannya lewat JSON berurut-kunci — bukan `===` (selalu beda untuk
 * objek) dan bukan `JSON.stringify` polos (urutan kunci bisa berbeda untuk
 * isi yang sama).
 */
export function inputBerbeda(a: unknown, b: unknown): boolean {
  return bakukan(a) !== bakukan(b)
}

function bakukan(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(bakukan).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${bakukan(o[k])}`).join(',')}}`
}
