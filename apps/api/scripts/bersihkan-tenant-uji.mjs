/**
 * Menonaktifkan company sisa uji yang BENAR-BENAR kosong.
 *
 * ── Kenapa menonaktifkan, bukan menambah rantai approval
 *
 * `submittal-aturan.test.ts` menuntut tiap company AKTIF punya rantai
 * approval `submittal`. Beberapa company bernama "Uji Tenant Status", "[UJI-…]", dan "PT Uji …" tak
 * punya — sisa uji yang tak pernah dibersihkan.
 *
 * ⚠ Company SUNGGUHAN yang kurang rantai (PT Puraloka Nusantara & Properti —
 * keduanya punya proyek dan anggota) TIDAK disentuh skrip ini. Mereka butuh
 * rantainya BENAR-BENAR dibuat, dan itu migrasi, bukan pembersihan.
 *
 * Komentar di test itu mencatat bahwa perbaikan dari arah lain sudah pernah
 * dicoba 2026-08-07: rantai DISALIN ke tenant nonaktif lewat migrasi. Itu
 * membuat test-nya hijau dan MERUSAK DUA TEST LAIN yang menghitung level
 * lintas company dengan asumsi hanya ada satu.
 *
 * Jadi arah yang benar bukan memberi rantai kepada tenant yang tak dipakai,
 * melainkan menyatakan bahwa tenant itu memang tak aktif.
 *
 * Syarat KETAT: nol proyek DAN nol anggota. Company yang berisi apa pun
 * dilewati — "kosong" harus terbukti, bukan disimpulkan dari namanya.
 *
 * DINONAKTIFKAN, bukan dihapus: audit log dan jejak lain mungkin merujuknya.
 * Idempoten; uji-kering secara bawaan.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const KERING = !process.argv.includes('--terapkan')
const c = buatClient(); await c.connect()

const { rows } = await c.query(
  `SELECT co.id, co.name FROM companies co
    WHERE co.is_active
      AND (co.name LIKE 'Uji Tenant%' OR co.name LIKE '[UJI%' OR co.name LIKE 'PT Uji %')
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.company_id = co.id)
      AND NOT EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = co.id)
    ORDER BY co.created_at`)

console.log(`company sisa uji yang kosong DAN masih aktif: ${rows.length}\n`)
for (const r of rows) {
  console.log(`  ${r.name}  ${r.id}`)
  if (KERING) { console.log('     (uji kering — pakai --terapkan)'); continue }
  await c.query(`UPDATE companies SET is_active = false WHERE id = $1`, [r.id])
  console.log('     ✅ dinonaktifkan')
}

const { rows: sisa } = await c.query(
  `SELECT count(*)::int n FROM companies c
    WHERE c.is_active
      AND NOT EXISTS (SELECT 1 FROM approval_chains ac
                       WHERE ac.company_id = c.id AND ac.entity_type = 'submittal')`)
console.log(`\ncompany AKTIF tanpa rantai submittal: ${sisa[0].n} (test menuntut 0)`)
await c.end()
