/**
 * PREVIEW → SETUJUI — asisten menyiapkan, MANUSIA memutuskan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA FITUR INI TIDAK MELANGGAR I-1 (asisten read-only)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Asisten tetap tak punya tool yang menulis. Yang ia lakukan: menghitung dampak
 * sebuah persetujuan dan menyerahkan SATU token kepada manusia. Token itu tak
 * berguna sampai orangnya sendiri memakainya, lewat permission-nya sendiri,
 * lewat rute yang sama dengan tombol di dashboard.
 *
 * Kalimat "asisten menyetujui kasbon" tak pernah benar di sini. Yang benar:
 * "asisten menunjukkan kasbon mana yang menunggu, berapa nominalnya, lalu
 * manusia menekan setuju tanpa membuka laptop."
 *
 * ══════════════════════════════════════════════════════════════════════════
 * P-1 — DISPATCH KE RUTE, BUKAN MEMANGGIL `utils/approval.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-10 di enam rute approval yang ada. Keputusan approval TIDAK
 * tinggal di `utils/approval.ts`; ia tersebar di rute masing-masing:
 *
 *   kasbons.ts:331     memeriksa SALDO rekening sebelum menyetujui
 *   kasbons.ts:341     `enforceKasbonLimit` — batas % earned value
 *   kasbons.ts:352     rantai bertingkat: level bukan-terakhir TIDAK mengubah
 *                      status sumber; ia mengembalikan `pending_next_level`
 *   kasbons.ts:377     `clearApprovalProgress` saat ditolak
 *
 * `recordApproval` hanya mencatat SATU langkah. Memanggilnya langsung akan
 * melewatkan saldo, batas, transisi status, dan efek sampingnya — persetujuan
 * yang tercatat tapi tak pernah terjadi.
 *
 * Karena itu approve di sini memakai `request.server.inject`, pola yang sudah
 * ada dan sudah beralasan di `routes/v1/jadwal.ts:426`. Token pemanggil ikut
 * apa adanya, jadi `authenticate` + `canParticipateInChain` berlaku persis
 * sama (P-2) — tak ada jalan pintas yang dibuat untuk fitur ini.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * P-6 / C-10 — NOMINAL BERTIPE, BUKAN TEBAKAN NAMA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS mengambil nominal dari empat nama field yang dicoba berurutan. Jenis
 * dokumen dengan nama kelima menghasilkan `null`, dan batas nominal terlewati
 * DIAM-DIAM — kegagalan senyap tepat di gerbang uang.
 *
 * Di sini nominalnya dibaca dari `SUMBER_INBOX[].kolomNominal`, yang DIDEKLARASI
 * per jenis dan bertipe. Jenis baru tanpa deklarasi tak akan "kebetulan nol";
 * ia tak bisa dikompilasi.
 *
 * Dan yang `kolomNominal: null` (tiga dari tujuh) tidak dibaca sebagai nol
 * melainkan **Infinity** — melampaui semua ambang. Konvensi itu sudah ada di
 * `lib/mr-amount.ts:18`, dengan alasan yang sama: data yang hilang harus
 * MENAMBAH pengawasan, bukan menguranginya.
 */

import type { FastifyRequest } from 'fastify'
import { randomBytes } from 'node:crypto'
import type { TenantDb } from '../utils/tenant-db.js'
import { sumberInbox, type SumberInbox } from './inbox-approval.js'

/** Umur token. Cukup untuk membaca dan memutuskan, tak cukup untuk terlupakan. */
export const UMUR_TOKEN_MS = 15 * 60_000

/**
 * Rute approval SUNGGUHAN per jenis — diukur dari kode, bukan ditebak.
 *
 * Bentuknya berbeda-beda dan itu memang kenyataannya (diukur 2026-08-10):
 * dua memakai `{ status: 'approved' }`, satu `{ action: 'approve' }`, tiga
 * tanpa badan sama sekali. Menyeragamkannya menuntut mengubah enam rute yang
 * sudah dipakai UI — perubahan besar demi kerapian, dengan risiko yang jauh
 * lebih besar daripada tabel ini.
 *
 * `material_request` DIKECUALIKAN dari preview meski rutenya ada; lihat
 * `JENIS_DIDUKUNG`.
 */
interface RuteSetujui {
  jalur: (id: string) => string
  badan: Record<string, unknown> | undefined
}

