/**
 * Data dummy biaya AI — supaya grafik harian bisa DINILAI, bukan ditebak.
 *
 * Grafik yang hanya pernah dilihat kosong tak bisa dinilai: perataan sumbu,
 * kepadatan label, dan perilaku hari-nol semuanya baru terlihat saat ada
 * bentuk. Angkanya dihitung dengan tarif yang sama seperti `lib/ai-harga.ts`.
 *
 * Bertanda `model` nyata supaya pemecahan per-model juga terisi. Dibersihkan
 * dengan: DELETE FROM ai_biaya_token WHERE correlation_id = <UUID penanda>.
 */
import { buatClient } from './_koneksi.mjs'

const PENANDA = '00000000-0000-0000-0000-0000000ded01'

const db = buatClient()
await db.connect()

const { rows: c } = await db.query(`
  SELECT c.id FROM companies c
  WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1
`)
const companyId = c[0].id

await db.query(`DELETE FROM ai_biaya_token WHERE correlation_id = $1`, [PENANDA])

// Pola yang MENYERUPAI pemakaian nyata: naik di hari kerja, satu lonjakan.
// Kurva rata tak menguji apa pun — yang perlu dinilai justru bagaimana
// lonjakan dan hari kosong terbaca.
const HARI = 30
let baris = 0

for (let i = HARI - 1; i >= 0; i--) {
  const tanggal = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
  const hariPekan = tanggal.getDay()
  if (hariPekan === 0) continue // Minggu: nol pemakaian, sengaja

  // Lonjakan di TENGAH rentang, bukan dekat ujung. Yang di ujung menempel
  // tepi grafik dan puncaknya terpotong — dan bentuk yang tak utuh tak bisa
  // dipakai menilai perataan sumbunya.
  const lonjakan = i === 14
  const jumlah = lonjakan ? 14 : hariPekan === 6 ? 1 : 2 + (i % 3)

  for (let n = 0; n < jumlah; n++) {
    const pakaiOwner = lonjakan || n % 3 === 0
    const model = pakaiOwner ? 'claude-sonnet-5' : 'claude-haiku-4-5'
    const asisten = pakaiOwner ? 'owner' : n % 2 === 0 ? 'insight' : 'staff'

    const masuk = pakaiOwner ? 6000 + n * 400 : 1200 + n * 120
    const keluar = pakaiOwner ? 700 + n * 40 : 60 + n * 8
    const cacheBaca = pakaiOwner ? 2400 : 0

    // Tarif SAMA dengan lib/ai-harga.ts — angka yang tak sepakat dengan
    // sumber harga akan membuat halaman biaya membantah dirinya sendiri.
    const h = model === 'claude-sonnet-5'
      ? { masuk: 3.0, keluar: 15.0, cacheBaca: 0.3 }
      : { masuk: 1.0, keluar: 5.0, cacheBaca: 0.1 }
    const usd =
      (masuk / 1_000_000) * h.masuk +
      (keluar / 1_000_000) * h.keluar +
      (cacheBaca / 1_000_000) * h.cacheBaca
    const idr = Math.round(usd * 16000 * 100) / 100

    /*
     * `setUTCHours`, BUKAN `setHours`.
     *
     * Diukur: `setHours` memakai zona lokal mesin (WIB, +7), jadi "jam 8 pagi"
     * hari terakhir tersimpan sebagai 01:00 UTC HARI BERIKUTNYA — tanggal yang
     * bahkan belum tiba. Deret harian rute mengelompokkan per UTC, jadi baris
     * itu masuk TOTAL tapi hilang dari GRAFIK.
     *
     * Selisihnya kecil dan tak melempar apa pun; yang terlihat cuma dua angka
     * di layar sama yang tak sepakat.
     */
    const jam = 8 + (n % 9)
    const waktu = new Date(tanggal)
    waktu.setUTCHours(jam, (n * 7) % 60, 0, 0)

    await db.query(
      `INSERT INTO ai_biaya_token
         (company_id, asisten, penyedia, model, ronde,
          token_masuk, token_keluar, token_cache_baca,
          biaya_usd, biaya_idr, kurs_idr, correlation_id, dibuat_pada)
       VALUES ($1, $2, 'anthropic', $3, 1, $4, $5, $6, $7, $8, 16000, $9, $10)`,
      [companyId, asisten, model, masuk, keluar, cacheBaca,
       usd.toFixed(6), idr.toFixed(2), PENANDA, waktu.toISOString()],
    )
    baris++
  }
}

const { rows: t } = await db.query(
  `SELECT count(*)::int n, sum(biaya_idr) total FROM ai_biaya_token WHERE correlation_id = $1`,
  [PENANDA],
)
console.log(`✓ ${t[0].n} baris (${baris} dibuat), total Rp ${Number(t[0].total).toLocaleString('id-ID')}`)
await db.end()
