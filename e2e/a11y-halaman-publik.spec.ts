import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * A11Y HALAMAN PUBLIK — axe-core terhadap halaman yang dirender sungguhan.
 *
 * ── Kenapa ada, dan kenapa hanya halaman publik
 *
 * Audit axe pertama setelah perombakan UI menemukan **235 pelanggaran**
 * WCAG 2.1 AA (218 terang + 17 gelap) yang SELURUHNYA lolos
 * `eslint-plugin-jsx-a11y` dan `a11y-ratchet.mjs`. Pemindai statis buta
 * terhadap kontras: ia melihat token, bukan nilai terhitung setelah
 * `opacity` dan pencampuran latar.
 *
 * 213 di antaranya berasal dari SATU baris — `opacity: 0.55` pada label
 * sidebar. Kontras 5,98:1 jatuh ke 2,34:1, dan tak ada satu pun penjaga
 * yang bisa melihatnya.
 *
 * Semua sudah ditutup (nol di kedua mode, 39 halaman). Test ini menjaga
 * agar tak tumbuh lagi.
 *
 * Cakupannya SENGAJA hanya halaman yang tak butuh sesi. Kredensial
 * Supabase di CI ditolak sadar (lihat header job `browser` di ci.yml),
 * jadi 39 halaman dashboard tak bisa dijangkau dari sini. Untuk itu ada
 * `apps/web/scripts/audit-a11y-runtime.mjs` yang dijalankan tangan
 * dengan `LAYAR_EMAIL`/`LAYAR_SANDI`.
 *
 * Cakupan sempit yang jujur mengalahkan cakupan luas yang tak pernah
 * benar-benar berjalan — dan halaman masuk memakai token, tata letak,
 * dan komponen yang sama, jadi regresi warna tingkat-token akan tetap
 * tertangkap di sini.
 */

const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

/** Halaman yang bisa dibuka tanpa sesi. */
const HALAMAN_PUBLIK = ['/login']

for (const mode of ['terang', 'gelap'] as const) {
  test.describe(`a11y ${mode}`, () => {
    test.use({ colorScheme: mode === 'gelap' ? 'dark' : 'light' })

    for (const url of HALAMAN_PUBLIK) {
      test(`${url} — nol pelanggaran WCAG 2.1 AA`, async ({ page }) => {
        // `next-themes` menyimpan preferensi di localStorage dan default-nya
        // MENANG atas `prefers-color-scheme`. Tanpa ini, "mode gelap" memindai
        // halaman terang dan lolos tanpa menguji apa pun.
        await page.addInitScript((g) => {
          localStorage.setItem('theme', g ? 'dark' : 'light')
        }, mode === 'gelap')

        await page.goto(url, { waitUntil: 'networkidle' })
        await page.waitForTimeout(800)

        await page.evaluate(AXE)
        const hasil = await page.evaluate(async () => {
          const r = await (window as unknown as {
            axe: { run: (d: Document, o: unknown) => Promise<{ violations: unknown[] }> }
          }).axe.run(document, {
            runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
          })
          return (r.violations as Array<{
            id: string; impact: string; nodes: Array<{ html: string; failureSummary: string }>
          }>).map((v) => ({
            id: v.id,
            dampak: v.impact,
            jumlah: v.nodes.length,
            // Ringkasan axe memuat rasio kontras dan warna sebenarnya —
            // itu yang membuat kegagalan bisa langsung ditindaklanjuti,
            // bukan sekadar "ada yang salah di suatu tempat".
            contoh: v.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').slice(0, 180) ?? '',
          }))
        })

        expect(
          hasil,
          hasil.length
            ? `Pelanggaran WCAG di ${url} (${mode}):\n` +
              hasil.map((v) => `  [${v.dampak}] ${v.id} × ${v.jumlah}\n     ${v.contoh}`).join('\n')
            : '',
        ).toEqual([])
      })
    }
  })
}
