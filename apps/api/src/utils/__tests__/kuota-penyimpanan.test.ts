import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { supabase } from '../supabase.js'
import { muatPenyimpanan } from '../kuota-penyimpanan.js'

/**
 * KUOTA PENYIMPANAN — yang diuji ARAH KEGAGALANNYA.
 *
 * Batas penyimpanan punya dua cara salah, dan keduanya senyap:
 *
 *   menolak terlalu cepat → pelanggan yang membayar tak bisa mengunggah,
 *                           dan gejalanya "aplikasi menolak berkas saya"
 *   melewatkan pemakaian  → batas "5 GB" diam-diam jadi entah berapa, dan
 *                           yang bergejala cuma tagihan vendor berbulan
 *                           kemudian
 *
 * Yang kedua paling berbahaya karena kuotanya TETAP TERLIHAT BEKERJA: ia
 * menolak saat "penuh", cuma penuhnya di angka yang salah.
 */

let companyId: string
let planId: string | null = null
let subId: string | null = null

beforeAll(async () => {
  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: '[UJI-KUOTA] PT Uji Kuota Simpan',
      code: `uji-kuota-${Date.now().toString(36)}`,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Gagal menyiapkan company uji: ${error.message}`)
  companyId = data.id
})

afterAll(async () => {
  if (subId) await supabase.from('subscriptions').delete().eq('id', subId)
  if (planId) {
    await supabase.from('plan_feature_values').delete().eq('plan_id', planId)
    await supabase.from('plans').delete().eq('id', planId)
  }
  if (companyId) await supabase.from('companies').delete().eq('id', companyId)
})

describe('kuota penyimpanan — tanpa langganan', () => {
  it('MEMBUKA saat tenant tak punya langganan', async () => {
    // Diukur 2026-08-31: 2.022 perusahaan, NOL langganan. Kalau ini menolak,
    // seluruh pelanggan berhenti bisa mengunggah pada detik fitur dipasang.
    const h = await muatPenyimpanan(companyId, 50 * 1024 * 1024)
    expect(h.boleh).toBe(true)
    expect(h.alasan).toBeNull()
  })

  it('MEMBUKA saat companyId kosong', async () => {
    // Permintaan tanpa company aktif belum lewat `authenticate`; menolaknya
    // di sini membuat gejalanya menuduh kuota padahal masalahnya autentikasi.
    expect((await muatPenyimpanan('', 999)).boleh).toBe(true)
  })

  it('MEMBUKA untuk ukuran nol atau tak masuk akal', async () => {
    // Berkas nol byte tak memakan kuota. `NaN` datang dari `Number()` atas
    // header yang hilang — menolaknya berarti unggahan gagal karena bug
    // pemanggil, dengan pesan yang menuduh kuota.
    expect((await muatPenyimpanan(companyId, 0)).boleh).toBe(true)
    expect((await muatPenyimpanan(companyId, Number.NaN)).boleh).toBe(true)
  })
})

describe('kuota penyimpanan — dengan batas', () => {
  beforeAll(async () => {
    const { data: fitur } = await supabase
      .from('plan_features')
      .select('id')
      .eq('key', 'kuota.penyimpanan_gb')
      .single()
    if (!fitur) throw new Error('kuota.penyimpanan_gb tak ada di katalog')

    const { data: plan, error: ePlan } = await supabase
      .from('plans')
      .insert({ code: `uji-kuota-${Date.now().toString(36)}`, name: '[UJI] Paket Kuota' })
      .select('id')
      .single()
    if (ePlan) throw new Error(`Gagal membuat paket uji: ${ePlan.message}`)
    planId = plan.id

    await supabase
      .from('plan_feature_values')
      .insert({ plan_id: planId, feature_id: fitur.id, value_integer: 1 })

    const { data: sub, error: eSub } = await supabase
      .from('subscriptions')
      .insert({ company_id: companyId, plan_id: planId, status: 'active' })
      .select('id')
      .single()
    if (eSub) throw new Error(`Gagal membuat langganan uji: ${eSub.message}`)
    subId = sub.id
  })

  it('MEMBUKA berkas yang masih muat', async () => {
    // Tenant uji baru, nol berkas — 5 MB jelas muat dalam 1 GB.
    const h = await muatPenyimpanan(companyId, 5 * 1024 * 1024)
    expect(h.boleh).toBe(true)
    expect(h.batas).toBe(1024 ** 3)
  })

  it('MENOLAK berkas yang melewati batas', async () => {
    const h = await muatPenyimpanan(companyId, 2 * 1024 ** 3)
    expect(h.boleh).toBe(false)
    expect(h.daruratTerbuka).toBe(false)
  })

  it('alasannya menyebut TIGA angka, bukan "kuota penuh"', async () => {
    // Pesan generik memaksa pengguna menebak berapa terpakai, berapa batasnya,
    // dan berapa besar berkas yang ditolak — ketiganya sudah kita ketahui saat
    // menolak.
    const h = await muatPenyimpanan(companyId, 2 * 1024 ** 3)
    expect(h.alasan).toMatch(/1 GB/) // batas
    expect(h.alasan).toMatch(/2\.00 GB/) // ukuran berkas
    expect(h.alasan).toMatch(/terpakai/i) // pemakaian
  })

  it('batas NULL = TAK TERBATAS, bukan nol', async () => {
    // ⚠ Mutasi membuktikan test sebelumnya BUTA terhadap ini: mengubah
    // `f.angka === null → BOLEH` menjadi `f.angka = 0` tetap 7/7 hijau.
    //
    // Membalik artinya membuat paket TERMAHAL jadi paket yang tak bisa
    // mengunggah apa pun — dan angka 0 yang terbaca "tanpa batas" jauh lebih
    // mudah lolos tinjauan daripada kebalikannya.
    const { data: fitur } = await supabase
      .from('plan_features')
      .select('id')
      .eq('key', 'kuota.penyimpanan_gb')
      .single()

    await supabase
      .from('plan_feature_values')
      .update({ value_integer: null })
      .eq('plan_id', planId!)
      .eq('feature_id', fitur!.id)

    const h = await muatPenyimpanan(companyId, 500 * 1024 ** 3)
    expect(h.boleh, 'batas NULL menolak — ia diperlakukan sebagai nol').toBe(true)

    // Dipulihkan supaya test sesudahnya memakai batas 1 GB lagi.
    await supabase
      .from('plan_feature_values')
      .update({ value_integer: 1 })
      .eq('plan_id', planId!)
      .eq('feature_id', fitur!.id)
  })

  it('gagal-TERBUKA saat pemakaian tak terhitung, bukan tertutup', async () => {
    // ⚠ Juga luput dari mutasi: mengubah cabang darurat jadi `boleh: false`
    // tetap 7/7 hijau.
    //
    // Gagal-tertutup berarti satu gangguan basis membuat SELURUH pelanggan
    // tak bisa mengunggah apa pun — termasuk yang membayar. Kerugian itu jauh
    // melebihi risiko beberapa megabyte yang lolos saat gangguan.
    //
    // Diuji lewat companyId yang BUKAN UUID: RPC-nya menolak, jadi cabang
    // daruratnya benar-benar tersentuh — bukan disimulasikan dengan mock.
    const h = await muatPenyimpanan('bukan-uuid-sama-sekali', 10 * 1024 ** 3)
    expect(h.boleh, 'gagal-tertutup — satu gangguan menghentikan semua unggahan').toBe(true)
    expect(h.daruratTerbuka, 'membuka tanpa menandainya — tak bisa dibedakan dari bekerja').toBe(true)
  })

  it('menghitung TEPAT di ambang, bukan kira-kira', async () => {
    // Berkas yang persis mengisi sisa kuota harus BOLEH; satu byte lebih
    // harus ditolak. Ambang yang meleset satu byte tak terlihat di test
    // yang cuma menguji "5 MB boleh, 2 GB tidak".
    const persis = await muatPenyimpanan(companyId, 1024 ** 3)
    const lebihSatu = await muatPenyimpanan(companyId, 1024 ** 3 + 1)
    expect(persis.boleh, 'berkas yang persis mengisi kuota ditolak').toBe(true)
    expect(lebihSatu.boleh, 'satu byte di atas kuota diloloskan').toBe(false)
  })
})
