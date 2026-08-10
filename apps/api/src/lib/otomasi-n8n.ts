/**
 * SATU PINTU KE n8n — memanggil, dan mencatat jejaknya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA SATU BERKAS, BUKAN `fetch` DI TIAP RUTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pola yang sama dengan `wa-kirim.ts`, dan alasannya sudah terbukti sekali di
 * repo ini: 2026-08-10 `ujiKoneksi` memanggil `api.fonnte.com` langsung dari
 * route, dan penjaga satu-pintu menolaknya. Yang ditolak bukan kerapian —
 * pemanggilan yang tersebar berarti tiap tempat punya versinya sendiri untuk
 * timeout, penanganan galat, dan pencatatan jejak. Yang lupa mencatat tak
 * terlihat, karena tak mencatat memang tak menghasilkan gejala.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KREDENSIAL DIBACA PER PANGGILAN, BUKAN DI-CACHE MODUL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nilainya milik TENANT. Modul di Node hidup lintas request, jadi nilai yang
 * di-cache di tingkat modul akan dipakai tenant berikutnya — bentuk kebocoran
 * yang tak menghasilkan galat apa pun, hanya jawaban milik orang lain.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG TIDAK DILAKUKAN: MENYIMPAN ISI WORKFLOW
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS menyimpan 43 berkas JSON workflow di repo. Itu masuk akal di sana
 * (mereka versi-kan alurnya di git), tetapi TIDAK ditiru: menyalin isi
 * workflow ke basis kita berarti ada DUA sumber kebenaran yang harus dijaga
 * sinkron, dan yang basi tak akan menyatakan dirinya basi.
 *
 * Yang disimpan di sini hanya KATALOG (nama, kode, alamat, pemicu) dan
 * JEJAKNYA. Isi alurnya tetap milik n8n.
 */

import type { TenantDb } from '../utils/tenant-db.js'

/** Batas satu panggilan. Jaringan lambat tak boleh menahan request web. */
export const TIMEOUT_N8N_MS = 15_000

export interface KonfigurasiN8n {
  baseUrl: string
  apiKey: string | null
}

export type HasilJalan =
  | { ok: true; n8nJalanId: string | null; durasiMs: number }
  | { ok: false; alasan: 'tak_terkonfigurasi' | 'jaringan' | 'ditolak'; pesan: string; durasiMs: number }

/**
 * Membaca konfigurasi n8n dari kredensial tenant.
 *
 * `null` kalau belum diisi — dan itu keadaan SAH, bukan galat: tenant yang
 * belum memakai n8n tetap harus bisa membuka halamannya. Yang membedakan
 * "belum dipasang" dari "rusak" adalah pesan di UI, dan keduanya tak boleh
 * terlihat sama.
 */
export async function konfigurasiN8n(
  baca: (kunci: string) => Promise<string | null>,
): Promise<KonfigurasiN8n | null> {
  const baseUrl = (await baca('N8N_BASE_URL'))?.trim()
  if (!baseUrl) return null
  return {
    // Slash di ujung membuat `${base}/api/...` jadi `//api/...`, dan sebagian
    // reverse-proxy menjawab 404 untuk itu — galat yang menunjuk ke tempat
    // yang salah.
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: (await baca('N8N_API_KEY'))?.trim() || null,
  }
}

/**
 * Bentuk `fetch` yang bisa DIGANTI saat menguji.
 *
 * ── Kenapa disuntikkan, bukan diganti lewat `vi.stubGlobal('fetch', …)`
 *
 * Itu yang saya coba lebih dulu, dan ia MERUSAK basis: klien Supabase juga
 * memakai `fetch` global, jadi mengganti global untuk memalsukan n8n ikut
 * memalsukan setiap query. Gejalanya menyesatkan — insert jejaknya "berhasil"
 * tanpa galat dan tak menghasilkan baris, persis seperti bug tenancy.
 *
 * Menyuntikkannya membuat yang dipalsukan hanya panggilan yang memang mau
 * dipalsukan.
 */
export type FetchSeperti = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>

