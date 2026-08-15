/**
 * GRAFIK — SVG dirakit tangan, lalu dijadikan PNG.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SVG TANGAN, BUKAN CHART.JS + PUPPETEER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Puppeteer SUDAH terpasang di repo ini, jadi menjalankan Chart.js di browser
 * headless terasa jalan termudah. Ditolak, dan alasannya bukan selera:
 *
 *   - satu render = satu proses Chromium (~300 MB, ~1-2 detik). Untuk gambar
 *     yang dikirim ke WhatsApp sambil orang menunggu balasan, itu mahal.
 *   - Chromium di jalur permintaan berarti kegagalannya (OOM, sandbox, font
 *     hilang) muncul sebagai balasan yang tak pernah datang.
 *   - grafiknya sederhana: garis, sumbu, legenda. Chart.js membawa seluruh
 *     mesin kanvas untuk sesuatu yang muat dalam 200 baris.
 *
 * SVG dirakit sebagai STRING, lalu `sharp` mengubahnya jadi PNG — `sharp` juga
 * sudah terpasang, dan ia pustaka C++ tanpa browser.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PNG, BUKAN SVG, UNTUK WHATSAPP
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WhatsApp tak menampilkan SVG sebagai gambar. Web menerima keduanya, tetapi
 * memakai satu bentuk untuk dua kanal berarti satu jalur yang teruji, bukan
 * dua yang salah satunya jarang dilalui.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ANGKA TAK PERNAH DIKARANG DI SINI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Berkas ini MENGGAMBAR, tak menghitung. Titik yang tak ada tetap tak ada —
 * tak ada interpolasi, tak ada perataan, tak ada "kira-kira segini". Grafik
 * yang memuluskan lubang data adalah kebohongan yang paling sulit dibantah,
 * karena ia terlihat rapi.
 */

/** Warna — dari `ARAH-VISUAL-2026.md` §2, navy merek + pendamping. */
const WARNA = {
  rencana: '#94a3b8',
  aktual: '#003366',
  ketiga: '#f59e0b',
  sumbu: '#cbd5e1',
  teks: '#334155',
  redup: '#94a3b8',
  latar: '#ffffff',
} as const

export interface DeretGrafik {
  nama: string
  warna: string
  /** `null` = TIDAK ADA DATA. Bukan nol — lihat kepala berkas. */
  titik: Array<number | null>
}

export interface OpsiGrafik {
  judul: string
  subjudul?: string
  labelX: string[]
  deret: DeretGrafik[]
  /** Satuan sumbu Y, mis. '%' atau 'Rp jt'. */
  satuan?: string
  lebar?: number
  tinggi?: number
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Merakit grafik garis sebagai SVG.
 *
 * Dipisah dari perenderan PNG supaya bisa diuji TANPA `sharp` — bentuk
 * kurvanya diperiksa sebagai teks, dan test tak perlu membandingkan piksel.
 */
export function grafikGarisSvg(opsi: OpsiGrafik): string {
  const L = opsi.lebar ?? 900
  const T = opsi.tinggi ?? 480
  const kiri = 64
  const kanan = 24
  const atas = opsi.subjudul ? 74 : 56
  const bawah = 64

  const plotL = L - kiri - kanan
  const plotT = T - atas - bawah

  const semua = opsi.deret.flatMap((d) => d.titik).filter((v): v is number => v !== null)
  /*
    Data KOSONG digambar sebagai bingkai kosong + kalimat, bukan grafik datar.

    Grafik garis di angka nol terlihat seperti "semuanya nol" — kesimpulan yang
    sama sekali berbeda dari "belum ada datanya", dan yang membacanya tak punya
    cara membedakannya.
  */
  if (semua.length === 0) {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${T}" viewBox="0 0 ${L} ${T}">`,
      `<rect width="${L}" height="${T}" fill="${WARNA.latar}"/>`,
      `<text x="${L / 2}" y="${T / 2 - 8}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="17" fill="${WARNA.teks}">${esc(opsi.judul)}</text>`,
      `<text x="${L / 2}" y="${T / 2 + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="${WARNA.redup}">Belum ada data untuk digambar.</text>`,
      `</svg>`,
    ].join('')
  }

  const maksData = Math.max(...semua)
  const minData = Math.min(0, ...semua)
  // Dibulatkan ke atas supaya garis teratas tak menempel di tepi.
  const maks = maksData <= 0 ? 1 : maksData * 1.08
  const rentang = maks - minData || 1

