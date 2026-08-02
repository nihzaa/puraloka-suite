#!/usr/bin/env node
/**
 * PENJAGA PENULISAN SENYAP — `update`/`delete`/`insert` yang hasilnya dibuang.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `audit-kegagalan-senyap.mjs` menjaga sisi BACA (`data ?? []` menelan error).
 * Sisi TULIS tak dijaga apa pun, dan bentuknya lebih berbahaya:
 *
 *     await supabase.from('work_scopes').update({ status: 'completed' }).eq(…)
 *
 * Tanpa `const { error } =` di depannya, kegagalan apa pun — constraint, RLS,
 * kolom salah, baris tak ketemu — lewat tanpa jejak. Request tetap membalas
 * 200, orang melihat "berhasil", dan datanya tidak berubah.
 *
 * ── Tiga yang ditemukan saat penjaga ini dibuat (2026-08-01)
 *
 *   · `mandor.ts` — settlement borongan tersimpan, lalu scope ditandai
 *     `completed`. Kalau langkah kedua gagal: settlement ADA tapi scope masih
 *     aktif. Mandor terlihat masih mengerjakan pekerjaan yang sudah dilunasi.
 *
 *   · `roles.ts` — ganti-permission memakai pola replace-all: `DELETE` lalu
 *     `INSERT`. Kalau DELETE gagal dan INSERT berhasil, role keluar dengan
 *     permission LAMA + BARU sekaligus. Ini bukan data rusak biasa — itu
 *     pemberian akses yang tak diminta siapa pun.
 *
 *   · `progress.ts` / `rab.ts` — `progress_pct` tak tersimpan, API tetap 200.
 *     Orang mengetik ulang, mengira dirinya yang salah.
 *
 * ── Kenapa RATCHET, bukan larangan
 *
 * Sebagian penulisan memang boleh gagal diam-diam: audit log, notifikasi,
 * pembersihan best-effort. Memaksa semuanya diperiksa akan menambah cabang
 * error yang tak berarti — dan cabang yang tak pernah dijalankan adalah cabang
 * yang tak pernah diuji.
 *
 * Yang ditegakkan: jumlahnya tak boleh naik. Kode baru yang menulis harus
 * memeriksa hasilnya, atau menyatakan alasan lewat komentar `// best-effort`.
 *
 * 41 → 26 pada hari penjaga ini dibuat. Sebelas yang ditutup semuanya
 * mengubah keadaan, dan semuanya gagal ke arah yang sama: request membalas
 * 200 sementara datanya separuh jalan —
 *   · pembayaran termin tercatat, invoice tak jadi lunas (klien ditagih lagi)
 *   · saldo stok tak berkurang padahal mutasinya tercatat (selisih opname)
 *   · settlement borongan lunas, scope tetap aktif
 *   · ganti-permission role bisa MENAMBAH akses alih-alih menggantinya
 *   · progress_pct item & proyek tak tersimpan (Kurva S & SPI ikut salah)
 *   · logo terunggah tapi tak terpasang (orang mengunggah berulang)
 *
 * Jalankan: node apps/api/scripts/audit-tulis-tanpa-periksa.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = join(import.meta.dirname, '..', 'src', 'routes')

/**
 * AMBANG — penulisan yang hasilnya tak diperiksa.
 *
 * 2026-08-02: 26 → 17. Sembilan yang ditutup semuanya berbentuk "operasi utama
 * berhasil, susulannya gagal diam-diam":
 *
 *   finance.ts:1181    pembayaran tersimpan, invoice tetap terlihat BELUM LUNAS
 *                      — klien ditagih untuk uang yang sudah dia bayar
 *   progress.ts:285    log progres tersimpan, `projects.progress_pct` tertinggal
 *                      — Kurva S, EVM, dan laporan klien memakai angka lama
 *   estimate-versions  ×3 — item masuk, `total_amount` tak ikut naik
 *   companies.ts:330   penurunan default gagal → DUA badan usaha default
 *   mandor.ts:767      item tersimpan tanpa spesifikasi teknisnya
 *   auth.ts ×2         `auth_id` gagal tertaut (dicatat, tak memblokir login)
 *
 * Sisanya mayoritas rollback dan audit log yang memang sah diabaikan.
 *
 * ⚠️ HANYA BOLEH TURUN. Kalau gagal karena NAIK: tangkap `error`-nya dan
 * balas 500, ATAU tulis `// best-effort: <alasan>` tepat di atasnya kalau
 * kegagalannya memang boleh diabaikan. Jangan naikkan angkanya.
 */
const AMBANG = 17

/** Penulisan yang memang boleh gagal diam-diam, ditandai di kodenya. */
const POLA_SENGAJA = /\/\/\s*best-effort/i

function berkasRute(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === '__tests__') continue
      h.push(...berkasRute(join(dir, e.name)))
      continue
    }
    if (e.name.endsWith('.ts')) h.push(join(dir, e.name))
  }
  return h
}

const temuan = []

for (const f of berkasRute(AKAR)) {
  const rel = f.slice(f.indexOf('src')).replace(/\\/g, '/')
  const baris = readFileSync(f, 'utf8').split('\n')

  for (let i = 0; i < baris.length; i++) {
    const t = baris[i].trim()

    // `await …` yang TIDAK di-assign ke apa pun. Kalau ada `const { … } =`
    // di depannya, penulisnya setidaknya PUNYA cara tahu.
    if (!/^await\s/.test(t)) continue
    if (!/^await\s+(supabase|request\.db!?|db)\b/.test(t) && !t.includes('.from(')) continue

    // Statement ini menulis? Chain bisa memanjang beberapa baris.
    const blok = baris.slice(i, i + 25).join('\n')
    if (!/\.(update|delete|insert|upsert)\s*\(/.test(blok)) continue

    // Ditandai sengaja best-effort (di baris itu atau 3 baris di atasnya)?
    const konteks = baris.slice(Math.max(0, i - 3), i + 1).join('\n')
    if (POLA_SENGAJA.test(konteks)) continue

    temuan.push(`${rel}:${i + 1}  ${t.slice(0, 76)}`)
  }
}

console.log(`Penulisan tanpa pemeriksaan hasil: ${temuan.length}`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA PENULISAN SENYAP GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   `update`/`delete`/`insert` yang hasilnya dibuang membuat kegagalan')
  console.error('   apa pun — constraint, RLS, kolom salah — lewat tanpa jejak. Request')
  console.error('   tetap membalas 200, orang melihat "berhasil", datanya tidak berubah.')
  console.error('\n   Perbaikan: `const { error } = await …` lalu balas 500 kalau gagal.')
  console.error('   Kalau kegagalannya MEMANG boleh diabaikan (audit log, notifikasi,')
  console.error('   pembersihan), tulis `// best-effort: <alasan>` tepat di atasnya —')
  console.error('   supaya keputusan itu terbaca, bukan tersirat.\n')
  temuan.slice(0, 20).forEach((t) => console.error(`     ${t}`))
  console.error('')
  process.exit(1)
}

if (temuan.length < AMBANG) {
  console.log(`\n📉 Turun dari ambang (${temuan.length} < ${AMBANG}) — kencangkan angkanya.`)
}