const RUTE: Record<string, RuteSetujui> = {
  kasbon: {
    jalur: (id) => `/api/v1/kasbons/${id}/status`,
    badan: { status: 'approved' },
  },
  project_expense: {
    jalur: (id) => `/api/v1/cash/expenses/${id}/status`,
    badan: { status: 'approved' },
  },
  change_order: {
    jalur: (id) => `/api/v1/change-orders/${id}/approve`,
    badan: undefined,
  },
  material_request: {
    jalur: (id) => `/api/v1/procurement/material-requests/${id}/approve`,
    badan: { action: 'approve' },
  },
  estimate_version: {
    jalur: (id) => `/api/v1/estimate-versions/${id}/approve`,
    badan: undefined,
  },
  lessons_learned: {
    jalur: (id) => `/api/v1/lessons-learned/${id}/approve`,
    badan: undefined,
  },
}

/**
 * Jenis yang boleh dipreview — SENGAJA lebih sempit dari yang punya rute.
 *
 * Kriteria E1: "preview_setujui_* HANYA untuk entitas yang jalurnya sudah
 * tunggal". Yang dikecualikan, dengan alasannya:
 *
 *   submittal        — tak ada di `RUTE`: jalur approval-nya lewat Workflow
 *                      Engine, bukan rute `/approve` tersendiri.
 *   material_request — punya rute, TAPI `kolomNominal: null` DAN nominalnya
 *                      dihitung dari item (`computeMrAmount`). Nominal yang
 *                      dihitung di dua tempat adalah persis cacat yang P-6
 *                      cegah; ia masuk setelah perhitungannya punya satu
 *                      sumber yang bisa dipanggil dari sini.
 *
 * Daftar putih, bukan daftar hitam. Jenis baru tak otomatis bisa disetujui
 * lewat asisten — ia harus ditambahkan sadar, dan penambahannya terlihat di
 * diff.
 */
export const JENIS_DIDUKUNG = [
  'kasbon',
  'project_expense',
  'change_order',
  'estimate_version',
  'lessons_learned',
] as const

export type JenisDidukung = (typeof JENIS_DIDUKUNG)[number]

export function sumberUntuk(jenis: string): SumberInbox | undefined {
  if (!(JENIS_DIDUKUNG as readonly string[]).includes(jenis)) return undefined
  /*
    `sumberInbox()`, bukan `SUMBER_INBOX.find(...)` yang ditulis ulang di sini
    sampai 2026-08-27. Keduanya identik isinya, jadi duplikasinya tak pernah
    menghasilkan galat — dan justru itu masalahnya: pencarian yang berubah di
    satu tempat (mis. jadi tak peka huruf) akan menyisakan yang lain diam-diam.
  */
  return sumberInbox(jenis)
}

/**
 * Nominal sebuah entitas. `Infinity` = TAK DIKETAHUI, melampaui semua ambang.
 *
 * Perhatikan tiga cabang yang semuanya mengembalikan Infinity, dan tak satu pun
 * mengembalikan nol atau null:
 *
 *   · jenis tanpa `kolomNominal`  → memang tak punya angka
 *   · baris tak terbaca           → gangguan basis bukan izin untuk lewat
 *   · nilai NULL di kolomnya      → dokumen yang belum diisi nominalnya
 *
 * Usul mengembalikan `null` sempat masuk akal ("biar pemanggil yang putuskan"),
 * dan justru itulah bentuk fail-open yang membuat TJS bocor: pemanggil yang
 * lupa memeriksa null akan membandingkan `null <= batas` — yang bernilai TRUE
 * di JavaScript, karena `null` dipaksa jadi 0.
 */
export async function nominalEntitas(
  db: TenantDb,
  sumber: SumberInbox,
  entityId: string,
): Promise<number> {
  if (!sumber.kolomNominal) return Number.POSITIVE_INFINITY

  const { data, error } = await db
    .from(sumber.tabel)
    .select(sumber.kolomNominal)
    .eq('id', entityId)
    .maybeSingle()

  if (error || !data) return Number.POSITIVE_INFINITY

  const mentah = (data as unknown as Record<string, unknown>)[sumber.kolomNominal]
  if (mentah === null || mentah === undefined) return Number.POSITIVE_INFINITY

  const n = Number(mentah)
  // NaN dari `numeric` yang rusak juga TAK DIKETAHUI. Membiarkannya lewat
  // berarti setiap perbandingan dengan batas bernilai false — dan false pada
  // `melebihi batas?` berarti lolos.
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY
}

