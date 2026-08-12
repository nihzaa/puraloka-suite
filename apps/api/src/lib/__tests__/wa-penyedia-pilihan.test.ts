/**
 * PILIHAN PENYEDIA WHATSAPP — "tinggal ganti dari UI" harus benar-benar bisa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CACAT YANG DIKUNCI TEST INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-12 `konfigurasiKanal()` mengembalikan `penyedia: 'evolution'`
 * sebagai LITERAL. Akibatnya:
 *
 *   - `AdaptorFonnte` ditulis lengkap, diuji, muncul sebagai pilihan di UI —
 *     dan TIDAK PERNAH BISA TERPAKAI.
 *   - Komentar di adaptor itu sendiri menjanjikan "pemulihan sejauh mengganti
 *     pilihan di UI". Penggantian itu tak pernah sampai ke pabrik adaptor.
 *
 * Nol gejala: mengirim tetap berhasil (lewat Evolution), jadi tak ada galat
 * yang menunjukkan pilihan diabaikan. Ketahuan hanya kalau Evolution mati —
 * yaitu justru saat penyedia kedua paling dibutuhkan.
 *
 * Ditambah Meta Cloud API (jalur RESMI) yang ditulis sekarang meski dipakai
 * nanti: kalau adaptornya baru ditulis saat migrasi tiba, "tinggal ganti dari
 * UI" jadi bohong — yang terjadi sebenarnya menulis kode baru di bawah
 * tekanan pindah, saat WhatsApp sudah jadi jalur kerja sehari-hari.
 *
 * Nol panggilan jaringan di berkas ini. Yang diuji: pemilihan, syarat field,
 * dan penerjemahan galat — bukan HTTP-nya.
 */
import { describe, it, expect } from 'vitest'
import {
  buatAdaptorWa,
  konfigurasiKanal,
  ADAPTOR_WA_DIKENAL,
  type KonfigurasiWa,
} from '../wa-kirim.js'
import { KATALOG_KREDENSIAL } from '../kredensial.js'

/** Kredensial palsu — peta kunci→nilai, tanpa basis data. */
const baca = (isi: Record<string, string>) =>
  async (kunci: string) => isi[kunci] ?? null

const LENGKAP = {
  WA_BASE_URL: 'http://localhost:8081',
  WA_API_KEY: 'kunci-rahasia-uji',
  WA_INSTANCE: 'puraloka-bot',
}

describe('pilihan penyedia benar-benar sampai ke pabrik adaptor', () => {
  it('tanpa WA_PENYEDIA jatuh ke evolution — perilaku lama tak berubah', async () => {
    const cfg = await konfigurasiKanal(baca(LENGKAP))
    expect(cfg?.penyedia).toBe('evolution')
    expect(buatAdaptorWa(cfg!)?.nama).toBe('evolution')
  })

  it('WA_PENYEDIA=fonnte MENGHASILKAN adaptor fonnte, bukan evolution', async () => {
    // Inilah yang gagal sebelum perbaikan: apa pun yang dipilih, hasilnya
    // selalu evolution.
    const cfg = await konfigurasiKanal(baca({ ...LENGKAP, WA_PENYEDIA: 'fonnte' }))
    expect(cfg?.penyedia).toBe('fonnte')
    expect(buatAdaptorWa(cfg!)?.nama).toBe('fonnte')
  })

  it('WA_PENYEDIA=meta-cloud MENGHASILKAN adaptor resmi', async () => {
    const cfg = await konfigurasiKanal(baca({ ...LENGKAP, WA_PENYEDIA: 'meta-cloud' }))
    expect(cfg?.penyedia).toBe('meta-cloud')
    expect(buatAdaptorWa(cfg!)?.nama).toBe('meta-cloud')
  })

  it('penyedia tak dikenal = kanal BELUM SIAP, bukan jatuh diam-diam ke evolution', async () => {
    // Jatuh diam-diam akan mengirim lewat jalur yang TIDAK dipilih siapa pun —
    // dan nomor pengirimnya datang dari tempat yang tak diduga.
    const cfg = await konfigurasiKanal(baca({ ...LENGKAP, WA_PENYEDIA: 'penyedia-karangan' }))
    expect(cfg).toBeNull()
  })
})

