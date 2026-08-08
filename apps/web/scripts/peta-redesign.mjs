#!/usr/bin/env node
/**
 * PETA REDESIGN — matriks konsistensi 105 halaman, DIGENERATE dari kode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Megaprompt redesign 2026-08-08 §12F meminta "matriks konsistensi halaman":
 * baris = tiap halaman, kolom = warna kategori · KPI · quick action · widget ·
 * rail kanan · endpoint. Founder memilih cakupan PENUH — 105 halaman, bukan
 * 12 yang tertulis di §8 brief.
 *
 * 105 baris yang DITULIS TANGAN akan basi pada halaman ke-106. Itu bukan
 * kekhawatiran teoretis: CLAUDE.md dibuka dengan peringatan bahwa angka di
 * dokumen konteks membusuk, dan audit 2026-08-02 mencatatnya sebagai racun
 * konteks paling produktif di repo (F-004). ARAH-VISUAL-2026.md §1b sudah
 * dua kali salah pada angka yang sama ("20 dari 22" -> "16 dari 24" -> keliru).
 *
 * Karena itu matriksnya TIDAK ditulis — ia diukur, dan bisa diukur ulang.
 *
 * ── Dua sumber, dan kenapa keduanya perlu
 *
 *   app/**\/page.tsx   apa yang BENAR-BENAR ada di disk (105)
 *   lib/peta-menu.ts   apa yang SEHARUSNYA ada + status + guna (203 item)
 *
 * Yang satu tak cukup. Berkas di disk tak tahu ia menu apa dan buat apa;
 * peta-menu tak tahu halamannya sudah ditulis atau belum. Menggabungkannya
 * memunculkan dua hal yang justru paling berguna untuk redesign:
 *
 *   - halaman ADA tapi tak terdaftar di peta menu  -> yatim, luput dari audit
 *   - menu HIDUP tapi halamannya tak ada           -> tautan mati
 *
 * ── Kenapa tidak memakai AST
 *
 * Yang dibutuhkan hanya fakta dangkal per halaman (jumlah tabel, apakah sudah
 * memakai komponen bersama, berapa hex mentah). Regex cukup, dan penjaga lain
 * di repo ini (hex-ratchet, tabel-mentah-ratchet) sudah memakai pendekatan
 * yang sama — konsisten dengan tetangganya lebih berharga daripada presisi
 * yang tak terpakai.
 *
 * ── Keluaran
 *
 *   --markdown   tabel siap tempel ke DESIGN-BRIEF.md §F  (default)
 *   --json       untuk dikonsumsi skrip lain
 *   --ringkas    hanya angka agregat
 *
 * Dipakai Fase 0 untuk MENULIS §F, dan Fase 3 untuk MEMERIKSA bahwa tiap
 * halaman benar-benar sudah dipindahkan (DoD §13).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIR_APP = join(AKAR, 'app')

/* ── 1. Halaman nyata di disk ─────────────────────────────────────────── */

function telusuri(dir, keluar = []) {
  for (const nama of readdirSync(dir)) {
    if (nama === 'node_modules' || nama.startsWith('.')) continue
    const penuh = join(dir, nama)
    if (statSync(penuh).isDirectory()) telusuri(penuh, keluar)
    else if (nama === 'page.tsx') keluar.push(penuh)
  }
  return keluar
}

/** `app/(dashboard)/keuangan/invoice/page.tsx` -> `/keuangan/invoice` */
function ruteDari(berkasPenuh) {
  const rel = relative(DIR_APP, berkasPenuh).split(sep).slice(0, -1)
  const seg = rel.filter((s) => !(s.startsWith('(') && s.endsWith(')')))
  return '/' + seg.join('/')
}

/* ── 2. Fakta dangkal per halaman ─────────────────────────────────────── */

/*
 * Catatan pada `[\s<>]` — bukan gaya, ini memperbaiki salah hitung nyata.
 *
 * Versi pertama memakai `[\s>]` dan MELEWATKAN 6 halaman: komponen generik
 * dipanggil sebagai `<Tabel<BarisCvr>` — kurung sudut pembuka argumen tipe
 * datang persis di posisi yang ditolak kelas karakternya. Akibatnya matriks
 * melaporkan 35 dari 41, dan angka yang terlalu rendah justru berbahaya:
 * ia terbaca sebagai "masih banyak yang harus dipindahkan" pada halaman yang
 * SUDAH benar, lalu memicu pekerjaan yang tak perlu.
 *
 * Dibandingkan silang dengan `grep -rl "<Tabel" --include=page.tsx` sesudah
 * diperbaiki: 41 = 41.
 */
