import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabase } from '../../utils/supabase.js'
import { bacaKeadaanBacaSaja, METODE_TULIS, AWALAN_TETAP_BOLEH } from '../baca-saja.js'

/**
 * BACA-SAJA — yang diuji ARAH KEGAGALANNYA, dan jalur pemulihannya.
 *
 * Penegakan pembayaran punya dua cara salah yang keduanya senyap:
 *
 *   membekukan terlalu banyak → pelanggan yang LUNAS berhenti bisa bekerja,
 *                               dan gejalanya "aplikasi tak bisa menyimpan"
 *   membekukan terlalu sedikit → yang berhenti membayar terus memakai produk
 *
 * ⚠ Yang TIDAK bisa dibuktikan berkas ini: bahwa penegakannya benar-benar
 * terpasang di jalur permintaan. Percobaan pertama memakai hook global yang
 * berjalan sebelum `request.companyId` terisi — ia pulang lebih awal pada
 * setiap permintaan, dan test tingkat-fungsi seperti ini akan tetap HIJAU
 * seluruhnya. Yang menangkapnya cuma memanggil rute sungguhan (POST
 * /api/v1/clients tetap 201 saat tenant baca-saja).
 *
 * Karena itu ada `audit-baca-saja-terpasang.mjs`: ia memeriksa penegakannya
 * ada di `authenticate()`, tempat companyId sudah pasti terisi.
 */

let companyId: string

beforeAll(async () => {
  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: '[UJI-BACASAJA] PT Uji Baca Saja',
      code: `uji-bacasaja-${Date.now().toString(36)}`,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Gagal menyiapkan company uji: ${error.message}`)
  companyId = data.id
})

afterAll(async () => {
  if (companyId) {
    await supabase.from('entitlement_snapshot').delete().eq('company_id', companyId)
    await supabase.from('companies').delete().eq('id', companyId)
  }
})

describe('baca-saja — membekukan hanya yang DISENGAJA', () => {
  it('tenant TANPA baris sistem.baca_saja dianggap SEHAT', async () => {
    // Ini keadaan mayoritas: 2.022 perusahaan, hampir semuanya tak punya
    // barisnya. Kalau "tak ada baris" berarti beku, seluruh pelanggan
    // kehilangan kemampuan menulis pada detik fitur ini dipasang.
    const k = await bacaKeadaanBacaSaja(companyId)
    expect(k.bacaSaja).toBe(false)
    expect(k.alasan).toBeNull()
  })

  it('BEKU saat barisnya bernilai false, dengan alasan yang menyebut tagihannya', async () => {
    const { error } = await supabase.from('entitlement_snapshot').insert({
      company_id: companyId,
      kunci: 'sistem.baca_saja',
      terbuka: false,
      alasan: 'Tagihan INV-2026-08-001 belum kami terima sejak 1 Agustus 2026.',
    })
    expect(error, 'gagal menyiapkan baris uji').toBeNull()

    const k = await bacaKeadaanBacaSaja(companyId)
    expect(k.bacaSaja).toBe(true)
    // Pesan tanpa nomor tagihan tak bisa ditindaklanjuti: bagian keuangan
    // pelanggan perlu tahu tagihan MANA yang belum masuk.
    expect(k.alasan).toMatch(/INV-2026-08-001/)
  })

  it('SEHAT lagi begitu barisnya dihapus — pemulihan seketika', async () => {
    // Pelanggan yang baru membayar mengharapkan bisa bekerja SEKARANG.
    // Penundaan di titik itu terbaca seperti produk rusak, dan ia baru saja
    // mengeluarkan uang.
    await supabase
      .from('entitlement_snapshot')
      .delete()
      .eq('company_id', companyId)
      .eq('kunci', 'sistem.baca_saja')

    const k = await bacaKeadaanBacaSaja(companyId)
    expect(k.bacaSaja).toBe(false)
  })

  it('NULL berarti belum ditetapkan, BUKAN beku', async () => {
    await supabase.from('entitlement_snapshot').insert({
      company_id: companyId,
      kunci: 'sistem.baca_saja',
      terbuka: null,
    })
    const k = await bacaKeadaanBacaSaja(companyId)
    expect(k.bacaSaja).toBe(false)

    await supabase
      .from('entitlement_snapshot')
      .delete()
      .eq('company_id', companyId)
      .eq('kunci', 'sistem.baca_saja')
  })

  it('companyId kosong dianggap SEHAT, bukan beku', async () => {
    const k = await bacaKeadaanBacaSaja('')
    expect(k.bacaSaja).toBe(false)
  })
})

describe('baca-saja — apa yang ditahan dan apa yang tidak', () => {
  it('hanya metode yang MENGUBAH data yang ditahan', () => {
    // GET yang ikut ditahan berarti "baca-saja" tak membiarkan orang membaca —
    // yang membatalkan seluruh maksud keputusan founder.
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(METODE_TULIS.has(m), `${m} seharusnya lolos`).toBe(false)
    }
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(METODE_TULIS.has(m), `${m} seharusnya ditahan`).toBe(true)
    }
  })

  it('jalur pemulihan ada di daftar yang tetap boleh ditulis', () => {
    // Jalur pemulihan tak boleh berada di belakang gerbang yang ia pulihkan.
    // Azure memperlihatkan kegagalannya: invoice terkunci → pembayaran
    // swalayan mati → pelanggan yang INGIN membayar harus menelepon dukungan.
    expect(AWALAN_TETAP_BOLEH.some((a) => a.startsWith('/api/v1/auth'))).toBe(true)
    expect(AWALAN_TETAP_BOLEH.some((a) => a.includes('companies'))).toBe(true)
    expect(AWALAN_TETAP_BOLEH.some((a) => a.includes('ekspor'))).toBe(true)
  })

  it('daftar yang tetap boleh ditulis tetap KECIL', () => {
    // Tiap tambahan adalah lubang yang membuat tenant menunggak terus bekerja,
    // dan lubang yang paling mudah dibenarkan ("cuma satu rute, penting")
    // adalah yang paling sering membuat penegakan berhenti berarti.
    expect(
      AWALAN_TETAP_BOLEH.length,
      'daftar pengecualian membengkak — tiap tambahan melemahkan penegakan'
    ).toBeLessThanOrEqual(6)
  })
})