/**
 * Plafon persetujuan seorang PENGGUNA (P-4).
 *
 * Tak ada baris = NOL, bukan tak terbatas. Gerbang uang yang bawaannya "boleh
 * semua" hanya terlihat salah sesudah seseorang menyetujui sesuatu yang besar.
 *
 * Bedakan dari `approval_steps.min_amount`: itu LANTAI (memilih langkah mana
 * yang berlaku), ini PLAFON. Menyamakannya akan membuat "kasbon besar wajib
 * naik ke direktur" terbaca sebagai "direktur boleh sampai sekian".
 */
export async function batasPengguna(db: TenantDb, userId: string): Promise<number> {
  const { data, error } = await db
    .from('ai_batas_setujui')
    .select('batas_idr')
    .eq('user_id', userId)
    .maybeSingle()

  /*
   * Galat baca DIBEDAKAN dari "belum diatur" — meski keduanya berujung NOL.
   *
   * Nilainya sama, konsekuensinya tidak: "belum diatur" adalah keadaan normal
   * yang tak perlu dilihat siapa pun, sedangkan basis yang tak terbaca adalah
   * gangguan yang harus terlihat. Menyatukannya (`if (error || !data)`) membuat
   * gangguan basis menyamar jadi konfigurasi — dan plafon yang tiba-tiba nol
   * untuk semua orang terbaca sebagai "fiturnya rusak", bukan "basisnya sakit".
   *
   * Keduanya tetap fail-closed. Yang ditambahkan hanya jejaknya.
   */
  if (error) {
    console.error('[ai-setujui] gagal membaca plafon, dianggap NOL:', error.message)
    return 0
  }
  if (!data) return 0
  const b = (data as { batas_idr: string | number | null }).batas_idr
  if (b === null || b === undefined) return 0
  const n = Number(b)
  return Number.isFinite(n) ? n : 0
}

export type AlasanTolakPreview =
  | 'jenis_tak_didukung'
  | 'entitas_tak_ada'
  | 'status_bukan_menunggu'
  | 'melebihi_batas'

export type HasilPreview =
  | {
      ok: true
      token: string
      jenis: string
      entityId: string
      nominal: number
      batas: number
      kedaluwarsa: string
      label: string
    }
  | { ok: false; alasan: AlasanTolakPreview; pesan: string; nominal?: number; batas?: number }

/**
 * Menyiapkan persetujuan: menghitung dampaknya dan menerbitkan token.
 *
 * TIDAK menulis apa pun ke entitasnya — satu-satunya tulisan adalah baris token
 * itu sendiri. Kalau manusia tak pernah memakainya, tak ada yang berubah.
 */