const POLA = {
  tabelMentah: /<table[\s>]/g,
  tabelBersama: /<Tabel[\s<>]/g,
  kartuKpi: /<KartuKPI[\s<>]/g,
  kepalaHalaman: /<KepalaHalaman[\s<>]/g,
  hexMentah: /#[0-9a-fA-F]{6}\b/g,
  // Panggilan format ad-hoc yang seharusnya lewat lib/format.ts
  formatAdHoc: /toLocaleString|Intl\.(NumberFormat|DateTimeFormat)/g,
  // Endpoint yang disentuh halaman ini
  endpoint: /['"`](\/api\/[a-zA-Z0-9\-_/[\]$.{}]+)['"`]/g,
  apiHelper: /\bapi\.(get|post|put|patch|del|delete)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)/g,
}

function hitung(isi, pola) {
  return (isi.match(pola) ?? []).length
}

function periksaHalaman(berkasPenuh) {
  const isi = readFileSync(berkasPenuh, 'utf8')
  const endpoint = new Set()
  for (const m of isi.matchAll(POLA.endpoint)) endpoint.add(m[1])
  for (const m of isi.matchAll(POLA.apiHelper)) {
    if (m[2].startsWith('/')) endpoint.add(m[2])
  }
  return {
    rute: ruteDari(berkasPenuh),
    berkas: relative(AKAR, berkasPenuh).split(sep).join('/'),
    // `wc -l` menghitung baris-berakhir-newline; `split('\n')` menambah satu
    // elemen kosong di ujung. Diselaraskan supaya angka di dokumen bisa
    // diperiksa ulang dengan `wc -l` tanpa selisih satu.
    baris: isi.endsWith('\n') ? isi.split('\n').length - 1 : isi.split('\n').length,
    tabelMentah: hitung(isi, POLA.tabelMentah),
    tabelBersama: hitung(isi, POLA.tabelBersama),
    kartuKpi: hitung(isi, POLA.kartuKpi),
    kepalaHalaman: hitung(isi, POLA.kepalaHalaman) > 0,
    hexMentah: hitung(isi, POLA.hexMentah),
    formatAdHoc: hitung(isi, POLA.formatAdHoc),
    endpoint: [...endpoint].sort(),
  }
}

/* ── 3. peta-menu.ts — dibaca sebagai teks, bukan diimpor ─────────────── */
/*
 * Mengimpornya butuh transpilasi TypeScript; yang dibutuhkan di sini hanya
 * empat medan per item. Regex atas literal objek sudah cukup dan membuat
 * skrip ini bisa dijalankan `node` polos tanpa perkakas tambahan.
 */
function bacaPetaMenu() {
  const isi = readFileSync(join(AKAR, 'lib', 'peta-menu.ts'), 'utf8')
  const grup = []
  const polaGrup = /key:\s*'(g-[^']+)',\s*label:\s*'([^']+)'/g
  for (const m of isi.matchAll(polaGrup)) {
    grup.push({ key: m[1], label: m[2], mulai: m.index })
  }
  const item = []
  const polaItem =
    /\{\s*key:\s*'([^']+)',\s*label:\s*'([^']+)',\s*status:\s*'([^']+)'([^}]*)\}/g
  for (const m of isi.matchAll(polaItem)) {
    if (m[1].startsWith('g-')) continue
    const ekor = m[4] ?? ''
    const href = /href:\s*'([^']+)'/.exec(ekor)?.[1] ?? null
    const guna = /guna:\s*'([^']*)'/.exec(ekor)?.[1] ?? ''
    const tabProyek = /tabProyek:\s*'([^']+)'/.exec(ekor)?.[1] ?? null
    const induk = grup.filter((g) => g.mulai < m.index).pop()
    item.push({
      key: m[1],
      label: m[2],
      status: m[3],
      href,
      guna,
      tabProyek,
      grup: induk?.label ?? '(tanpa grup)',
      grupKey: induk?.key ?? null,
    })
  }
  return { grup, item }
}