describe('syarat field dibaca dari `butuh`, bukan ditulis ulang', () => {
  it('evolution tanpa baseUrl = belum siap', async () => {
    const cfg = await konfigurasiKanal(baca({
      WA_API_KEY: 'k', WA_INSTANCE: 'i', WA_PENYEDIA: 'evolution',
    }))
    expect(cfg).toBeNull()
  })

  it('evolution tanpa instance = belum siap', async () => {
    const cfg = await konfigurasiKanal(baca({
      WA_BASE_URL: 'http://x', WA_API_KEY: 'k', WA_PENYEDIA: 'evolution',
    }))
    expect(cfg).toBeNull()
  })

  it('fonnte cukup kunci — TANPA baseUrl dan TANPA instance', async () => {
    // Fonnte `butuh: []`. Menuntut baseUrl untuknya akan membuat penyedia
    // yang sah tak pernah bisa dinyalakan.
    const cfg = await konfigurasiKanal(baca({ WA_API_KEY: 'token', WA_PENYEDIA: 'fonnte' }))
    expect(cfg?.penyedia).toBe('fonnte')
  })

  it('meta-cloud butuh instance (Phone Number ID) tapi TIDAK butuh baseUrl', async () => {
    // Alamatnya tetap (graph.facebook.com/v21.0) — menyuruh orang
    // mengetiknya adalah undangan salah ketik yang gagalnya tampak seperti
    // "kunci salah".
    const cfg = await konfigurasiKanal(baca({
      WA_API_KEY: 'token-meta', WA_INSTANCE: '123456789', WA_PENYEDIA: 'meta-cloud',
    }))
    expect(cfg?.penyedia).toBe('meta-cloud')

    const tanpaInstance = await konfigurasiKanal(baca({
      WA_API_KEY: 'token-meta', WA_PENYEDIA: 'meta-cloud',
    }))
    expect(tanpaInstance).toBeNull()
  })

  it('kunci kosong = belum siap untuk penyedia mana pun', async () => {
    for (const p of ADAPTOR_WA_DIKENAL) {
      const cfg = await konfigurasiKanal(baca({
        WA_BASE_URL: 'http://x', WA_INSTANCE: 'i', WA_PENYEDIA: p.kunci,
      }))
      expect(cfg, `penyedia ${p.kunci} tanpa kunci harus null`).toBeNull()
    }
  })
})

describe('tiap penyedia yang DITAWARKAN bisa dirakit', () => {
  it('tak ada pilihan di UI yang menghasilkan adaptor null', () => {
    // Pilihan yang tampil di layar tapi tak punya adaptor adalah janji
    // kosong: orang memilihnya, menyimpannya, lalu pesannya tak pernah
    // terkirim tanpa satu pun galat menyebut sebabnya.
    for (const p of ADAPTOR_WA_DIKENAL) {
      const cfg: KonfigurasiWa = {
        penyedia: p.kunci, baseUrl: 'http://x', apiKey: 'k', instance: 'i',
      }
      expect(buatAdaptorWa(cfg), `penyedia ${p.kunci} tak punya adaptor`).not.toBeNull()
    }
  })

  it('WA_PENYEDIA punya kotak di halaman Kredensial', () => {
    // Kunci yang dibaca kode tanpa tempat mengisi = fitur mati tanpa gejala,
    // kelas cacat yang sama dengan N8N_BASE_URL dan AI_PROVIDER_API_KEY.
    expect(KATALOG_KREDENSIAL.some(k => k.kunci === 'WA_PENYEDIA')).toBe(true)
  })

  it('keterangan tiap penyedia menyebut apa yang harus diisi', () => {
    // Bukan kosmetik: `instance` berarti hal BERBEDA per penyedia (nama sesi
    // Evolution vs Phone Number ID Meta). Keterangan yang diam membuat orang
    // mengisi nama sesi ke kotak yang menunggu ID numerik.
    for (const p of ADAPTOR_WA_DIKENAL) {
      expect(p.keterangan.length, `penyedia ${p.kunci} tanpa keterangan`).toBeGreaterThan(20)
    }
  })
})