/** Permintaan ke n8n dengan timeout dan galat yang sudah diterjemahkan. */
async function panggil(
  cfg: KonfigurasiN8n,
  jalur: string,
  opsi: { method?: string; body?: unknown; ambil?: FetchSeperti } = {},
): Promise<{ ok: true; data: unknown } | { ok: false; alasan: 'jaringan' | 'ditolak'; pesan: string }> {
  const ambil = opsi.ambil ?? (fetch as unknown as FetchSeperti)
  const kendali = new AbortController()
  const jam = setTimeout(() => kendali.abort(), TIMEOUT_N8N_MS)
  try {
    const r = await ambil(`${cfg.baseUrl}${jalur}`, {
      method: opsi.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(cfg.apiKey ? { 'X-N8N-API-KEY': cfg.apiKey } : {}),
      },
      body: opsi.body === undefined ? undefined : JSON.stringify(opsi.body),
      signal: kendali.signal,
    })

    if (!r.ok) {
      // Badan balasan DIPOTONG. n8n bisa memulangkan jejak tumpukan panjang,
      // dan menyimpannya utuh ke `otomasi_jalan.pesan` membuat tabel jejak
      // tumbuh tak terkendali karena galat yang berulang tiap menit.
      const teks = (await r.text().catch(() => '')).slice(0, 300)
      return { ok: false, alasan: 'ditolak', pesan: `HTTP ${r.status}${teks ? `: ${teks}` : ''}` }
    }
    return { ok: true, data: await r.json().catch(() => null) }
  } catch (e) {
    const pesan = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      alasan: 'jaringan',
      pesan: kendali.signal.aborted ? `Tak ada jawaban dalam ${TIMEOUT_N8N_MS / 1000} detik` : pesan,
    }
  } finally {
    clearTimeout(jam)
  }
}

/** Memeriksa n8n hidup — dipakai kartu kesehatan, bukan tiap muat halaman. */
export async function ujiSambunganN8n(
  cfg: KonfigurasiN8n | null,
  ambil?: FetchSeperti,
): Promise<{ ok: boolean; pesan: string; durasiMs: number }> {
  const mulai = Date.now()
  if (!cfg) {
    return { ok: false, pesan: 'N8N_BASE_URL belum diisi di halaman Kredensial.', durasiMs: 0 }
  }
  const r = await panggil(cfg, '/api/v1/workflows?limit=1', { ambil })
  const durasiMs = Date.now() - mulai
  return r.ok
    ? { ok: true, pesan: `Terhubung (${durasiMs} ms)`, durasiMs }
    : { ok: false, pesan: r.pesan, durasiMs }
}

/** Daftar workflow yang BENAR-BENAR ada di n8n — untuk mencocokkan katalog. */
export async function daftarWorkflowN8n(
  cfg: KonfigurasiN8n | null,
  ambil?: FetchSeperti,
): Promise<{ ok: true; data: Array<{ id: string; name: string; active: boolean }> } | { ok: false; pesan: string }> {
  if (!cfg) return { ok: false, pesan: 'N8N_BASE_URL belum diisi.' }
  const r = await panggil(cfg, '/api/v1/workflows?limit=250', { ambil })
  if (!r.ok) return { ok: false, pesan: r.pesan }

  const isi = (r.data as { data?: unknown })?.data
  if (!Array.isArray(isi)) return { ok: false, pesan: 'Bentuk balasan n8n tak dikenali.' }
  return {
    ok: true,
    data: isi.map((w) => {
      const o = w as Record<string, unknown>
      return { id: String(o.id ?? ''), name: String(o.name ?? ''), active: o.active === true }
    }),
  }
}

interface Alur {
  id: string
  kode: string
  nama: string
  n8n_id: string | null
  jalur_webhook: string | null
}

/**
 * Menjalankan satu alur, dan MENCATAT jejaknya apa pun hasilnya.
 *
 * Barisnya ditulis DULU dengan status 'jalan', baru diperbarui — bukan
 * ditulis sekali di akhir. Bedanya menentukan: kalau prosesnya mati di tengah
 * panggilan (deploy, timeout proses, mesin restart), pola "tulis di akhir"
 * tak meninggalkan apa pun, dan alur yang MUNGKIN sudah berjalan di n8n
 * terlihat seperti tak pernah dipicu. Orang lalu memicunya lagi.
 */
