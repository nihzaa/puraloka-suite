/** Mengunduh invoice PDF lewat layar sungguhan, lalu MEMBUKA hasilnya. */
import { chromium } from '@playwright/test'
import { readFileSync, existsSync, rmSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .replace(/^\uFEFF/, '').split(/\r?\n/)
    .filter(b => b.includes('=') && !b.trimStart().startsWith('#'))
    .map(b => { const i = b.indexOf('='); return [b.slice(0, i).trim(), b.slice(i + 1).trim().replace(/^["']|["']$/g, '')] })
)

const OUT = 'E:/tmp/unduhan-pdf'
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true })

const b = await chromium.launch()
const ctx = await b.newContext({ acceptDownloads: true })
const hal = await ctx.newPage()
const galat = []
hal.on('console', m => m.type() === 'error' && galat.push(m.text().slice(0, 200)))
hal.on('pageerror', e => galat.push('PAGEERROR: ' + String(e).slice(0, 200)))

await hal.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
await hal.fill('input[type="email"]', env.LAYAR_EMAIL)
await hal.fill('input[type="password"]', env.LAYAR_SANDI)
await hal.click('form button[type="submit"]')
await hal.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000, waitUntil: 'domcontentloaded' })

await hal.goto('http://localhost:3000/keuangan/invoice', { waitUntil: 'domcontentloaded' })
await hal.waitForSelector('h1', { timeout: 20000 })
await hal.waitForTimeout(2500)

const tombol = hal.getByRole('button', { name: /unduh|pdf|download/i }).first()
const jml = await tombol.count()
console.log(`tombol unduh ditemukan: ${jml}`)
if (!jml) { console.log('TAK ADA tombol unduh di /keuangan/invoice'); await b.close(); process.exit(1) }

const [unduhan] = await Promise.all([
  hal.waitForEvent('download', { timeout: 60000 }),
  tombol.click(),
])
const jalur = `${OUT}/${unduhan.suggestedFilename()}`
await unduhan.saveAs(jalur)
const ukuran = readFileSync(jalur).length
console.log(`tersimpan: ${unduhan.suggestedFilename()} (${(ukuran/1024).toFixed(1)} KB)`)
console.log(`galat konsol: ${galat.length}${galat.length ? ' → ' + galat[0] : ''}`)
console.log(`JALUR=${jalur}`)
await b.close()
