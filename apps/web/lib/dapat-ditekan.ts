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
