import { Client, type ClientConfig } from 'pg'

// Koneksi test ke Supabase dev lewat pooler (DIRECT_URL) kadang gagal SESAAT saat
// connect(): ENOTFOUND / EAI_AGAIN pada DNS pooler, ECONNRESET, atau timeout —
// perilaku transient yang sudah terdokumentasi di project ini (lihat memori
// reference-supabase-pooler-ddl). Dulu satu blip di `beforeAll` menggugurkan
// SELURUH file test (mis. 24 test authz jadi "skipped" + 1 hook failure), membuat
// suite penuh gagal ~50% padahal tak ada yang salah dengan test-nya.
//
// Kanonik: coba-ulang connect beberapa kali dengan jeda pendek. Ini BUKAN menutupi
// bug — kegagalan yang persisten (kredensial salah, DB mati) tetap dilempar setelah
// percobaan habis, dengan penyebab aslinya. Hanya blip sesaat yang diserap.

const TRANSIENT = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
])

function isTransient(err: unknown): boolean {
  const code = (err as { code?: string })?.code ?? ''
  const msg = (err as { message?: string })?.message ?? ''
  return TRANSIENT.has(code) || /timeout|timed out|fetch failed|terminating connection/i.test(msg)
}

/**
 * Buka koneksi pg, coba-ulang bila kegagalannya transient (blip pooler).
 * Gagal setelah `attempts` percobaan → lempar error asli (bukan disembunyikan).
 */
export async function connectWithRetry(config: ClientConfig, attempts = 4): Promise<Client> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    const client = new Client(config)
    try {
      await client.connect()
      return client
    } catch (err) {
      lastErr = err
      await client.end().catch(() => {}) // pastikan socket setengah-terbuka ditutup
      if (i === attempts || !isTransient(err)) break
      await new Promise(r => setTimeout(r, i * 500)) // 500ms, 1s, 1.5s
    }
  }
  throw new Error(
    `Gagal connect ke test DB setelah ${attempts} percobaan (blip pooler transient?). ` +
      `Penyebab asli: ${(lastErr as Error)?.message ?? String(lastErr)}`,
  )
}