export async function siapkanPreview(opsi: {
  db: TenantDb
  companyId: string
  userId: string
  jenis: string
  entityId: string
  kanal: string
}): Promise<HasilPreview> {
  const { db, companyId, userId, jenis, entityId, kanal } = opsi

  const sumber = sumberUntuk(jenis)
  if (!sumber) {
    return {
      ok: false,
      alasan: 'jenis_tak_didukung',
      pesan: `Jenis '${jenis}' belum bisa disetujui lewat asisten.`,
    }
  }

  // Status DIBACA, bukan diasumsikan: dokumen yang sudah disetujui orang lain
  // semenit lalu tak boleh menghasilkan token yang tampak sah.
  const { data: baris, error } = await db
    .from(sumber.tabel)
    .select('id, status')
    .eq('id', entityId)
    .maybeSingle()

  if (error || !baris) {
    return { ok: false, alasan: 'entitas_tak_ada', pesan: 'Dokumen tidak ditemukan.' }
  }

  const status = (baris as { status?: string }).status ?? ''
  if (!sumber.statusMenunggu.includes(status)) {
    return {
      ok: false,
      alasan: 'status_bukan_menunggu',
      pesan: `Dokumen ini berstatus '${status}', bukan menunggu persetujuan.`,
    }
  }

  const nominal = await nominalEntitas(db, sumber, entityId)
  const batas = await batasPengguna(db, userId)

  // ── P-6, pemeriksaan PERTAMA (yang kedua di `klaimToken`) ────────────────
  //
  // `nominal > batas` dengan nominal Infinity SELALU true — itulah gunanya
  // Infinity di sini. Nominal tak diketahui tak pernah lolos.
  if (nominal > batas) {
    return {
      ok: false,
      alasan: 'melebihi_batas',
      pesan: Number.isFinite(nominal)
        ? `Nominal Rp ${nominal.toLocaleString('id-ID')} melebihi plafon Anda (Rp ${batas.toLocaleString('id-ID')}).`
        : 'Nominal dokumen ini tidak diketahui, jadi tidak bisa disetujui lewat asisten. Buka aplikasinya.',
      nominal,
      batas,
    }
  }

  // 32 byte acak. Token yang bisa ditebak sama saja dengan tak ada token.
  const token = randomBytes(32).toString('base64url')
  const kedaluwarsa = new Date(Date.now() + UMUR_TOKEN_MS).toISOString()

  const { error: errSimpan } = await db.from('ai_token_setujui').insert({
    company_id: companyId,
    token,
    user_id: userId,
    jenis,
    entity_id: entityId,
    // Infinity tak bisa disimpan `numeric`; NULL adalah representasinya di
    // basis, dan `klaimToken` membacanya kembali sebagai Infinity.
    nominal: Number.isFinite(nominal) ? nominal : null,
    kanal,
    kedaluwarsa,
  }).select('id')

  if (errSimpan) {
    return {
      ok: false,
      alasan: 'entitas_tak_ada',
      pesan: `Gagal menyiapkan persetujuan: ${errSimpan.message}`,
    }
  }

  return {
    ok: true,
    token,
    jenis,
    entityId,
    nominal,
    batas,
    kedaluwarsa,
    label: sumber.label,
  }
}

export type AlasanTolakKlaim =
  | 'token_tak_dikenal'
  | 'token_sudah_dipakai'
  | 'token_kedaluwarsa'
  | 'bukan_pemilik_token'
  | 'melebihi_batas'

export type HasilKlaim =
  | { ok: true; jenis: string; entityId: string; nominal: number }
  | { ok: false; alasan: AlasanTolakKlaim; pesan: string }

/**
 * Mengklaim token — P-3, ATOMIK.
 *
 * `UPDATE ... WHERE dipakai_pada IS NULL` dan hasilnya dibaca. Bukan SELECT
 * lalu UPDATE: dua permintaan bersamaan sama-sama melihat "belum dipakai", dan
 * keduanya menyetujui. Untuk kasbon itu berarti uang keluar dua kali — tanpa
 * galat, tanpa gejala, sampai seseorang mencocokkan buku.
 *
 * Kepemilikan diperiksa DI DALAM `WHERE` yang sama (`user_id`), bukan sesudah
 * klaim: memeriksanya sesudah berarti token orang lain sudah terlanjur habis.
 */
