/**
 * KLAIM TOKEN TULIS — satu jalur untuk dua kanal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA INI DIPISAH DARI RUTENYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-16 seluruh logika klaim (~230 baris) hidup di dalam handler
 * `POST /api/v1/ai/tulis`, terikat pada `request` dan `reply` Fastify.
 *
 * Itu tak jadi masalah selama satu-satunya cara mengkonfirmasi adalah KLIK di
 * layar. WhatsApp tak punya layar: yang datang cuma kalimat "ya" lewat
 * webhook, dan webhook itu bukan pengguna yang login — ia tak punya `request`
 * milik siapa pun.
 *
 * Tiga jalan dipertimbangkan, dua ditolak:
 *
 *   1. `server.inject` dengan token pemanggil — pola `ai-setujui.ts`.
 *      DITOLAK: pola itu bekerja karena penggunanya SEDANG memegang token
 *      sesi (ia menekan tombol di aplikasi). Di WhatsApp tak ada sesi sama
 *      sekali; tak ada token untuk diteruskan.
 *
 *   2. Akun layanan, seperti penjadwal (`lib/akun-layanan.ts`).
 *      DITOLAK, dan ini yang paling penting: penjadwal bertindak atas nama
 *      TAK SEORANG PUN, jadi identitas layanan memang jujur. Kasbon yang
 *      dikonfirmasi lewat WhatsApp bertindak atas nama ORANG TERTENTU, dan
 *      menuliskannya sebagai akun layanan berarti `requested_by` menunjuk
 *      robot. Yang hilang bukan cuma kerapian jejak — batas approval,
 *      plafon, dan seluruh permission orang itu ikut lenyap, digantikan
 *      permission akun layanan yang jauh lebih besar.
 *
 *      Menerbitkan JWT atas nama orang lain juga tak tersedia di sini
 *      (`grep`: nol `admin.generateLink`/`admin.signIn` di repo), dan
 *      MENAMBAHKANNYA akan membuat siapa pun yang menguasai nomor WhatsApp
 *      bisa memperoleh sesi penuh korban. Ongkosnya tak sebanding.
 *
 *   3. **Dipakai**: pindahkan logikanya ke fungsi biasa yang menerima
 *      `TenantDb` + identitas + izin. Kedua kanal memanggil fungsi YANG SAMA,
 *      jadi tak ada "jalur WhatsApp" yang bisa menyimpang diam-diam dari
 *      jalur web. Rutenya tetap menegakkan `requirePermission('ai:tulis')`
 *      di `preHandler`; WhatsApp menegakkannya dari `izinDariPeran` yang
 *      SUDAH dibaca webhook untuk `ai:chat`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * IZIN DIPERIKSA DI SINI JUGA, BUKAN HANYA DI PEMANGGIL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Rute punya `requirePermission`, webhook punya `izinDariPeran` — dan keduanya
 * benar. Pemeriksaan di dalam fungsi ini tetap ada karena pemanggil KETIGA
 * kelak akan lupa: gerbang yang hidup di pemanggil adalah gerbang yang hilang
 * begitu ada pemanggil baru.
 *
 * `izin` WAJIB diteruskan (bukan opsional yang jatuh ke "boleh"). Parameter
 * izin yang boleh kosong akan diam-diam mengizinkan pemanggil yang lupa
 * mengisinya — kegagalan gagal-terbuka, kelas yang paling sulit terlihat.
 */

import type { TenantDb, TabelViaProject } from '../utils/tenant-db.js'
import { entitasTulis } from './ai-tool-siapkan.js'
import type { TabelKategoriBDiizinkan } from './ai-tool-siapkan.js'

/** Bentuk token apa adanya dari basis. */
interface BarisToken {
  id: string
  user_id: string
  jenis: string
  aksi: string
  project_id: string
  muatan: Record<string, unknown>
  ringkasan: string
  kedaluwarsa: string
  dipakai_pada: string | null
}

/**
 * Sebab kegagalan — DIBEDAKAN, bukan satu boolean.
 *
 * Tiap kanal menerjemahkannya sendiri: rute jadi kode HTTP, WhatsApp jadi
 * kalimat. Menyatukan semuanya jadi `false` akan memaksa keduanya menebak apa
 * yang salah, dan tebakan itu akan berbeda di dua tempat.
 */
export type SebabGagal =
  | 'gangguan'
  | 'tak_dikenal'
  | 'bukan_pemilik'
  | 'sudah_dipakai'
  | 'kedaluwarsa'
  | 'tanpa_izin'
  | 'jenis_asing'
  | 'gagal_simpan'

export type HasilKlaim =
  | { ok: true; id: string | null; jenis: string; ringkasan: string; tabel: string; projectId: string; muatan: Record<string, unknown> }
  | { ok: false; sebab: SebabGagal; pesan: string; jenis?: string }

export interface OpsiKlaim {
  db: TenantDb
  /** Siapa yang mengklaim — token milik ORANG, bukan milik nomor. */
  userId: string
  /** Permission efektif orang itu. Wajib; lihat kepala berkas. */
  izin: ReadonlySet<string>
  token: string
  catatGalat: (pesan: string, err: unknown) => void
}