/* ── 3b. Grup menurut SEGMEN RUTE, bukan href ─────────────────────────── */
/*
 * Menyimpulkan grup dari `href` peta-menu TIDAK BISA DIANDALKAN, dan ini
 * terbukti bukan dugaan: `/audit` sempat jatuh ke grup "Keuangan" dan
 * `/akuntansi` ke "Master Data". Sebabnya tercatat di penjaga tetangga
 * (`audit-peta-menu-vs-db.mjs:132`): sebagian href adalah "wakil isi
 * kelompok" — tautan yang dipinjam kelompok untuk menunjuk salah satu
 * isinya, bukan menu milik halaman itu.
 *
 * Karena itu grup diambil dari SEGMEN PERTAMA rute, yang memang menentukan
 * di bawah menu induk mana halaman itu tinggal, lalu href hanya dipakai
 * untuk melengkapi status/guna. Satu sumber untuk satu pertanyaan.
 *
 * Peta ini ditulis eksplisit — bukan ditebak — supaya salah petak terlihat
 * sebagai baris yang salah di sini, bukan sebagai warna yang diam-diam
 * melenceng di 105 baris matriks.
 */
const GRUP_SEGMEN = {
  dashboard: 'Beranda',
  proyek: 'Perencanaan',
  jadwal: 'Perencanaan',
  kalender: 'Perencanaan',
  estimasi: 'Budget & Cost Control',
  laporan: 'Laporan & BI',
  keuangan: 'Keuangan',
  kas: 'Keuangan',
  piutang: 'Penagihan',
  akuntansi: 'Keuangan',
  procurement: 'Pengadaan',
  gudang: 'Gudang & Material',
  mandor: 'Mandor & Subkon',
  lapangan: 'Operasi Lapangan',
  mutu: 'Mutu (QA/QC)',
  aset: 'Alat & Aset',
  kontrak: 'Kontrak',
  tender: 'Pra-Konstruksi',
  klien: 'Master Data',
  dokumen: 'Dokumen',
  kepatuhan: 'Risiko & Kepatuhan',
  audit: 'Administrasi',
  users: 'Administrasi',
  pengaturan: 'Administrasi',
  sistem: 'Administrasi',
  notifications: 'Administrasi',
  'peta-modul': 'Administrasi',
  m: 'Administrasi',
  // Wilayah ber-shell SENDIRI — lihat catatan §A dokumen brief.
  'mandor-portal': 'Portal Mandor',
  'pm-portal': 'Portal PM',
  portal: 'Portal Klien',
  login: 'Sistem',
  auth: 'Sistem',
  verify: 'Sistem',
  'uji-gulir': 'Sistem',
}

function grupDariRute(rute) {
  const seg = rute.split('/').filter(Boolean)[0]
  if (!seg) return 'Beranda'
  return GRUP_SEGMEN[seg] ?? null
}

/* ── 4. Warna kategori per GRUP, bukan per halaman ────────────────────── */
/*
 * Brief §3.3 meminta "satu warna kategori per halaman". Dengan 105 halaman
 * itu berarti 105 warna — mustahil dan justru merusak konsistensi.
 *
 * Yang dipakai: warna melekat pada GRUP MENU (20 grup). Halaman mewarisi
 * warna induknya, jadi seluruh /keuangan/* satu warna dan orang belajar
 * "hijau = uang" sekali untuk sembilan halaman.
 *
 * Nilainya TIDAK ditulis di sini sebagai hex — hanya NAMA TOKEN. Hex mentah
 * di skrip akan luput dari kontras-ratchet dan mengulang cacat yang sudah
 * tercatat (ARAH-VISUAL §11d: angka kontras di komentar pernah salah 3x).
 */
const WARNA_GRUP = {
  'Beranda': '--navy',
  'Master Data': '--data-5',
  'Pra-Konstruksi': '--data-2',
  'Kontrak': '--data-1',
  'Perencanaan': '--data-2',
  'Budget & Cost Control': '--data-3',
  'Pengadaan': '--data-4',
  'Gudang & Material': '--data-4',
  'Mandor & Subkon': '--warning',
  'Operasi Lapangan': '--data-2',
  'Mutu (QA/QC)': '--success',
  'Alat & Aset': '--data-4',
  'Keuangan': '--success',
  'Penagihan': '--success',
  'Dokumen': '--text-muted',
  'Risiko & Kepatuhan': '--danger',
  'Laporan & BI': '--data-1',
  'Administrasi': '--text-muted',
  'Portal Mandor': '--warning',
  'Portal PM': '--data-1',
  'Portal Klien': '--data-2',
  'Sistem': '--text-muted',
}

