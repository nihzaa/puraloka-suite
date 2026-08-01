#!/usr/bin/env node
/**
 * PENJAGA CATCH SENYAP (WEB) — tindakan pemakai yang gagal tanpa pemberitahuan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA, DAN KENAPA ATURANNYA BEDA DARI SISI API
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Di API, `catch {}` kosong berarti kehilangan jejak untuk penyelidikan
 * (`audit-catch-senyap.mjs`). Di web akibatnya berbeda dan lebih langsung:
 * orang MENEKAN TOMBOL, tak terjadi apa-apa, dan layar tetap menampilkan
 * seolah berhasil.
 *
 * Yang ditemukan 2026-08-01, semuanya `catch {}` pada aksi pemakai — dan
 * semuanya memperbarui tampilan lokal SEBELUM tahu servernya menerima:
 *
 *   · `users.tsx` — menonaktifkan akun. Daftar berubah jadi "nonaktif",
 *     server menolak, orang itu masih bisa masuk. Ini tindakan KEAMANAN.
 *   · `notification-panel` — approve/reject kasbon. Barisnya berubah jadi
 *     "sudah ditindak"; kasbonnya tak berubah. Mandor menunggu pencairan
 *     yang tak pernah disetujui, penyetujunya yakin sudah menyetujui.
 *   · `mandor.tsx` — menyetujui laporan upah, yaitu persetujuan PEMBAYARAN.
 *   · `kas.tsx` — membatalkan transfer & menolak pengeluaran. Kembarannya
 *     (`handleApproveExpense`) memberi tahu sejak awal; yang ini diam.
 *     Inkonsistensi itu bukan keputusan, hanya kelupaan.
 *
 * ── Yang DIIZINKAN
 *
 * Pemuatan latar (`load…`, `fetch…`, polling) dan preferensi tampilan
 * (`localStorage`) boleh gagal tanpa dialog — memunculkan kotak error untuk
 * tata letak dashboard justru mengganggu. Tapi harus DITANDAI `best-effort`
 * berikut alasannya, supaya keputusan itu terbaca alih-alih tersirat.
 *
 * ⚠️ Ambang NOL untuk aksi pemakai. Perbaikannya satu baris.
 *
 * Jalankan: node apps/web/scripts/catch-senyap-ratchet.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const AMBANG = 0

/** Nama fungsi yang menandakan "dipicu tindakan pemakai". */
const POLA_AKSI =
  /^(handle|submit|save|simpan|delete|hapus|cancel|batal|approve|reject|tolak|toggle|kirim|bayar|update|ubah|tambah|buat|create|remove|pilih|set)[A-Z_]?/i

/** Ditandai sengaja best-effort. */
const POLA_SENGAJA = /best-effort/i

function berkas(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'ds-bundle') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) h.push(...berkas(p))
    else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) h.push(p)
  }
  return h
}

const temuan = []

for (const f of [...berkas(join(AKAR, 'app')), ...berkas(join(AKAR, 'components')), ...berkas(join(AKAR, 'lib'))]) {
  const rel = relative(AKAR, f).replace(/\\/g, '/')
  const baris = readFileSync(f, 'utf8').split('\n')

  for (let i = 0; i < baris.length; i++) {
    const m = /\bcatch\s*(?:\([^)]*\))?\s*\{/.exec(baris[i])
    if (!m) continue

    // Badan catch sampai kurung seimbang.
    let dalam = 0
    const badan = []
    let selesai = false
    for (let k = i; k < Math.min(i + 25, baris.length); k++) {
      const teks = k === i ? baris[i].slice(m.index + m[0].length - 1) : baris[k]
      for (const ch of teks) {
        if (ch === '{') dalam++
        else if (ch === '}') {
          dalam--
          if (dalam === 0) { selesai = true; break }
        }
      }
      badan.push(teks)
      if (selesai) break
    }

    const mentah = badan.join('\n')
    if (POLA_SENGAJA.test(mentah)) continue

    const isi = mentah
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/[{}]/g, '')
      .trim()
    if (isi) continue

    // Fungsi pembungkusnya — aksi pemakai atau pemuatan latar?
    let nama = '?'
    for (let k = i; k > Math.max(0, i - 70); k--) {
      const mm = /(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=\s*(?:useCallback\()?\s*(?:async\s*)?\(/.exec(baris[k])
      if (mm) { nama = mm[1] ?? mm[2]; break }
    }
    if (!POLA_AKSI.test(nama)) continue

    temuan.push(`${rel}:${i + 1}  ${nama}()`)
  }
}

console.log(`Aksi pemakai yang gagal tanpa pemberitahuan: ${temuan.length}`)

if (temuan.length > AMBANG) {
  console.error(`\n❌ PENJAGA CATCH SENYAP (WEB) GAGAL: ${temuan.length} > ambang ${AMBANG}\n`)
  console.error('   Orang menekan tombol, tak terjadi apa-apa, dan layar tetap menampilkan')
  console.error('   seolah berhasil — biasanya karena tampilan lokal diperbarui SEBELUM')
  console.error('   tahu servernya menerima.')
  console.error('\n   Perbaikan: tampilkan pesannya (`alert` / toast, ikuti pola berkas itu).')
  console.error('   Kalau kegagalannya MEMANG boleh diam (pemuatan latar, preferensi')
  console.error('   tampilan), tulis `best-effort: <alasan>` di dalam catch-nya.\n')
  temuan.slice(0, 20).forEach((t) => console.error(`     ${t}`))
  console.error('')
  process.exit(1)
}
