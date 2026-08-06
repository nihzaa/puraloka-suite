/**
 * `dapatDitekan()` — menjadikan elemen non-tombol benar-benar bisa ditekan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 232 elemen di `apps/web` punya `onClick` tapi bukan `<button>`/`<a>`: baris
 * tabel yang melipat, kartu yang membuka detail, sel yang masuk mode sunting.
 * Semuanya bisa diklik dengan tetikus dan **tak satu pun bisa dijangkau dengan
 * keyboard** — tak dapat fokus, tak menanggapi Enter/Space, dan pembaca layar
 * menyebutnya sebagai teks biasa.
 *
 * ── Kenapa tidak semuanya dijadikan `<button>` saja
 *
 * Itu jawaban yang benar kalau bisa, dan sudah dipakai di tempat yang bisa
 * (mis. foto di `progress-log-list`). Tapi baris tabel di sini adalah
 * `display: grid` dengan kolom yang ditentukan induknya; mengubahnya jadi
 * `<button>` meruntuhkan tata letak seluruh tabel, karena tombol punya model
 * tampilan sendiri dan tak meneruskan grid ke anaknya.
 *
 * Untuk kasus itu WAI-ARIA menyediakan jalan resmi: `role="button"` +
 * `tabIndex` + penanganan papan tik. Ketiganya harus lengkap — dan justru di
 * situ masalahnya kalau ditulis manual berulang kali:
 *
 *   · `role` tanpa `tabIndex` → pembaca layar bilang "tombol", tapi Tab
 *     melewatinya. Menjanjikan sesuatu yang tak ada.
 *   · `tabIndex` tanpa penangan tombol → bisa difokus, ditekan Enter tak
 *     terjadi apa-apa. Lebih membingungkan daripada tak bisa difokus.
 *   · `Enter` ditangani tapi `Space` tidak → ini yang paling sering. Tombol
 *     asli menanggapi KEDUANYA; separuh implementasi terasa rusak sesekali,
 *     yang lebih buruk daripada rusak konsisten.
 *
 * Helper ini menyatukan ketiganya jadi satu keputusan, sehingga tak ada
 * kesempatan menuliskannya separuh.
 *
 * ── Pemakaian
 *
 *     <div {...dapatDitekan(() => toggleCollapse(cat.id), 'Lipat kategori Pekerjaan Tanah')}
 *          style={{ display: 'grid', ... }}>
 *
 * Kalau elemennya kadang tak bisa ditekan (mis. hanya kalau punya anak),
 * berikan `null` sebagai aksinya — atributnya ikut hilang seluruhnya, jadi
 * tak ada "tombol" yang tak melakukan apa pun:
 *
 *     <div {...dapatDitekan(hasChildren ? () => toggle(id) : null, '…')}>
 */
import type { KeyboardEvent, MouseEvent } from 'react'

export interface AtributDapatDitekan {
  role?: 'button'
  tabIndex?: number
  'aria-label'?: string
  'aria-expanded'?: boolean
  onClick?: (e: MouseEvent) => void
  onKeyDown?: (e: KeyboardEvent) => void
}

/**
 * Varian TERPISAH untuk baris yang isinya memuat kontrol lain.
 *
 * ── Masalah yang diselesaikan
 *
 * `dapatDitekan()` memasang `role="button"` pada elemen yang menerima
 * kliknya. Kalau elemen itu BARIS yang di dalamnya ada `<input>` — seperti
 * baris kategori RAB dengan kotak serapan — hasilnya `nested-interactive`:
 * kontrol di dalam tombol. Audit menemukan 21 node begini di satu halaman.
 *
 * `stopPropagation` pada selnya memperbaiki PERILAKU (Space tak lagi
 * melipat baris saat orang mengetik) tapi tidak STRUKTURNYA — pembaca layar
 * tetap melihat input bersarang di dalam tombol, dan sebagian membacakan
 * seluruh isi baris sebagai nama tombolnya.
 *
 * Fungsi ini memisahkan keduanya:
 *   • `pemicu` — atribut ARIA + keyboard, dipasang pada sel SEMPIT
 *     (mis. chevron) yang tak memuat kontrol apa pun.
 *   • `baris`  — hanya `onClick`, tanpa `role`, sehingga seluruh baris tetap
 *     bisa diklik tikus seperti sebelumnya.
 *
 * Pemakai keyboard menekan chevron; pemakai tikus tetap bisa menekan di mana
 * saja. Tak ada yang kehilangan apa pun.
 */
export function dapatDitekanTerpisah(
  aksi: ((e: MouseEvent | KeyboardEvent) => void) | null | undefined,
  label: string,
  opsi?: { terbuka?: boolean },
): { pemicu: AtributDapatDitekan; baris: { onClick?: (e: MouseEvent) => void; style?: never } } {
  if (!aksi) return { pemicu: {}, baris: {} }

  const penuh = dapatDitekan(aksi, label, opsi)
  // `onClick` sengaja TIDAK ikut ke `pemicu`: klik pada chevron akan
  // menggelembung ke baris dan memicu aksinya dua kali — melipat lalu
  // membuka lagi, yang terlihat seperti tombol yang tak berfungsi.
  const pemicu: AtributDapatDitekan = { ...penuh }
  delete pemicu.onClick
  return {
    pemicu,
    baris: { onClick: (e) => aksi(e) },
  }
}

export function dapatDitekan(
  aksi: ((e: MouseEvent | KeyboardEvent) => void) | null | undefined,
  label: string,
  opsi?: { terbuka?: boolean },
): AtributDapatDitekan {
  // Tanpa aksi: kembalikan objek kosong. Elemen yang tak melakukan apa-apa
  // tak boleh mengumumkan diri sebagai tombol — Tab yang berhenti di sesuatu
  // yang tak bisa ditekan membuat orang mengira ada yang rusak.
  if (!aksi) return {}

  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    ...(opsi?.terbuka === undefined ? {} : { 'aria-expanded': opsi.terbuka }),
    onClick: (e) => aksi(e),
    onKeyDown: (e) => {
      // KEDUANYA, bukan salah satu: tombol asli menanggapi Enter dan Space.
      if (e.key !== 'Enter' && e.key !== ' ') return
      // Space menggulirkan halaman kalau tak dicegah — pada baris tabel yang
      // panjang, layar melompat setiap kali orang mencoba menekannya.
      e.preventDefault()
      aksi(e)
    },
  }
}