export async function klaimToken(opsi: {
  db: TenantDb
  userId: string
  token: string
}): Promise<HasilKlaim> {
  const { db, userId, token } = opsi

  // Dibaca lebih dulu HANYA untuk membedakan alasan penolakan. Keputusan
  // sebenarnya tetap di UPDATE bersyarat di bawah — pembacaan ini tak
  // menentukan apa pun, jadi tak ada celah balapan yang ditambahkannya.
  const { data: lihat, error: errLihat } = await db
    .from('ai_token_setujui')
    .select('user_id, jenis, entity_id, nominal, kedaluwarsa, dipakai_pada')
    .eq('token', token)
    .maybeSingle()

  if (errLihat) {
    // Gangguan basis TIDAK boleh menyamar jadi "token tidak dikenal". Kalau
    // dibiarkan, gangguan sesaat terbaca sebagai percobaan token palsu — dan
    // jejak `ai.setujui.ditolak` terisi orang yang tak melakukan kesalahan
    // apa pun, persis cacat yang `wa-sesi.ts` sudah hindari untuk nomor.
    console.error('[ai-setujui] gagal membaca token:', errLihat.message)
    return { ok: false, alasan: 'token_tak_dikenal', pesan: 'Gagal memeriksa token. Coba lagi.' }
  }
  if (!lihat) {
    return { ok: false, alasan: 'token_tak_dikenal', pesan: 'Token tidak dikenal.' }
  }

  const t = lihat as {
    user_id: string; jenis: string; entity_id: string
    nominal: string | number | null; kedaluwarsa: string; dipakai_pada: string | null
  }

  if (t.user_id !== userId) {
    // Token milik orang lain. Meneruskan token TIDAK memindahkan wewenang —
    // itulah sebabnya batas melekat pada user (P-4), bukan pada kanal.
    return {
      ok: false,
      alasan: 'bukan_pemilik_token',
      pesan: 'Token ini bukan milik Anda.',
    }
  }
  if (t.dipakai_pada) {
    return { ok: false, alasan: 'token_sudah_dipakai', pesan: 'Token sudah dipakai.' }
  }
  if (new Date(t.kedaluwarsa).getTime() < Date.now()) {
    return { ok: false, alasan: 'token_kedaluwarsa', pesan: 'Token sudah kedaluwarsa.' }
  }

  // ── P-6, pemeriksaan KEDUA ───────────────────────────────────────────────
  //
  // Batas dicek ULANG di sini, bukan dipercaya dari preview. Plafon bisa
  // diturunkan admin di antara preview dan approve, dan token yang terlanjur
  // terbit tak boleh jadi kekebalan terhadap keputusan yang lebih baru.
  //
  // `nominal` NULL di basis berarti Infinity (lihat `siapkanPreview`).
  const nominal = t.nominal === null ? Number.POSITIVE_INFINITY : Number(t.nominal)
  const batas = await batasPengguna(db, userId)
  if (!(nominal <= batas)) {
    // Ditulis `!(nominal <= batas)`, bukan `nominal > batas`: kalau nominal
    // entah bagaimana NaN, `NaN > batas` bernilai false dan ia LOLOS.
    // Bentuk ini menolak NaN juga.
    return {
      ok: false,
      alasan: 'melebihi_batas',
      pesan: 'Nominal melebihi plafon Anda saat ini.',
    }
  }

  // Klaim ATOMIK. `dipakai_pada IS NULL` ikut di WHERE — basis yang menengahi.
  const { data: diklaim, error } = await db
    .from('ai_token_setujui')
    .update({ dipakai_pada: new Date().toISOString() })
    .eq('token', token)
    .eq('user_id', userId)
    .is('dipakai_pada', null)
    .select('id')

  if (error) {
    return { ok: false, alasan: 'token_tak_dikenal', pesan: `Gagal mengklaim token: ${error.message}` }
  }
  if (!diklaim || (diklaim as unknown[]).length === 0) {
    // Nol baris = seseorang (atau permintaan kembar) menang lebih dulu.
    return { ok: false, alasan: 'token_sudah_dipakai', pesan: 'Token sudah dipakai.' }
  }

  return { ok: true, jenis: t.jenis, entityId: t.entity_id, nominal }
}

export interface HasilEksekusi {
  status: number
  badan: unknown
}

/**
 * Menjalankan persetujuan lewat RUTE yang sama dengan dashboard (P-1).
 *
 * Token otorisasi pemanggil diteruskan apa adanya, jadi seluruh preHandler
 * berlaku — `authenticate`, `canParticipateInChain`, dan pemeriksaan spesifik
 * tiap rute (saldo, batas kasbon, rantai bertingkat). Tak ada satu pun dari
 * itu yang disalin ke sini, dan itu memang tujuannya.
 */
export async function jalankanSetujui(
  request: FastifyRequest,
  jenis: string,
  entityId: string,
): Promise<HasilEksekusi> {
  const rute = RUTE[jenis]
  if (!rute) {
    return { status: 400, badan: { error: `Jenis '${jenis}' tak punya rute persetujuan.` } }
  }

  const res = await request.server.inject({
    method: 'PATCH',
    url: rute.jalur(entityId),
    headers: {
      // Header ASLI pemanggil — bukan header layanan yang melewati apa pun.
      authorization: request.headers.authorization ?? '',
      'x-company-id': (request.headers['x-company-id'] as string) ?? '',
      'content-type': 'application/json',
    },
    payload: rute.badan as never,
  })

  let badan: unknown = null
  try {
    badan = res.json()
  } catch {
    // Rute yang membalas tanpa badan bukan galat.
    badan = null
  }
  return { status: res.statusCode, badan }
}