export async function jalankanAlur(opsi: {
  db: TenantDb
  companyId: string
  cfg: KonfigurasiN8n | null
  alur: Alur
  sumber: 'manual' | 'jadwal' | 'peristiwa'
  oleh: string | null
  muatan?: Record<string, unknown>
  /** Hanya untuk test — lihat `FetchSeperti`. */
  ambil?: FetchSeperti
}): Promise<HasilJalan> {
  const { db, companyId, cfg, alur, sumber, oleh } = opsi
  const mulai = Date.now()

  if (!cfg) {
    return {
      ok: false,
      alasan: 'tak_terkonfigurasi',
      pesan: 'N8N_BASE_URL belum diisi di halaman Kredensial.',
      durasiMs: 0,
    }
  }
  if (!alur.n8n_id && !alur.jalur_webhook) {
    return {
      ok: false,
      alasan: 'tak_terkonfigurasi',
      pesan: `Alur "${alur.kode}" belum punya n8n_id maupun jalur webhook.`,
      durasiMs: 0,
    }
  }

  const { data: baris } = await db
    .from('otomasi_jalan')
    .insert({
      company_id: companyId,
      alur_id: alur.id,
      status: 'jalan',
      sumber,
      oleh,
    })
    .select('id')

  const jalanId = (baris as Array<{ id: string }> | null)?.[0]?.id ?? null

  const hasil = alur.jalur_webhook
    ? await panggil(cfg, `/webhook/${alur.jalur_webhook.replace(/^\/+/, '')}`, {
        method: 'POST',
        body: opsi.muatan ?? {},
        ambil: opsi.ambil,
      })
    : await panggil(cfg, `/api/v1/workflows/${alur.n8n_id}/activate`, {
        method: 'POST',
        ambil: opsi.ambil,
      })

  const durasiMs = Date.now() - mulai
  const n8nJalanId =
    hasil.ok && hasil.data && typeof hasil.data === 'object'
      ? ((hasil.data as Record<string, unknown>).executionId as string | undefined) ?? null
      : null

  if (jalanId) {
    // best-effort: alurnya SUDAH dipicu di n8n. Gagal memperbarui barisnya
    // membuat jejaknya tertinggal berstatus 'jalan' — terlihat menggantung,
    // yang justru lebih jujur daripada dihapus. Dicatat oleh pemanggil.
    await db
      .from('otomasi_jalan')
      .update({
        status: hasil.ok ? 'sukses' : 'gagal',
        selesai_pada: new Date().toISOString(),
        durasi_ms: durasiMs,
        pesan: hasil.ok ? null : hasil.pesan,
        n8n_jalan_id: n8nJalanId,
      })
      .eq('id', jalanId)
      .select('id')
  }

  return hasil.ok
    ? { ok: true, n8nJalanId, durasiMs }
    : { ok: false, alasan: hasil.alasan, pesan: hasil.pesan, durasiMs }
}

/**
 * Menghitung ULANG kesehatan alur dari jejaknya.
 *
 * Dihitung ulang, BUKAN ditambah — pelajaran yang TJS tulis sendiri di
 * `health/sync/route.ts`: counter yang di-increment per callback "rawan drift
 * kalau n8n gagal memanggilnya karena network blip". Counter yang meleset
 * tak pernah menyatakan dirinya meleset; ia hanya jadi angka yang salah dan
 * tetap dipercaya.
 *
 * Sumber kebenarannya `otomasi_jalan`, dan hitungannya bisa diulang kapan saja
 * dengan hasil yang sama.
 */
export async function segarkanKesehatanAlur(db: TenantDb, alurId: string): Promise<void> {
  const { data } = await db
    .from('otomasi_jalan')
    .select('status, dimulai_pada, pesan')
    .eq('alur_id', alurId)
    .order('dimulai_pada', { ascending: false })
    .limit(50)

  const jejak = (data ?? []) as Array<{ status: string; dimulai_pada: string; pesan: string | null }>
  const terakhir = jejak[0] ?? null
  const sukses = jejak.find((j) => j.status === 'sukses') ?? null
  const gagal = jejak.find((j) => j.status === 'gagal') ?? null

  const kesehatan = !terakhir
    ? 'belum_diketahui'
    : terakhir.status === 'sukses'
      ? 'sehat'
      : terakhir.status === 'gagal'
        ? 'gagal'
        : 'jalan'

  // best-effort: kesehatan adalah nilai TURUNAN. Gagal menyegarkannya membuat
  // angkanya basi, dan `kesehatan_pada` yang ikut disimpan membuat basinya
  // terlihat — tidak perlu membatalkan apa pun karena itu.
  await db
    .from('otomasi_alur')
    .update({
      kesehatan,
      kesehatan_pada: new Date().toISOString(),
      jalan_terakhir: terakhir?.dimulai_pada ?? null,
      sukses_terakhir: sukses?.dimulai_pada ?? null,
      gagal_terakhir: gagal?.dimulai_pada ?? null,
      pesan_gagal: kesehatan === 'gagal' ? (terakhir?.pesan ?? null) : null,
    })
    .eq('id', alurId)
    .select('id')
}
