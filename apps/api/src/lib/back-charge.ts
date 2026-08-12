/**
 * BACK-CHARGE (D3) — biaya yang seharusnya ditanggung subkon.
 *
 * ── Yang diukur 2026-08-12
 *
 * Pembayaran ke mandor punya DUA potongan: `deducted_kasbon` dan
 * `retensi_amount`. Tak satu pun menampung biaya yang dikeluarkan KONTRAKTOR
 * untuk pekerjaan yang seharusnya jadi tanggungan subkon.
 *
 * Dan yang lebih menentukan: `deducted_kasbon` **diketik manual** saat
 * konfirmasi, tanpa daftar yang menjadi dasarnya. Angka potongan tanpa
 * rincian di baliknya tak bisa dijelaskan ke mandor saat ia bertanya
 * "kenapa dipotong sekian" — dan pertanyaan itu selalu datang.
 *
 * ── Kenapa lib terpisah, bukan menambah cabang di `retensi-subkontrak`
 *
 * Retensi adalah persentase dari tagihan; back-charge adalah kumpulan baris
 * bernominal tetap. Menyatukannya berarti satu fungsi dengan dua mode yang
 * tak pernah dipakai bersamaan — dan mode yang salah dipilih menghasilkan
 * potongan yang sama sekali berbeda.
 *
 * Yang DIPAKAI BERSAMA adalah hasilnya, di `hitungNetoLengkap` di bawah.
 */
import { hitungPotonganRetensi } from './retensi-subkontrak.js'

export interface BarisBackCharge {
  id: string
  nomor: string
  uraian: string
  nilai: number | string
  status: string
}

export interface RingkasBackCharge {
  /** Sudah disetujui, BELUM dipotong — inilah yang siap mengurangi tagihan. */
  siapDipotong: number
  siapIds: string[]
  /** Sudah pernah dipotong dari pembayaran sebelumnya. */
  sudahDipotong: number
  /** Menunggu persetujuan — belum boleh memotong apa pun. */
  menungguSetuju: number
  jumlahBaris: number
}

/** Membulatkan ke 2 desimal — nominal `numeric` di DB, bukan float. */
const bulat2 = (n: number) => Math.round(n * 100) / 100

/**
 * Ringkas back-charge satu lingkup kerja.
 *
 * ── Kenapa hanya `disetujui` yang siap dipotong
 *
 * `diajukan` belum disahkan siapa pun; memotongnya berarti sepihak.
 * `dipotong` sudah masuk pembayaran lain — menghitungnya lagi memotong dua
 * kali untuk biaya yang sama, dan totalnya tetap terlihat wajar.
 * `dibatalkan` sudah dinyatakan tak berlaku.
 */
export function ringkasBackCharge(baris: BarisBackCharge[]): RingkasBackCharge {
  let siapDipotong = 0
  let sudahDipotong = 0
  let menungguSetuju = 0
  const siapIds: string[] = []

  for (const b of baris) {
    // `Number('')` bernilai 0, bukan NaN — kosong ditangani sebelum konversi.
    const n = b.nilai === null || b.nilai === undefined || b.nilai === ''
      ? 0 : Number(b.nilai)
    if (!Number.isFinite(n) || n <= 0) continue

    if (b.status === 'disetujui') {
      siapDipotong = bulat2(siapDipotong + n)
      siapIds.push(b.id)
    } else if (b.status === 'dipotong') {
      sudahDipotong = bulat2(sudahDipotong + n)
    } else if (b.status === 'diajukan') {
      menungguSetuju = bulat2(menungguSetuju + n)
    }
    // `dibatalkan` sengaja tak dihitung ke mana pun.
  }

  return { siapDipotong, siapIds, sudahDipotong, menungguSetuju, jumlahBaris: baris.length }
}

export interface MasukanNeto {
  bruto: number
  retensiPct: number | null | undefined
  potonganKasbon: number
  backCharge: number
}

