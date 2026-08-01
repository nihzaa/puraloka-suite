#!/usr/bin/env node
/**
 * PENJAGA KONTRAS WARNA — WCAG 2.1 AA, dihitung dari token.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Audit axe dengan login nyata (2026-07-31) menemukan **296 pelanggaran WCAG
 * AA**, dan **260 di antaranya kontras warna** — jauh terbesar. Semuanya sudah
 * ditutup dengan mengubah nilai token, dan tiap perubahan didokumentasikan
 * dengan angka kontrasnya di `globals.css`.
 *
 * Tapi sampai hari ini **tak ada yang mencegahnya terulang**. Catatan di
 * ROADMAP #14d menyebutnya jujur: *"Kontras warna tetap tak dijaga otomatis
 * (butuh browser + login; kredensial di CI ditolak sadar)"*.
 *
 * Itu benar untuk axe — ia butuh halaman ter-render. Tapi **tidak benar untuk
 * TOKEN**: warnanya literal di `globals.css`, dan kontras adalah aritmetika
 * murni atas dua nilai hex. Yang tak bisa dijaga statis hanyalah "pasangan
 * mana yang benar-benar bertemu di layar" — dan itu justru sudah tercatat,
 * karena tiap perbaikan 2026-07-31 menyebut latar mana yang diuji.
 *
 * Jadi yang dijaga di sini: **pasangan token yang SUDAH TERBUKTI bertemu**,
 * di kedua mode. Token baru yang gagal → CI merah, sebelum sempat dipakai.
 *
 * ── Yang TIDAK dijaga (jujur soal batasnya)
 *
 * Warna yang ditulis langsung di komponen (`color: "#9CA3AF"`) tak terlihat
 * dari sini. Itu sebabnya penjaga ini disertai pemeriksaan kedua: hex mentah
 * di `app/` dan `components/` yang BUKAN token dilaporkan sebagai hutang.
 *
 * Jalankan: node apps/web/scripts/kontras-ratchet.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AKAR = join(import.meta.dirname, '..')
const CSS = readFileSync(join(AKAR, 'app', 'globals.css'), 'utf8')

/** Ambil token dari satu blok — `:root` (terang) atau `.dark` (gelap). */
function tokenDari(blokAwal) {
  const mulai = CSS.indexOf(blokAwal)
  if (mulai === -1) throw new Error(`Blok ${blokAwal} tak ditemukan di globals.css`)
  // Sampai penutup blok pada kolom 0 — `}` yang berdiri sendiri di awal baris.
  const sisa = CSS.slice(mulai)
  const akhir = sisa.search(/\n\}/)
  const blok = sisa.slice(0, akhir === -1 ? undefined : akhir)
  const peta = {}
  for (const m of blok.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{3,8})\s*;/gm)) {
    peta[m[1]] = m[2]
  }
  return peta
}

/** #RGB / #RRGGBB → [r,g,b] 0..255. */
function rgb(hex) {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6) // buang alpha; lihat catatan CAMPURAN
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