/**
 * Mengklaim satu token dan menuliskan barisnya.
 *
 * Mengembalikan hasil, TIDAK melempar: dua pemanggilnya harus tetap membalas
 * sesuatu ke pengguna (200 ke penyedia webhook, JSON ke browser), dan
 * pengecualian yang lolos dari sini akan jadi 500 tanpa kalimat yang berguna.
 */
export async function klaimTokenTulis(opsi: OpsiKlaim): Promise<HasilKlaim> {
  const { db, userId, izin, catatGalat } = opsi
  const token = (opsi.token ?? '').trim()

  if (!token) {
    return { ok: false, sebab: 'tak_dikenal', pesan: 'Token tidak dikenal.' }
  }

  /*
   * Izin diperiksa SEBELUM token dibaca.
   *
   * Bukan sekadar urutan: kalau tokennya dibaca lebih dulu, orang tanpa izin
   * `ai:tulis` bisa membedakan "token ada" dari "token tidak ada" lewat
   * selisih balasan — dan itu memberitahunya bahwa tebakan tokennya mendekati.
   */
  if (!izin.has('ai:tulis')) {
    return {
      ok: false,
      sebab: 'tanpa_izin',
      pesan: 'Peran Anda belum boleh menyimpan lewat asisten.',
    }
  }

  const { data: lihat, error: errLihat } = await db
    .from('ai_token_tulis')
    .select('id, user_id, jenis, aksi, project_id, muatan, ringkasan, kedaluwarsa, dipakai_pada')
    .eq('token', token)
    .maybeSingle()

  if (errLihat) {
    // Gangguan basis TIDAK boleh menyamar jadi "token tak dikenal" — kalau
    // dibiarkan, jejaknya menuduh orang yang tak melakukan kesalahan.
    catatGalat('tulis-klaim: gagal membaca token', errLihat)
    return { ok: false, sebab: 'gangguan', pesan: 'Gagal memeriksa token. Coba lagi.' }
  }
  if (!lihat) return { ok: false, sebab: 'tak_dikenal', pesan: 'Token tidak dikenal.' }

  const t = lihat as BarisToken

  /*
   * Token milik ORANG, bukan milik perusahaan atau nomor.
   *
   * Di WhatsApp ini justru gerbang terpentingnya: dua orang di satu tenant
   * bisa sama-sama mengirim "ya" dalam menit yang sama, dan tanpa cek ini
   * kalimat satu orang akan mengklaim kasbon milik orang lain.
   */
  if (t.user_id !== userId) {
    return { ok: false, sebab: 'bukan_pemilik', pesan: 'Token ini bukan milik Anda.' }
  }
  if (t.dipakai_pada) {
    return { ok: false, sebab: 'sudah_dipakai', pesan: 'Sudah pernah disimpan.', jenis: t.jenis }
  }
  if (new Date(t.kedaluwarsa).getTime() < Date.now()) {
    return { ok: false, sebab: 'kedaluwarsa', pesan: 'Konfirmasinya sudah kedaluwarsa.', jenis: t.jenis }
  }

  const meta = entitasTulis(t.jenis)
  if (!meta) {
    return { ok: false, sebab: 'jenis_asing', pesan: `Jenis '${t.jenis}' tak dikenal lagi.` }
  }

  /*
   * Klaim ATOMIK sebelum menulis apa pun — `dipakai_pada IS NULL` di WHERE,
   * basis yang menengahi.
   *
   * Dengan baca-lalu-tulis, dua konfirmasi bersamaan sama-sama melihat "belum
   * dipakai" dan DUA baris tercipta. Di WhatsApp itu bukan skenario teoretis:
   * orang yang merasa pesannya belum terkirim mengetik "ya" dua kali, dan
   * penyedia webhook sendiri mencoba ulang saat balasan lambat.
   */
  const { data: diklaim, error: errKlaim } = await db
    .from('ai_token_tulis')
    .update({ dipakai_pada: new Date().toISOString() })
    .eq('id', t.id)
    .is('dipakai_pada', null)
    .select('id')

  if (errKlaim) {
    catatGalat('tulis-klaim: gagal mengklaim token', errKlaim)
    return { ok: false, sebab: 'gangguan', pesan: 'Gagal mengklaim token.' }
  }
  if (!diklaim || (diklaim as unknown[]).length === 0) {
    return { ok: false, sebab: 'sudah_dipakai', pesan: 'Sudah pernah disimpan.', jenis: t.jenis }
  }

  const baris = await bentukBaris(db, t, userId)

  const sasaran =
    meta.tenancy === 'B'
      ? db.from(meta.tabel as TabelKategoriBDiizinkan)
      : db.viaProject(meta.tabel as TabelViaProject, t.project_id)

  const { data: hasil, error: errTulis } = await sasaran.insert(baris).select('id')

  if (errTulis) {
    /*
     * Token SUDAH habis meski tulisannya gagal, dan itu disengaja.
     *
     * Mengembalikannya berarti token bisa dicoba berulang — pintu untuk
     * mencoba sampai satu percobaan lolos. Pengguna cukup meminta asisten
     * menyiapkan lagi; ongkosnya satu pesan.
     */
    catatGalat(`tulis-klaim: gagal menyimpan ${t.jenis}`, errTulis)
    return {
      ok: false,
      sebab: 'gagal_simpan',
      pesan: `Gagal menyimpan: ${errTulis.message}`,
      jenis: t.jenis,
    }
  }

  const idBaru = (hasil as Array<{ id: string }> | null)?.[0]?.id ?? null

  // Jejak dari NIAT ke HASIL. Best-effort: barisnya SUDAH tersimpan, dan
  // membatalkannya karena tautan gagal jauh lebih berisiko daripada
  // kehilangan tautannya. Tapi ia juga tak boleh hilang tanpa suara —
  // "siapa mencatat ini lewat asisten?" jadi tak terjawab.
  const { error: errJejak } = await db
    .from('ai_token_tulis')
    .update({ hasil_id: idBaru })
    .eq('id', t.id)
    .select('id')

  if (errJejak) {
    catatGalat('tulis-klaim: hasil_id gagal ditautkan — jejak niat→hasil terputus', errJejak)
  }

  return {
    ok: true,
    id: idBaru,
    jenis: t.jenis,
    ringkasan: t.ringkasan,
    tabel: meta.tabel,
    projectId: t.project_id,
    muatan: t.muatan,
  }
}