export interface HasilNeto {
  ok: boolean
  retensi: number
  backCharge: number
  neto: number
  galat?: string
}

/**
 * Neto pembayaran sesudah SELURUH potongan.
 *
 * Urutannya menentukan hasilnya, jadi ditulis eksplisit:
 *
 *   1. retensi dihitung dari BRUTO (persentase nilai pekerjaan)
 *   2. kasbon dan back-charge dikurangkan sesudahnya (nominal tetap)
 *
 * Menghitung retensi dari sisa-setelah-potongan akan mengecilkan retensi tiap
 * kali ada back-charge — padahal retensi adalah jaminan mutu atas NILAI
 * PEKERJAAN, bukan atas uang yang kebetulan dibayarkan.
 *
 * ── Kenapa memanggil `hitungPotonganRetensi`, bukan menghitung sendiri
 *
 * Rumus retensi sudah dikunci test di sana, termasuk penolakan persen di luar
 * 0-100 dan toleransi pembulatan. Menyalinnya ke sini membuat dua sumber
 * kebenaran untuk angka yang sama.
 */
export function hitungNetoLengkap(m: MasukanNeto): HasilNeto {
  const kosong = { retensi: 0, backCharge: 0, neto: 0 }

  if (!Number.isFinite(m.backCharge) || m.backCharge < 0) {
    return { ok: false, ...kosong, galat: 'Nilai back-charge tidak sah' }
  }

  // Retensi + kasbon lewat lib yang sudah ada; back-charge ditambahkan ke
  // potongannya supaya penolakan "potongan melebihi tagihan" tetap berlaku
  // dengan seluruh potongan diperhitungkan — bukan hanya kasbon.
  const r = hitungPotonganRetensi({
    bruto: m.bruto,
    retensiPct: m.retensiPct,
    potonganKasbon: m.potonganKasbon + m.backCharge,
  })

  if (!r.ok) {
    return {
      ok: false,
      retensi: r.retensi,
      backCharge: bulat2(m.backCharge),
      neto: r.neto,
      // Pesan dari lib retensi menyebut "kasbon" untuk jumlah gabungan.
      // Diperjelas di sini supaya yang membaca tahu back-charge ikut
      // diperhitungkan — kalau tidak, ia akan mencari selisihnya di kasbon.
      galat: m.backCharge > 0
        ? `${r.galat} (termasuk back-charge ${bulat2(m.backCharge)})`
        : r.galat,
    }
  }

  return {
    ok: true,
    retensi: r.retensi,
    backCharge: bulat2(m.backCharge),
    neto: r.neto,
  }
}

export type HasilPeriksaSetuju =
  | { boleh: true }
  | { boleh: false; sebab: string }

/**
 * Bolehkah `penyetuju` mengesahkan back-charge ini?
 *
 * SoD — sama dengan TJS-P4, D1, dan alasan yang sama: back-charge MENGURANGI
 * uang yang diterima orang lain. Satu orang yang mengajukan lalu menyetujui
 * sendiri menghasilkan potongan sepihak dengan dua kolom.
 *
 * Basis juga menolaknya lewat CHECK; yang di sini memberi kalimat yang bisa
 * ditindaklanjuti, karena galat Postgres tak bisa dibaca pengguna.
 */
export function periksaSetujuBackCharge(params: {
  status: string
  pengajuId: string
  penyetujuId: string
}): HasilPeriksaSetuju {
  if (params.status !== 'diajukan') {
    return {
      boleh: false,
      sebab: `Back-charge berstatus ${params.status}; hanya yang diajukan bisa disetujui.`,
    }
  }
  if (params.pengajuId === params.penyetujuId) {
    return {
      boleh: false,
      sebab: 'Anda yang mengajukan back-charge ini, jadi tak bisa menyetujuinya sendiri. '
        + 'Potongan yang disahkan sepihak sulit dipertanggungjawabkan saat mandor menanyakannya.',
    }
  }
  return { boleh: true }
}