/** Luminansi relatif WCAG. */
function luminansi(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Rasio kontras WCAG antara dua warna. */
function kontras(a, b) {
  const la = luminansi(a), lb = luminansi(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Pasangan yang WAJIB lulus 4.5:1 (teks normal, WCAG AA).
 *
 * Daftar ini BUKAN semua kombinasi yang mungkin — itu akan menghasilkan
 * ratusan pasangan yang tak pernah bertemu di layar, dan penjaga yang penuh
 * temuan palsu melatih pembacanya mengabaikannya.
 *
 * Yang ada di sini adalah pasangan yang **terbukti bertemu**, diambil dari
 * catatan perbaikan 2026-07-31 di `globals.css` — tiap komentar di sana
 * menyebut latar mana yang diuji dan berapa hasilnya.
 */
const WAJIB_45 = [
  ['--text-primary', '--bg'],
  ['--text-primary', '--surface'],
  ['--text-primary', '--surface-subtle'],
  ['--text-primary', '--surface-hover'],
  ['--text-secondary', '--bg'],
  ['--text-secondary', '--surface'],
  ['--text-secondary', '--surface-subtle'],
  ['--text-secondary', '--surface-hover'],
  ['--text-muted', '--bg'],
  ['--text-muted', '--surface'],
  ['--text-muted', '--surface-subtle'],
  ['--text-muted', '--surface-hover'],
  // Teks status di atas latar status-nya sendiri — badge & panel peringatan.
  ['--success', '--success-bg'],
  ['--warning', '--warning-bg'],
  ['--danger', '--danger-bg'],
  ['--info', '--info-bg'],
  // Teks status di atas permukaan biasa (ikon & angka berwarna di kartu).
  ['--success', '--surface'],
  ['--warning', '--surface'],
  ['--danger', '--surface'],
  ['--info', '--surface'],
  // Tombol utama: teks di atas navy.
  ['--on-navy', '--navy'],
]

/**
 * Pasangan yang dikecualikan di mode GELAP, dengan alasan.
 *
 * `--navy-light` di mode gelap adalah `rgba(...)` transparan, bukan hex —
 * kontrasnya tak bisa dihitung tanpa tahu apa yang ada di belakangnya.
 * Mengabaikannya lebih jujur daripada menghitung alpha-nya sebagai putih.
 */
const LEWATI_GELAP = new Set(['--navy-light', '--navy-glow'])

const AMBANG_AA = 4.5

let gagal = []
let diperiksa = 0

for (const [mode, blok] of [['terang', ':root'], ['gelap', '.dark']]) {
  const token = tokenDari(blok === ':root' ? ':root {' : '.dark {')
  for (const [depan, belakang] of WAJIB_45) {
    if (mode === 'gelap' && (LEWATI_GELAP.has(depan) || LEWATI_GELAP.has(belakang))) continue
    const a = token[depan], b = token[belakang]
    // Token yang tak ada di salah satu mode (mis. `--surface-2` hanya terang)
    // dilewati — bukan kegagalan, memang tak dipakai di sana.
    if (!a || !b) continue
    diperiksa++
    const r = kontras(a, b)
    if (r < AMBANG_AA) {
      gagal.push(`${mode}: ${depan} (${a}) di atas ${belakang} (${b}) = ${r.toFixed(2)}:1`)
    }
  }
}

// ── Pemeriksaan kedua: warna hex mentah di komponen ─────────────────────────
//
// Token yang lulus tak menjamin layarnya lulus — warna yang ditulis langsung
// (`color: "#9CA3AF"`) tak lewat sini sama sekali. Itu persis cara 260
// pelanggaran lolos selama berbulan-bulan.
//
// Ini dihitung sebagai HUTANG ber-ambang, bukan kegagalan: mengubah ratusan
// hex sekaligus adalah perubahan besar yang butuh audit axe ulang, dan
// memaksanya sekarang akan membuat penjaga ini diabaikan.
import { readdirSync } from 'node:fs'
function berkasTsx(dir) {
  const h = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'ds-bundle') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) h.push(...berkasTsx(p))
    else if (e.name.endsWith('.tsx')) h.push(p)
  }
  return h
}

/**
 * Hutang hex mentah — HANYA BOLEH TURUN.
 *
 * 394 adalah HASIL UKUR 2026-08-01, bukan target yang dipilih. Tiap satu di
 * antaranya adalah warna yang tak lewat token, jadi tak terjaga penjaga ini —
 * persis cara 260 pelanggaran kontras lolos berbulan-bulan.
 *
 * TIDAK dipaksa nol sekarang: mengubah 394 hex sekaligus adalah perubahan
 * besar yang butuh audit axe ulang, dan memaksanya akan membuat penjaga ini
 * diabaikan. Yang ditegakkan: jangan BERTAMBAH.
 */
const AMBANG_HEX = 394

let hex = 0
for (const f of [...berkasTsx(join(AKAR, 'app')), ...berkasTsx(join(AKAR, 'components'))]) {
  const isi = readFileSync(f, 'utf8')
  for (const b of isi.split('\n')) {
    const t = b.trim()
    if (t.startsWith('//') || t.startsWith('*')) continue
    // Hex pada properti warna, bukan di komentar atau URL.
    hex += (b.match(/\b(color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*["']?#[0-9A-Fa-f]{3,8}/g) || []).length
  }
}

if (gagal.length) {
  console.error('\n❌ PENJAGA KONTRAS GAGAL — pasangan token di bawah WCAG AA (4,5:1):\n')
  gagal.forEach((g) => console.error('   ' + g))
  console.error('\n   Kontras adalah aritmetika, bukan selera: teks di bawah 4,5:1 tak')
  console.error('   terbaca oleh sebagian pengguna — dan pengguna software ini')
  console.error('   mandor/tukang dengan HP layar tergores di bawah matahari.')
  console.error('\n   Perbaiki NILAI TOKEN-nya di app/globals.css, dan tulis angka')
  console.error('   kontras barunya di komentar seperti perbaikan 2026-07-31.\n')
  process.exit(1)
}

console.log(`✅ Kontras token: ${diperiksa} pasangan lulus WCAG AA (≥4,5:1) di kedua mode`)
console.log(`ℹ️  Hex mentah di komponen: ${hex} — tak lewat token, tak terjaga penjaga ini`)
if (hex > AMBANG_HEX) {
  console.error(`\n❌ Hex mentah NAIK (${hex} > ${AMBANG_HEX}) — pakai token, jangan hex literal.`)
  process.exit(1)
}
