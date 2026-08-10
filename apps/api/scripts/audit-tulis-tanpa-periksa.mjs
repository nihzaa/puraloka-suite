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

/**
 * AMBANG KEDUA — `update`/`delete` yang hanya mengambil `{ error }`.
 *
 * ── Lubang yang ditemukan 2026-08-10, oleh cacat nyata
 *
 * Penjaga di atas berhenti pada premis "kalau ada `const { … } =` di depannya,
 * penulisnya setidaknya PUNYA cara tahu." Untuk `insert` itu benar. Untuk
 * `update` dan `delete` ia TIDAK benar, dan bedanya penting:
 *
 *     const { error } = await db.from('wa_template').update({ isi }).eq('id', id)
 *     if (error) return 500
 *     return { ok: true }        // ← nol baris tersentuh juga sampai di sini
 *
 * `error` hanya terisi kalau QUERY-nya gagal. Id milik tenant lain, id yang
 * barisnya sudah terhapus, atau `.eq()` yang tak cocok dengan apa pun
 * menghasilkan NOL BARIS tanpa satu pun galat.
 *
 * Ini ditemukan di `wa/template` (S4): yang menyunting isi pesan WhatsApp
 * melihat "tersimpan", menutup halaman, dan teks lama tetap yang terkirim ke
 * pelanggan. Tak ada tanda apa pun bahwa suntingannya tak pernah ada — bentuk
 * kegagalan yang persis sama dengan yang penjaga ini dibuat untuk menangkap,
 * hanya lewat pintu yang tak dijaganya.
 *
 * ── Kenapa 76, bukan 0
 *
 * Polanya sudah tersebar puluhan tempat saat lubang ini ditemukan, dan
 * memerahkan CI hari ini hanya akan membuat penjaganya dimatikan. Yang
 * ditegakkan sama seperti di atas: TAK BOLEH NAIK.
 *
 * Angkanya sendiri sempat salah dua kali, dan keduanya pantas dicatat karena
 * bentuknya berulang di alat pemeriksa:
 *
 *   · 91 — jendela pemindaian 25 baris buta membuat `insert` di `ahsp.ts:221`
 *     dilaporkan karena menjangkau `update` di baris 226, STATEMENT LAIN.
 *     Temuan yang menunjuk baris salah mengirim yang memperbaikinya ke tempat
 *     yang tak punya cacat. → `potongStatement()`.
 *   · 77 — penanda `// best-effort` hanya dibaca 3 baris ke atas, jadi
 *     penanda yang MENYERTAKAN alasannya tak terlihat. Batas itu menghukum
 *     persis kebiasaan yang penjaga ini minta. → `blokKomentarDiAtas()`.
 *
 * Cara menutup satu temuan: tambahkan `.select('id')`, periksa panjang
 * datanya, dan balas 404 kalau nol. Atau tulis `// best-effort: <alasan>`
 * kalau nol baris memang bukan kegagalan.
 */
const AMBANG_ERROR_SAJA = 76

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

/**
 * Satu statement, dari baris `i` sampai chain-nya habis.
 *
 * Batasnya: baris pertama yang mengakhiri chain dan tidak disambung — yaitu
 * yang tak diakhiri titik, koma, kurung buka, atau operator. Dibatasi 25 baris
 * supaya berkas dengan bentuk tak terduga tak membuat pemindaian berjalan
 * sampai akhir berkas.
 */
function potongStatement(baris, i) {
  const keluar = []
  for (let j = i; j < Math.min(baris.length, i + 25); j++) {
    const b = baris[j]
    keluar.push(b)
    const t = b.trim()
    if (j === i) continue
    // Chain berlanjut kalau baris BERIKUTNYA diawali titik (`.eq(...)`) —
    // itu penanda paling andal di gaya kode repo ini.
    const lanjut = (baris[j + 1] ?? '').trim().startsWith('.')
    if (!lanjut && /[)\]};]$/.test(t)) break
  }
  return keluar.join('\n')
}

/**
 * Blok komentar yang menempel tepat di atas baris `i`.
 *
 * Naik selama barisnya komentar (`//`, `*`, `/*`, `*​/`). Berhenti pada baris
 * kode atau baris kosong — komentar yang dipisah baris kosong tak lagi
 * "menempel" pada statement ini.
 */
function blokKomentarDiAtas(baris, i) {
  const keluar = []
  for (let j = i - 1; j >= 0; j--) {
    const t = baris[j].trim()
    if (t === '') break
    if (!/^(\/\/|\/\*|\*)/.test(t)) break
    keluar.unshift(t)
  }
  return keluar
}

const temuan = []
/** Temuan jenis kedua: `update`/`delete` yang hanya mengambil `{ error }`. */
const temuanErrorSaja = []

