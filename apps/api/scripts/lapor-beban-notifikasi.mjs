#!/usr/bin/env node
/**
 * lapor-beban-notifikasi.mjs — berapa berat kotak masuk orang, dan KENAPA
 *
 * ══ Kenapa skrip ini ada
 *
 * Diukur 2026-09-01 saat menelusuri otomasi: 4.556 notifikasi dalam 7 hari,
 * 217 per orang per minggu, dan `is_read` NOL dari 8.955 baris sejak
 * 2026-08-16.
 *
 * Angka itu terlihat seperti tiga cacat besar sekaligus. Ketiganya bukan:
 *
 *   1. "0 dibaca" → BUKAN jalur rusak. Kolomnya diuji bisa ditulis (UPDATE
 *      lalu dikembalikan), rute PATCH .../read dan /read-all ada, dan web
 *      memanggilnya. Nol karena belum ada yang MEMBUKA daftarnya.
 *
 *   2. "46 kembar hari ini" → BUKAN kembar. Penjaganya lupa `company_id`;
 *      ke-46-nya notifikasi sah untuk orang yang jadi anggota beberapa PT.
 *      Diperbaiki commit 8b6ae790.
 *
 *   3. "29 jenis prioritasnya tak konsisten" → DISENGAJA.
 *      `priority: h.mendesak ? 'high' : 'normal'` — prioritas memang
 *      dihitung dari keadaan, bukan dipaku per jenis.
 *
 * Dan sisanya artefak data uji: 24 material punya `min_stock > 0` sementara
 * `gudang_stok` cuma 8 baris berisi, jadi 16 material MEMANG di bawah
 * minimum. Peringatannya benar.
 *
 * ── Kenapa dilaporkan, bukan dijaga
 *
 * Tak ada ambang yang benar untuk "berapa notifikasi terlalu banyak" — itu
 * bergantung berapa proyek berjalan dan berapa perusahaan yang diikuti
 * orangnya. Penjaga berambang tebakan akan merah untuk keadaan sehat, lalu
 * berhenti dibaca.
 *
 * Yang dilaporkan: beban, sebarannya, dan berapa yang bisa dijelaskan oleh
 * multi-tenant — supaya sesi berikutnya tak mengulang empat penyelidikan di
 * atas dari nol.
 */
import { buatClient } from '../../../scripts/db/_koneksi.mjs'

const HARI = Number(process.env.HARI ?? 7)
const c = buatClient()
await c.connect()

const q = async (s, p = []) => (await c.query(s, p)).rows

const k = (await q(`
  SELECT count(*)::int total,
         count(*) FILTER (WHERE is_read)::int dibaca,
         count(DISTINCT user_id)::int penerima,
         count(DISTINCT company_id)::int company
    FROM notifications WHERE created_at > now() - interval '${HARI} days'`))[0]

if (k.total === 0) {
  console.log(`\n── Nol notifikasi dalam ${HARI} hari terakhir.`)
  console.log('   Itu sendiri layak diperiksa: otomasi terjadwal seharusnya menghasilkan')
  console.log('   sesuatu. Ukur `jadwal_tugas` (BUKAN `otomasi_jalan`):')
  console.log("     SELECT aktif, terakhir_status, count(*) FROM jadwal_tugas GROUP BY 1,2;")
  await c.end()
  process.exit(0)
}

console.log(`\n══ BEBAN NOTIFIKASI — ${HARI} hari terakhir ═══════════════════`)
console.log(`   ${k.total} notifikasi · ${k.penerima} penerima · ${k.company} perusahaan`)
console.log(`   rata-rata ${(k.total / k.penerima).toFixed(0)} per orang per ${HARI} hari`)
console.log(`   sudah dibaca: ${k.dibaca} (${(k.dibaca / k.total * 100).toFixed(1)}%)`)

if (k.dibaca === 0) {
  console.log('')
  console.log('   ℹ  Nol dibaca BUKAN bukti jalur rusak. Kolom `is_read` terbukti bisa')
  console.log('      ditulis, dan rute PATCH /api/v1/notifications/:id/read ada. Nol')
  console.log('      berarti belum ada yang membuka daftarnya.')
}

console.log(`\n── Penerima terberat`)
for (const r of await q(`
  SELECT u.email, count(*)::int n, count(DISTINCT n2.company_id)::int co
    FROM notifications n2 JOIN users u ON u.id = n2.user_id
   WHERE n2.created_at > now() - interval '${HARI} days'
   GROUP BY u.email ORDER BY 2 DESC LIMIT 5`))
  console.log(`   ${String(r.email).padEnd(38)} ${String(r.n).padStart(4)}  (${r.co} perusahaan)`)

/*
  Bagian ini yang paling mudah salah dibaca, dan sudah salah dibaca sekali.

  Orang yang mengikuti beberapa perusahaan menerima peringatan yang sama dari
  masing-masing — dan itu BENAR: menekan yang kedua berarti satu perusahaan
  diam-diam tak pernah dikabari. Jadi bebannya tinggi tanpa satu pun cacat.
*/
const m = (await q(`
  WITH x AS (
    SELECT user_id, type, action_data->>'record_id' rid,
           count(DISTINCT company_id)::int co, count(*)::int n
      FROM notifications
     WHERE created_at > now() - interval '${HARI} days'
       AND action_data->>'record_id' IS NOT NULL
     GROUP BY 1,2,3)
  SELECT coalesce(sum(n) FILTER (WHERE co > 1), 0)::int lintas,
         coalesce(sum(n), 0)::int semua FROM x`))[0]

