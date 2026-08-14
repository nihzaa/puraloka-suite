/**
 * PERCAKAPAN WHATSAPP — supaya asisten di WA punya ingatan juga.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KANAL YANG TAK MENYIMPAN APA PUN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-14: `routes/v1/wa-webhook.ts` **tak menyentuh
 * `ai_percakapan` maupun `ai_pesan` sama sekali**. Tiap pesan WhatsApp
 * dijawab sebagai giliran pertama yang berdiri sendiri.
 *
 * Akibatnya paling terasa justru di kanal yang paling butuh: orang di lapangan
 * mengetik pendek dan bersambung ("berapa sisa semen?" → "yang di Cimahi").
 * Kalimat kedua tak berarti apa pun tanpa yang pertama, dan asisten menjawab
 * seolah baru pertama kali disapa.
 *
 * Web sudah punya penyimpanan itu sejak awal. Berkas ini membawanya ke WA —
 * tabel yang SAMA, bukan tabel sendiri: riwayat yang disimpan dua bentuk akan
 * punya dua retensi, dua cara dibaca, dan dua cacat yang berbeda.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU PERCAKAPAN BERJALAN PER NOMOR, BUKAN PER PESAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WhatsApp tak punya tombol "percakapan baru". Kalau tiap pesan membuat baris
 * `ai_percakapan` sendiri, riwayatnya selalu kosong — persis keadaan sebelum
 * berkas ini ada, hanya dengan lebih banyak baris.
 *
 * Jadi: percakapan TERAKHIR milik user ini di kanal `ai_whatsapp` dipakai
 * ulang selama masih HANGAT. Yang lebih tua dari `UMUR_HANGAT_MS` memulai
 * percakapan baru — obrolan kemarin sore bukan konteks yang sah untuk
 * pertanyaan pagi ini, dan membawanya berarti membayar token untuk konteks
 * yang justru menyesatkan.
 */

import type { TenantDb } from '../utils/tenant-db.js'

/**
 * Berapa lama sebuah percakapan WhatsApp dianggap masih berlanjut.
 *
 * Enam jam: cukup untuk satu hari kerja yang terpotong rapat dan makan siang,
 * tetapi tidak sampai menyambung obrolan lintas hari. Angka ini menentukan
 * ARTI, bukan biaya — yang menentukan biaya adalah `MAKS_PESAN_RIWAYAT`.
 */
export const UMUR_HANGAT_MS = 6 * 60 * 60 * 1000

export interface HasilPercakapan {
  ok: boolean
  id: string | null
}

/**
 * Mengambil percakapan WhatsApp yang masih hangat, atau membuat yang baru.
 *
 * TIDAK melempar: kanal WhatsApp harus tetap menjawab walau penyimpanan
 * riwayatnya gagal. Yang hilang saat gagal adalah ingatannya, bukan
 * asistennya — dan asisten yang lupa jauh lebih baik daripada asisten yang
 * diam karena tabelnya bermasalah.
 */