for (const f of berkasRute(AKAR)) {
  const rel = f.slice(f.indexOf('src')).replace(/\\/g, '/')
  const baris = readFileSync(f, 'utf8').split('\n')

  for (let i = 0; i < baris.length; i++) {
    const t = baris[i].trim()

    /*
     * Ditandai sengaja best-effort?
     *
     * Yang dibaca adalah SELURUH blok komentar yang menempel di atas
     * statement, bukan 3 baris tetap. Batas 3 baris menghukum penanda yang
     * menyertakan alasannya — persis yang penjaga ini minta — dan mendorong
     * penanda sebaris tanpa penjelasan, atau tak ada penanda sama sekali.
     */
    const konteks = [baris[i], ...blokKomentarDiAtas(baris, i)].join('\n')
    const sengaja = POLA_SENGAJA.test(konteks)

    /*
     * JENIS KEDUA — `const { error } = await …update(…)`.
     *
     * Diperiksa LEBIH DULU karena bentuknya tak bisa lolos ke pemeriksaan di
     * bawah: baris ini diawali `const`, bukan `await`.
     *
     * Hanya `update`/`delete`. `insert`/`upsert` yang gagal SELALU mengisi
     * `error` — tak ada "nol baris yang berhasil" pada penyisipan, jadi
     * `{ error }` saja memang cukup di sana.
     */
    const destr = /^const\s+\{([^}]*)\}\s*=\s*await\s/.exec(t)
    if (destr) {
      /*
       * Jendela berhenti di AKHIR STATEMENT, bukan 25 baris buta.
       *
       * Versi pertama memakai 25 baris tetap, dan `ahsp.ts:221` — sebuah
       * `insert` — dilaporkan karena jendelanya menjangkau `update` di baris
       * 226, statement BERIKUTNYA. Temuan yang menunjuk baris salah membuat
       * yang memperbaikinya mencari cacat di tempat yang tak punya cacat.
       */
      const blokD = potongStatement(baris, i)
      if (/\.(update|delete)\s*\(/.test(blokD) && !sengaja) {
        const kunci = destr[1]
          .split(',')
          .map((s) => s.trim().split(':')[0].trim())
          .filter(Boolean)
        if (kunci.length === 1 && kunci[0] === 'error') {
          temuanErrorSaja.push(`${rel}:${i + 1}  ${t.slice(0, 76)}`)
        }
      }
      continue
    }

    // `await …` yang TIDAK di-assign ke apa pun. Kalau ada `const { … } =`
    // di depannya, penulisnya setidaknya PUNYA cara tahu.
    if (!/^await\s/.test(t)) continue
    if (!/^await\s+(supabase|request\.db!?|db)\b/.test(t) && !t.includes('.from(')) continue

    // Statement ini menulis? Chain bisa memanjang beberapa baris.
    const blok = baris.slice(i, i + 25).join('\n')
    if (!/\.(update|delete|insert|upsert)\s*\(/.test(blok)) continue

    if (sengaja) continue

    temuan.push(`${rel}:${i + 1}  ${t.slice(0, 76)}`)
  }
}

console.log(`Penulisan tanpa pemeriksaan hasil: ${temuan.length}`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA PENULISAN SENYAP GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   `update`/`delete`/`insert` yang hasilnya dibuang membuat kegagalan')
  console.error('   apa pun — constraint, RLS, kolom salah — lewat tanpa jejak. Request')
  console.error('   tetap membalas 200, orang melihat "berhasil", datanya tidak berubah.')
  console.error('\n   Perbaikan: tangkap hasilnya lalu balas 500 kalau gagal. Untuk')
  console.error('   `update`/`delete`, `{ error }` saja TIDAK cukup — lihat ambang kedua.')
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

// ── Ambang kedua ────────────────────────────────────────────────────────────
console.log(`update/delete yang hanya mengambil {error}: ${temuanErrorSaja.length}`)

if (temuanErrorSaja.length > AMBANG_ERROR_SAJA) {
  console.error(
    `\n❌ PENJAGA "NOL BARIS DIANGGAP BERHASIL" GAGAL: ` +
      `${temuanErrorSaja.length} > ambang ${AMBANG_ERROR_SAJA}\n`,
  )
  console.error('   `const { error } = await db.from(…).update(…).eq(…)` TIDAK bisa')
  console.error('   membedakan "satu baris berubah" dari "tak ada baris yang cocok".')
  console.error('   `error` hanya terisi kalau QUERY-nya gagal — id milik tenant lain,')
  console.error('   atau baris yang sudah terhapus, menghasilkan NOL BARIS tanpa galat.')
  console.error('   Request membalas 200, orang melihat "tersimpan", data tak berubah.')
  console.error('\n   Perbaikan: `.select(\'id\')`, lalu 404 kalau `data.length === 0`.')
  console.error('   Kalau nol baris memang bukan kegagalan, tulis `// best-effort: …`.\n')
  temuanErrorSaja.slice(0, 20).forEach((t) => console.error(`     ${t}`))
  console.error('')
  process.exit(1)
}

if (temuanErrorSaja.length < AMBANG_ERROR_SAJA) {
  console.log(
    `\n📉 Turun dari ambang kedua (${temuanErrorSaja.length} < ${AMBANG_ERROR_SAJA}) — kencangkan angkanya.`,
  )
}