/* ── 5. Gabungkan ─────────────────────────────────────────────────────── */

/*
 * Buang query & fragment sebelum membandingkan.
 *
 * Versi pertama membandingkan href apa adanya dan melaporkan 24 "tautan mati"
 * — SEMUANYA keliru. `peta-menu.ts` menunjuk tab lewat query (`/laporan?tab=wip`,
 * `/estimasi?tab=rap`), dan halamannya memang ada; yang berbeda hanya tab yang
 * dibuka. Melaporkannya sebagai rusak akan mengirim sesi berikutnya membangun
 * 24 halaman yang sudah ada.
 *
 * Ini persis kelas cacat yang CLAUDE.md §8 minta dihindari: memilih kesimpulan
 * yang lebih nyaman ("banyak yang harus dikerjakan") tanpa mengukur dulu.
 */
function normalRute(r) {
  if (!r) return null
  const tanpaQuery = r.split(/[?#]/)[0]
  return tanpaQuery.replace(/\/+$/, '') || '/'
}

function gabung() {
  const halaman = telusuri(DIR_APP).map(periksaHalaman)
  const { item } = bacaPetaMenu()

  /*
   * Beberapa menu menunjuk BASE yang sama lewat query berbeda
   * (`/estimasi?tab=rap`, `/estimasi?tab=katalog`, …). Sesudah query dibuang
   * mereka bertabrakan, dan "yang terakhir menang" memberi grup yang salah:
   * `/estimasi` sempat tercatat di grup "Administrasi" hanya karena entri
   * ber-query terakhir kebetulan milik grup itu.
   *
   * Aturannya dibuat deterministik: entri TANPA query menang, karena itulah
   * menu milik halaman itu sendiri; entri ber-query hanyalah tautan-dalam ke
   * salah satu tabnya.
   */
  const petaByHref = new Map()
  for (const it of item) {
    const h = normalRute(it.href)
    if (!h) continue
    const punyaQuery = /[?#]/.test(it.href)
    const lama = petaByHref.get(h)
    if (!lama) { petaByHref.set(h, it); continue }
    const lamaPunyaQuery = /[?#]/.test(lama.href)
    if (lamaPunyaQuery && !punyaQuery) petaByHref.set(h, it)
  }

  const baris = halaman.map((h) => {
    const rute = normalRute(h.rute)
    // Cocokkan persis dulu, lalu induk terdekat (untuk rute dinamis / anak).
    let menu = petaByHref.get(rute) ?? null
    if (!menu) {
      const kandidat = [...petaByHref.keys()]
        .filter((k) => rute.startsWith(k + '/'))
        .sort((a, b) => b.length - a.length)[0]
      if (kandidat) menu = petaByHref.get(kandidat)
    }
    // Grup dari SEGMEN rute (andal); href hanya melengkapi status & guna.
    const grup = grupDariRute(rute)
    return {
      ...h,
      menuKey: menu?.key ?? null,
      menuLabel: menu?.label ?? null,
      grup,
      status: menu?.status ?? null,
      guna: menu?.guna ?? '',
      warna: grup ? (WARNA_GRUP[grup] ?? '--navy') : '--navy',
      // "yatim" = tak punya entri di peta-menu (bukan soal grup).
      yatim: !menu,
    }
  })

  const ruteAda = new Set(halaman.map((h) => normalRute(h.rute)))
  const tautanMati = item.filter(
    (it) => it.href && it.status === 'hidup' && !ruteAda.has(normalRute(it.href)),
  )

  return { baris, item, tautanMati }
}

/* ── 6. Keluaran ──────────────────────────────────────────────────────── */

function ringkas(d) {
  const b = d.baris
  const n = b.length
  const jml = (f) => b.filter(f).length
  const total = (k) => b.reduce((s, x) => s + x[k], 0)
  return {
    halaman: n,
    yatim: jml((x) => x.yatim),
    tautanMati: d.tautanMati.length,
    pakaiKepalaHalaman: jml((x) => x.kepalaHalaman),
    pakaiKartuKpi: jml((x) => x.kartuKpi > 0),
    pakaiTabelBersama: jml((x) => x.tabelBersama > 0),
    adaTabelMentah: jml((x) => x.tabelMentah > 0),
    adaHexMentah: jml((x) => x.hexMentah > 0),
    adaFormatAdHoc: jml((x) => x.formatAdHoc > 0),
    totalHexMentah: total('hexMentah'),
    totalFormatAdHoc: total('formatAdHoc'),
    totalTabelMentah: total('tabelMentah'),
  }
}

function cetakMarkdown(d) {
  const r = ringkas(d)
  const out = []
  out.push('<!-- DIGENERATE oleh apps/web/scripts/peta-redesign.mjs — jangan sunting tangan. -->')
  out.push(`<!-- Jalankan ulang: node apps/web/scripts/peta-redesign.mjs --markdown -->`)
  out.push('')
  out.push('### Agregat')
  out.push('')
  out.push('| Ukuran | Angka |')
  out.push('|---|---|')
  out.push(`| Halaman (page.tsx) | ${r.halaman} |`)
  out.push(`| Halaman yatim (tak terdaftar di peta-menu) | ${r.yatim} |`)
  out.push(`| Menu \`hidup\` tanpa halaman (tautan mati) | ${r.tautanMati} |`)
  out.push(`| Memakai \`KepalaHalaman\` | ${r.pakaiKepalaHalaman} / ${r.halaman} |`)
  out.push(`| Memakai \`KartuKPI\` | ${r.pakaiKartuKpi} / ${r.halaman} |`)
  out.push(`| Memakai \`<Tabel>\` | ${r.pakaiTabelBersama} / ${r.halaman} |`)
  out.push(`| Masih ada \`<table>\` mentah | ${r.adaTabelMentah} halaman (${r.totalTabelMentah} tabel) |`)
  out.push(`| Masih ada hex mentah | ${r.adaHexMentah} halaman (${r.totalHexMentah} hex) |`)
  out.push(`| Format angka ad-hoc | ${r.adaFormatAdHoc} halaman (${r.totalFormatAdHoc} panggilan) |`)
  out.push('')
  out.push('### Matriks per halaman')
  out.push('')
  out.push('Kolom `Sisa` = pekerjaan yang tersisa untuk halaman itu:')
  out.push('`H`=hex mentah · `F`=format ad-hoc · `T`=tabel mentah · `K`=belum KepalaHalaman.')
  out.push('')
  out.push('| # | Rute | Grup | Warna | Status | Baris | KPI | Tabel | Sisa | Endpoint |')
  out.push('|---|---|---|---|---|---|---|---|---|---|')

  const urut = [...d.baris].sort((a, b) => {
    const g = (a.grup ?? 'zz').localeCompare(b.grup ?? 'zz')
    return g !== 0 ? g : a.rute.localeCompare(b.rute)
  })

  urut.forEach((x, i) => {
    const sisa = [
      x.hexMentah > 0 ? `H${x.hexMentah}` : '',
      x.formatAdHoc > 0 ? `F${x.formatAdHoc}` : '',
      x.tabelMentah > 0 ? `T${x.tabelMentah}` : '',
      x.kepalaHalaman ? '' : 'K',
    ].filter(Boolean).join(' ') || '—'
    const ep = x.endpoint.length
      ? x.endpoint.slice(0, 3).map((e) => `\`${e}\``).join(' ') +
        (x.endpoint.length > 3 ? ` +${x.endpoint.length - 3}` : '')
      : '—'
    out.push(
      `| ${i + 1} | \`${x.rute}\` | ${x.grup ?? '⚠️ yatim'} | \`${x.warna}\` | ${x.status ?? '—'} | ${x.baris} | ${x.kartuKpi || '—'} | ${x.tabelBersama || '—'} | ${sisa} | ${ep} |`,
    )
  })

  if (d.tautanMati.length) {
    out.push('')
    out.push('### ⚠️ Menu `hidup` yang halamannya tidak ada')
    out.push('')
    out.push('| Menu | Rute | Guna |')
    out.push('|---|---|---|')
    for (const t of d.tautanMati) out.push(`| ${t.label} | \`${t.href}\` | ${t.guna} |`)
  }

  return out.join('\n')
}

/* ── 7. Jalankan ──────────────────────────────────────────────────────── */

const arg = process.argv.slice(2)
const d = gabung()

if (arg.includes('--json')) {
  console.log(JSON.stringify({ ringkas: ringkas(d), baris: d.baris, tautanMati: d.tautanMati }, null, 2))
} else if (arg.includes('--ringkas')) {
  const r = ringkas(d)
  for (const [k, v] of Object.entries(r)) console.log(`${k.padEnd(22)} ${v}`)
} else {
  console.log(cetakMarkdown(d))
}