  const n = Math.max(opsi.labelX.length, ...opsi.deret.map((d) => d.titik.length))
  const x = (i: number) => kiri + (n <= 1 ? plotL / 2 : (i / (n - 1)) * plotL)
  const y = (v: number) => atas + plotT - ((v - minData) / rentang) * plotT

  const bag: string[] = []
  bag.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${T}" viewBox="0 0 ${L} ${T}">`,
    `<rect width="${L}" height="${T}" fill="${WARNA.latar}"/>`,
    `<text x="${kiri}" y="30" font-family="system-ui,sans-serif" font-size="18" font-weight="600" fill="${WARNA.teks}">${esc(opsi.judul)}</text>`,
  )
  if (opsi.subjudul) {
    bag.push(
      `<text x="${kiri}" y="52" font-family="system-ui,sans-serif" font-size="13" fill="${WARNA.redup}">${esc(opsi.subjudul)}</text>`,
    )
  }

  // ── Garis bantu horizontal + label sumbu Y ────────────────────────────────
  const LANGKAH = 4
  for (let i = 0; i <= LANGKAH; i++) {
    const nilai = minData + (rentang * i) / LANGKAH
    const yy = y(nilai)
    bag.push(
      `<line x1="${kiri}" y1="${yy.toFixed(1)}" x2="${kiri + plotL}" y2="${yy.toFixed(1)}" stroke="${WARNA.sumbu}" stroke-width="1"/>`,
      `<text x="${kiri - 10}" y="${(yy + 4).toFixed(1)}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="${WARNA.redup}">${
        Math.abs(nilai) >= 1000 ? Math.round(nilai).toLocaleString('id-ID') : nilai.toFixed(0)
      }${esc(opsi.satuan ?? '')}</text>`,
    )
  }

  // ── Label X — DIJARANGKAN supaya tak saling tumpuk ────────────────────────
  //
  // 52 minggu di lebar 900px berarti satu label tiap 16px; yang terbaca cuma
  // tumpukan tinta. Jarak dihitung dari jumlah titik, bukan dipaku.
  const lompat = Math.max(1, Math.ceil(n / 12))
  for (let i = 0; i < n; i += lompat) {
    const t = opsi.labelX[i]
    if (!t) continue
    bag.push(
      `<text x="${x(i).toFixed(1)}" y="${T - bawah + 20}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="${WARNA.redup}">${esc(t)}</text>`,
    )
  }

  // ── Deret ─────────────────────────────────────────────────────────────────
  for (const d of opsi.deret) {
    /*
      Titik `null` MEMUTUS garis, tidak dilewati.

      `M`/`L` disusun ulang tiap kali data hilang, sehingga lubang terlihat
      sebagai lubang. Menyambungnya akan menggambar garis lurus melintasi
      minggu yang tak pernah dilaporkan — dan garis itu terlihat persis seperti
      pekerjaan yang berjalan mulus.
    */
    let jalur = ''
    let menyambung = false
    d.titik.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        menyambung = false
        return
      }
      jalur += `${menyambung ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      menyambung = true
    })
    if (jalur) {
      bag.push(
        `<path d="${jalur}" fill="none" stroke="${d.warna}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`,
      )
    }
  }

  // ── Legenda ───────────────────────────────────────────────────────────────
  let lx = kiri
  const ly = T - 18
  for (const d of opsi.deret) {
    bag.push(
      `<rect x="${lx}" y="${ly - 9}" width="14" height="3" rx="1.5" fill="${d.warna}"/>`,
      `<text x="${lx + 20}" y="${ly - 4}" font-family="system-ui,sans-serif" font-size="12" fill="${WARNA.teks}">${esc(d.nama)}</text>`,
    )
    lx += 26 + d.nama.length * 7
  }

  bag.push('</svg>')
  return bag.join('')
}

/**
 * SVG → PNG.
 *
 * `sharp` diimpor DINAMIS supaya berkas ini bisa dipakai (dan diuji) di
 * lingkungan yang binary-nya tak terpasang — mis. saat hanya bentuk SVG-nya
 * yang diperiksa.
 */
export async function svgKePng(svg: string): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
}

/** Warna baku — dipakai pemanggil supaya deretnya konsisten lintas grafik. */
export const WARNA_DERET = WARNA