export async function ambilAtauBuatPercakapanWa(
  db: TenantDb,
  companyId: string,
  userId: string,
  asisten: string,
  opsi: { sekarang?: Date; catatGalat?: (pesan: string, err: unknown) => void } = {},
): Promise<HasilPercakapan> {
  const sekarang = opsi.sekarang ?? new Date()
  const catatGalat = opsi.catatGalat ?? (() => {})
  const batas = new Date(sekarang.getTime() - UMUR_HANGAT_MS).toISOString()

  /*
   * HANGAT diukur dari PESAN TERAKHIR, bukan dari `ai_percakapan`.
   *
   * `ai_percakapan.diperbarui_pada` TIDAK BISA dipakai: trigger
   * `trg_ai_percakapan_sentuh` (BEFORE UPDATE) memaksanya `now()` pada tiap
   * UPDATE tanpa syarat. Akibatnya stempel itu hanya bisa maju — percakapan
   * WhatsApp takkan pernah dingin, dan obrolan kemarin sore akan menempel
   * pada pertanyaan pagi ini selamanya.
   *
   * Ditemukan oleh test, bukan oleh saya membaca ulang: memundurkan
   * `diperbarui_pada` lalu memanggil fungsi ini tetap mengembalikan
   * percakapan yang sama, karena UPDATE-nya memajukan kembali stempel yang
   * baru saja dimundurkan.
   *
   * `ai_pesan.dibuat_pada` tak punya trigger dan menyatakan yang sebenarnya
   * ditanyakan: kapan terakhir kali ada yang benar-benar bicara.
   */
  const { data: pesanBaru, error: errBaca } = await db
    .from('ai_pesan')
    .select('percakapan_id, dibuat_pada, ai_percakapan!inner(id, user_id, kanal)')
    .eq('ai_percakapan.user_id', userId)
    .eq('ai_percakapan.kanal', 'ai_whatsapp')
    .gte('dibuat_pada', batas)
    .order('dibuat_pada', { ascending: false })
    .limit(1)

  if (errBaca) {
    catatGalat('gagal membaca percakapan WhatsApp', errBaca)
    return { ok: false, id: null }
  }

  const adaKah = ((pesanBaru ?? []) as Array<{ percakapan_id: string }>).map((p) => ({
    id: p.percakapan_id,
  }))

  const lama = ((adaKah ?? []) as Array<{ id: string }>)[0]
  if (lama) {
    /*
     * TIDAK perlu "menyentuh" `diperbarui_pada` dari sini.
     *
     * Trigger `trg_ai_percakapan_sentuh` (BEFORE UPDATE) sudah memaksanya
     * `now()` pada tiap UPDATE, dan `simpanPertukaranWa` di bawah tetap
     * menulis `ai_pesan` — jadi jendela hangatnya bergeser mengikuti
     * pemakaian tanpa satu pun query tambahan di sini.
     *
     * Versi pertama berkas ini mengirim UPDATE khusus untuk itu. Ia bekerja,
     * tetapi menambah satu perjalanan basis per pesan masuk untuk pekerjaan
     * yang sudah dikerjakan basisnya sendiri — dan ditemukan justru karena
     * testnya gagal: memundurkan `diperbarui_pada` lalu memanggil fungsi ini
     * tak pernah menghasilkan percakapan baru, karena UPDATE-nya memajukan
     * kembali stempel yang baru saja dimundurkan.
     */
    return { ok: true, id: lama.id }
  }

  const { data: baru, error: errBuat } = await db
    .from('ai_percakapan')
    .insert({
      company_id: companyId,
      user_id: userId,
      asisten,
      kanal: 'ai_whatsapp',
    })
    .select('id')
    .maybeSingle()

  if (errBuat || !baru) {
    catatGalat('gagal membuat percakapan WhatsApp', errBuat)
    return { ok: false, id: null }
  }

  return { ok: true, id: (baru as { id: string }).id }
}

/**
 * Menyimpan satu pertukaran (pesan user + jawaban asisten).
 *
 * Bentuknya sengaja SAMA dengan `simpanPesan` di `routes/v1/ai-chat.ts`,
 * termasuk `ada_galat_tool` yang ditulis EKSPLISIT pada kedua baris.
 *
 * Itu bukan kehati-hatian berlebihan — ia pelajaran yang dibayar mahal:
 * insert BATCH lewat PostgREST menyatukan kolom seluruh baris, lalu mengirim
 * `null` untuk baris yang tak menyebutkannya alih-alih membiarkan DEFAULT
 * berlaku. Baris kedua menyebut `ada_galat_tool`, jadi baris pertama ikut
 * mendapat kolomnya bernilai null, dan NOT NULL menolak SELURUH batch —
 * dengan respons tetap 200 dan jawaban yang benar. Yang hilang riwayatnya,
 * dan itu baru terasa pada pesan berikutnya.
 */
export async function simpanPertukaranWa(
  db: TenantDb,
  companyId: string,
  percakapanId: string,
  pesanUser: string,
  hasil: { teks: string; blok: unknown[]; adaGalatTool: boolean; ronde: number },
  catatGalat: (pesan: string, err: unknown) => void = () => {},
): Promise<void> {
  const { data: terakhir, error: errUrut } = await db
    .from('ai_pesan')
    .select('urutan')
    .eq('percakapan_id', percakapanId)
    .order('urutan', { ascending: false })
    .limit(1)

  if (errUrut) {
    catatGalat('gagal membaca urutan pesan WhatsApp', errUrut)
    return
  }

  const mulai = ((terakhir ?? []) as Array<{ urutan: number }>)[0]?.urutan ?? -1

  const { error } = await db.from('ai_pesan').insert([
    {
      company_id: companyId,
      percakapan_id: percakapanId,
      peran: 'user',
      urutan: mulai + 1,
      teks: pesanUser,
      blok: [],
      ronde: 1,
      ada_galat_tool: false,
    },
    {
      company_id: companyId,
      percakapan_id: percakapanId,
      peran: 'assistant',
      urutan: mulai + 2,
      teks: hasil.teks,
      blok: hasil.blok,
      ronde: hasil.ronde,
      ada_galat_tool: hasil.adaGalatTool,
    },
  ])

  // Gagal simpan TIDAK membatalkan jawaban yang sudah dikirim dan sudah
  // dibayar. Tapi juga tak ditelan: riwayat yang bolong membuat pesan
  // berikutnya kehilangan konteksnya, dan gejalanya baru muncul nanti.
  if (error) catatGalat('gagal menyimpan pesan WhatsApp', error)
}