/**
 * Bentuk baris per jenis — cabang EKSPLISIT, bukan ternary dua arah.
 *
 * Jenis yang tak dikenali TAK BISA sampai sini: `entitasTulis()` sudah
 * menyaringnya di atas, dan `default` di bawah tetap ditulis supaya jenis baru
 * yang lupa ditangani gagal keras, bukan menyimpan muatan kosong yang terlihat
 * sah.
 */
async function bentukBaris(
  db: TenantDb,
  t: BarisToken,
  userId: string,
): Promise<Record<string, unknown>> {
  const dasar = { project_id: t.project_id }

  switch (t.jenis) {
    case 'catatan_progres':
      return { ...dasar, ...t.muatan, reported_by: userId, logged_at: new Date().toISOString() }

    case 'temuan_punch': {
      /*
       * `punch_items.nomor` WAJIB dan UNIK per proyek. Nomor dihitung dari
       * yang TERTINGGI, bukan dari jumlah baris: baris yang pernah dihapus
       * membuat hitungan menabrak nomor yang masih terpakai, dan galatnya
       * muncul sebagai "gagal menyimpan" yang tak menyebut sebabnya.
       */
      const { data: adaNomor } = await db
        .viaProject('punch_items', t.project_id)
        .select('nomor')
        .eq('project_id', t.project_id)
        .order('nomor', { ascending: false })
        .limit(1)

      const kini = new Date()
      const yymm = `${String(kini.getFullYear()).slice(2)}${String(kini.getMonth() + 1).padStart(2, '0')}`
      const terakhir = (adaNomor as Array<{ nomor: string }> | null)?.[0]?.nomor ?? ''
      const urut = Number(terakhir.split('-').pop()) || 0

      return {
        ...dasar,
        ...t.muatan,
        nomor: `PL-${yymm}-${String(urut + 1).padStart(3, '0')}`,
        status: 'terbuka',
        ditemukan_oleh: userId,
      }
    }

    case 'pengeluaran':
      /*
       * `status` SENGAJA tidak diisi — bawaannya `draft`, dan itu yang benar:
       * pengeluaran yang lahir dari percakapan tetap lewat rantai approval
       * yang sama dengan pengajuan lewat halaman biasa.
       *
       * `expense_source` DIISI eksplisit: bawaannya `petty_cash`, dan
       * `chk_petty_cash_source` menuntut `petty_cash_id` terisi untuk nilai
       * itu — membiarkannya bawaan membuat penulisan gagal sesudah token habis.
       */
      return { ...dasar, ...t.muatan, expense_source: 'main_cash', submitted_by: userId }

    case 'permintaan_material':
      // `mr_number` diisi `trg_generate_mr_number`; `status` dibiarkan bawaan
      // supaya MR ini masuk antrean approval yang sama dengan halaman biasa.
      return { ...dasar, ...t.muatan, requested_by: userId }

    case 'kasbon':
      /*
       * `status` SENGAJA tidak diisi — bawaannya `pending`. Itu justru alasan
       * kasbon boleh ditulis lewat percakapan: ia LAHIR di antrean approval.
       * Menuliskannya di sini, sekalipun bernilai sama, membuat jalur kedua
       * yang menentukan status kasbon — dan yang kedua akan menyimpang saat
       * bawaannya berubah.
       */
      return {
        project_id: t.project_id,
        amount: t.muatan.jumlah,
        purpose: t.muatan.keperluan,
        fund_source: t.muatan.sumber_dana ?? 'owner_advance',
        requested_by: userId,
      }

    default:
      // Tak terjangkau — `entitasTulis()` menyaring lebih dulu.
      throw new Error(`Jenis '${t.jenis}' belum punya bentuk baris`)
  }
}