if (m.semua > 0) {
  console.log(`\n── Berapa yang dijelaskan multi-tenant`)
  console.log(`   ${m.lintas} dari ${m.semua} notifikasi ber-record_id adalah hal yang SAMA`)
  console.log(`   dilaporkan oleh perusahaan BERBEDA ke orang yang sama (${(m.lintas / m.semua * 100).toFixed(0)}%).`)
  console.log('   Itu perilaku benar, bukan kembar — satu orang, beberapa PT.')
}

console.log(`\n── Jenis paling ramai`)
for (const r of await q(`
  SELECT type, count(*)::int n,
         count(DISTINCT action_data->>'record_id')::int entitas,
         count(DISTINCT company_id)::int co
    FROM notifications WHERE created_at > now() - interval '${HARI} days'
   GROUP BY 1 ORDER BY 2 DESC LIMIT 8`)) {
  const rasio = r.entitas > 0 ? (r.n / r.entitas).toFixed(1) : '—'
  console.log(`   ${String(r.n).padStart(4)}  ${String(r.type).padEnd(28)} ${String(r.entitas).padStart(3)} entitas ×${rasio} · ${r.co} co`)
}

console.log(`\n── Prioritas`)
for (const r of await q(`
  SELECT coalesce(priority,'(null)') p, count(*)::int n
    FROM notifications WHERE created_at > now() - interval '${HARI} days'
   GROUP BY 1 ORDER BY 2 DESC`))
  console.log(`   ${String(r.p).padEnd(10)} ${String(r.n).padStart(5)}`)

/*
  ── Yang PALING menjelaskan beban: peristiwa proyek dikirim ke SEMUA pemegang
     izin, bukan ke orang proyek itu.

  Diukur 2026-09-01. `punch_lewat_target` 504 notifikasi terurai tepat:

      36 entitas × 14 penerima × 1 hari = 504

  Bukan pengulangan — satu temuan dikirim ke 14 orang sekaligus, dan ke-14-nya
  menerima KE-36 punch list, termasuk dari proyek yang bukan miliknya. Mandor
  Budi diberi tahu 36 temuan padahal mungkin menangani satu proyek.

  Sebabnya konfigurasi, bukan kode: aturannya `target_type = 'permission'`
  (`punch:manage`). Mekanisme yang lebih sempit SUDAH ADA dan bekerja —
  `project_mandors` dan `project_pm` di `resolveRecipients` — tapi diukur hari
  itu: 1.280 target `permission` vs 14 `project_pm` dan 2 `project_mandors`.

  Ini TIDAK diperbaiki dari sini: aturan notifikasi adalah konfigurasi
  per-tenant lewat UI, dan mempersempitnya mengubah siapa yang dikabari —
  keputusan pemilik perusahaan, bukan keputusan teknis. Yang dilaporkan:
  berapa banyak beban yang berasal dari sini, supaya keputusannya berdasar
  angka.
*/
{
  /*
    EXISTS, BUKAN JOIN. Versi pertama skrip ini memakai JOIN ke
    `notification_rule_targets`, dan tiap notifikasi tergandakan sebanyak
    target aturannya: `absensi_berhenti` terlapor 6.630 padahal totalnya 255.

    Kesalahan yang sama bentuknya dengan yang ditemukan hari itu juga —
    mengukur dengan kunci yang tak cocok, lalu percaya angkanya. Yang
    menyelamatkan: angkanya JAUH lebih besar dari total yang sudah dicetak
    beberapa baris di atas. Alat ukur yang menampilkan totalnya sendiri
    membuat kesalahan seperti ini terlihat.
  */
  const luas = await q(`
    SELECT x.type AS event_type, count(*)::int n,
           count(DISTINCT x.user_id)::int penerima,
           count(DISTINCT x.action_data->>'record_id')::int entitas
      FROM notifications x
     WHERE x.created_at > now() - interval '${HARI} days'
       AND x.action_data->>'record_id' IS NOT NULL
       AND EXISTS (
             SELECT 1 FROM notification_rules r
               JOIN notification_rule_targets t ON t.rule_id = r.id
              WHERE r.event_type = x.type AND t.target_type = 'permission')
     GROUP BY 1 HAVING count(DISTINCT x.user_id) > 3
     ORDER BY 2 DESC LIMIT 5`)

  if (luas.length > 0) {
    console.log(`
── Peristiwa proyek yang dikirim LUAS (target: izin, bukan orang proyek)`)
    for (const r of luas)
      console.log(`   ${String(r.n).padStart(4)}  ${String(r.event_type).padEnd(28)} ${String(r.entitas).padStart(3)} entitas → ${r.penerima} orang`)
    console.log('')
    console.log('   Mekanisme yang lebih sempit SUDAH ADA (`project_mandors`, `project_pm`)')
    console.log('   dan bekerja. Mempersempit = keputusan pemilik perusahaan, bukan teknis:')
    console.log('   ia mengubah siapa yang dikabari. Ukur dulu sebarannya:')
    console.log("     SELECT target_type, count(*) FROM notification_rule_targets GROUP BY 1;")
  }
}

console.log('')
console.log('   ⚠ Prioritas SATU jenis boleh berbeda-beda — itu disengaja:')
console.log("     `priority: h.mendesak ? 'high' : 'normal'`. Jangan menyebutnya")
console.log('     tak konsisten tanpa membaca kodenya lebih dulu.')
console.log('')

await c.end()
