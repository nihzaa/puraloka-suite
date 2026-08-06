#!/usr/bin/env node
/**
 * PENJAGA `opacity` PADA TEKS — kontras yang jatuh tanpa terlihat.
 *
 * ── Kelas cacat yang paling produktif di repo ini
 *
 * `opacity` mencampur warna teks dengan latarnya. Kontras yang terhitung 5:1
 * pada tokennya bisa jatuh ke 2,3:1 setelah `opacity: 0.55` — dan TAK ADA
 * pemindai statis yang melihatnya, karena token di sumber tetap benar.
 *
 * Riwayatnya di repo ini:
 *   sidebar `opacity: 0.55`  → 227 dari 235 pelanggaran a11y (5,98:1 → 2,34:1)
 *   lencana EVM      0,7     → 4,79:1 → 2,82:1
 *   kartu finansial  0,65    → ×6 render per halaman
 *   garis Gantt      0,7     → diwariskan ke label "Hari ini"
 *   judul milestone  0,75    → `--success` yang sendirinya lolos jadi gagal
 *   hitungan foto    0,8     → hanya terlihat di mode gelap
 *
 * Enam kali, semuanya ditemukan lewat axe RUNTIME, tak satu pun oleh
 * pemindai statis. Penjaga ini menutupnya di pintu masuk.
 *
 * ── Yang BUKAN pelanggaran
 *
 * • `opacity` pada elemen tanpa teks (garis, ikon dekoratif, overlay).
 * • Keadaan `disabled` — kontrol nonaktif memang boleh redup (WCAG 1.4.3
 *   mengecualikannya), dan itulah cara paling dikenali menandainya.
 * • Nilai >= 0,9 — pengaruhnya pada kontras di bawah galat pengukuran.
 * • Transisi/animasi (`transition`, `@keyframes`) — nilai sementara.
 *
 * Pakai: node apps/web/scripts/uji-opacity-teks.mjs
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR_WEB = join(dirname(fileURLToPath(import.meta.url)), '..')

/** `opacity: <0.9` sebagai properti gaya. */
const OPACITY = /opacity\s*:\s*(0?\.\d+)/

/**
 * Petunjuk bahwa elemen ini memuat TEKS.
 *
 * Diperiksa pada jendela sekitar, bukan baris yang sama: gaya dan isinya
 * hampir selalu terpisah beberapa baris di JSX.
 */
const ADA_TEKS = /fontSize|fontWeight|font-size|lineHeight|letterSpacing|textTransform/

/** Keadaan yang memang boleh redup. */
const DIKECUALIKAN = /disabled|readOnly|transition|animation|keyframes|aria-hidden|pointerEvents/

const berkas = execSync('grep -rl "opacity" app components --include=*.tsx || true', {
  encoding: 'utf8', cwd: AKAR_WEB,
}).trim().split('\n').filter(Boolean)

const temuan = []

for (const f of berkas) {
  const baris = readFileSync(join(AKAR_WEB, f), 'utf8').split(/\r?\n/)
  let dalamBlok = false
  for (let i = 0; i < baris.length; i++) {
    const b = baris[i]
    if (dalamBlok) { if (/\*\//.test(b)) dalamBlok = false; continue }
    if (/\{?\/\*/.test(b) && !/\*\//.test(b)) { dalamBlok = true; continue }
    if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(b)) continue

    const m = b.match(OPACITY)
    if (!m) continue
    const nilai = parseFloat(m[1])
    if (nilai >= 0.9) continue

    // Jendela: gaya JSX menyebar beberapa baris, dan penanda `disabled`
    // biasanya di atas blok gayanya.
    const sekitar = baris.slice(Math.max(0, i - 6), i + 6).join(' ')
    if (DIKECUALIKAN.test(sekitar)) continue
    if (!ADA_TEKS.test(sekitar)) continue

    // Elemen yang isinya IKON, bukan teks.
    //
    // `<span style={{ color, opacity: 0.5 }}>{icon}</span>` berada di dekat
    // `fontSize` milik SAUDARANYA, jadi jendela di atas menganggapnya teks.
    // Ikon adalah komponen non-teks: ambangnya 3:1, dan meredupkannya justru
    // cara yang benar menandainya sekunder.
    //
    // Diperiksa pada BARIS ITU SENDIRI dan penutupnya, bukan jendela —
    // yang menentukan adalah apa yang dirender elemen ini.
    const barisDanPenutup = baris.slice(i, i + 3).join(' ')
    if (/\{\s*icon\s*\}|<[A-Z]\w+\s+size=|Icon\s*\/?>/.test(barisDanPenutup) &&
        !/>[^<>{}]*[A-Za-z]{3}/.test(barisDanPenutup)) continue

    // Elemen yang isinya BUKAN kata: bilah warna (`background` + tinggi/lebar
    // tanpa isi) dan pemisah satu karakter (`·`, `|`, `—`).
    //
    // Keduanya komponen non-teks: ambangnya 3:1, dan meredupkannya memang cara
    // yang benar membuatnya sekunder. Menuntut kontras teks di situ akan
    // memberi temuan palsu, dan penjaga berisik berhenti dipatuhi.
    if (/background:/.test(b) && !/>[^<>{}]*[A-Za-z]{3}/.test(barisDanPenutup)) continue
    if (/>\s*[·|—–-]\s*</.test(barisDanPenutup)) continue

    // Elemen yang DITUTUP SENDIRI (`<div … />`) tak punya isi sama sekali —
    // bilah legenda, garis pemisah, kotak warna. Tak ada teks yang bisa
    // kehilangan kontras di dalamnya.
    if (/\/>\s*$/.test(b)) continue

    temuan.push({ di: `${f}:${i + 1}`, nilai, isi: b.trim().slice(0, 90) })
  }
}

console.log('')
if (temuan.length === 0) {
  console.log(`✅ opacity pada teks: ${berkas.length} berkas memakai opacity, nol pada teks`)
  process.exit(0)
}

console.log(`❌ ${temuan.length} \`opacity\` pada elemen bertegas teks.\n`)
console.log('   `opacity` mencampur warna teks dengan latarnya. Kontras yang')
console.log('   terhitung benar pada tokennya bisa jatuh di bawah ambang tanpa')
console.log('   satu pun pemindai statis melihatnya — enam kali di repo ini.\n')
console.log('   Perbaikan: buang `opacity`, pakai token warna yang memang lebih')
console.log('   redup (`--text-muted`, `--text-secondary`), atau kecilkan ukuran')
console.log('   fontnya. Untuk `disabled` opacity tetap benar dan dikecualikan.\n')
for (const t of temuan) {
  console.log(`   ${t.di}  (opacity: ${t.nilai})`)
  console.log(`      ${t.isi}\n`)
}
process.exit(1)
