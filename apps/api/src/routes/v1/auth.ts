import { FastifyInstance } from 'fastify'
import { supabase } from '../../utils/supabase.js'
import { authenticate, requirePermission } from '../../plugins/auth.js'
import { sendWelcomeEmail } from '../../utils/email.js'
import { flattenUserRole } from '../../utils/user-role.js'
import { bacaBatasPaket, masihMuat } from '../../utils/batas-paket.js'

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60,
}


export default async function authRoutes(app: FastifyInstance) {

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        // `isRateLimit` wajib ada — setErrorHandler memakainya untuk membalas 429.
        // Tanpa penanda ini balasan jatuh jadi 500 "Internal server error" dan user
        // yang terkena limit mengira kredensialnya yang salah.
        errorResponseBuilder: () => ({
          isRateLimit: true,
          error: 'Terlalu banyak percobaan login, coba lagi dalam 1 menit',
        }),
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as {
      email: string
      password: string
    }

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email dan password wajib diisi' })
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password minimal 8 karakter' })
    }

    // Login via Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return reply.status(401).send({ error: 'Email atau password salah' })
    }

    // Ambil data user dari tabel users. FASE 3 CONTRACT: role via FK (enum di-drop).
    const { data: userRow, error: userError } = await supabase
      .from('users')
      .select('id, auth_id, name, email, phone, role_id, roles:role_id ( name ), avatar_url')
      .eq('auth_id', data.user.id)
      .single()

    if (userError || !userRow) {
      return reply.status(403).send({ error: 'Akun belum terdaftar di sistem Puraloka Suite' })
    }
    const user = flattenUserRole(userRow)

    // Update last_login_at
    await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)

    // Ambil permissions + portal home secara paralel
    const [permsResult, roleResult] = await Promise.all([
      supabase.rpc('get_role_permissions', { role_name: user.role }),
      // `.maybeSingle()` + `.limit(1)`, BUKAN `.single()`.
      //
      // Sejak migrasi 363-365, `roles.name` tak lagi unik: tiap tenant punya
      // salinan rolenya sendiri, dan template global tetap ada. `.single()`
      // melempar begitu barisnya lebih dari satu — dan yang meledak adalah
      // LOGIN, jalur yang paling tak boleh gagal.
      //
      // Hari ini kebetulan belum meledak (PostgREST toleran pada bentuk
      // tertentu), tapi mengandalkan kebetulan itu berarti menunggu tenant
      // kedua untuk mengunci semua orang keluar.
      //
      // Template didahulukan kalah: `order('company_id', nullsFirst:false)`
      // menaruh baris ber-company_id di atas, sejalan dengan
      // `get_role_permissions` (migrasi 366).
      supabase.from('roles').select('portal').eq('name', user.role)
        .order('company_id', { ascending: true, nullsFirst: false })
        .limit(1).maybeSingle(),
    ])
    const permissions = (permsResult.data ?? []).map((r: { permission_key: string }) => r.permission_key)
    const homePortal = roleResult.data?.portal ?? 'dashboard'

    // Set HttpOnly cookies — tidak bisa dibaca JS di browser
    reply
      .setCookie('puraloka_token', data.session.access_token, COOKIE_OPTS)
      .setCookie('puraloka_refresh', data.session.refresh_token, COOKIE_OPTS)

    /*
      ══════════════════════════════════════════════════════════════════════
      TOKEN DI BADAN — HANYA untuk klien yang tak bisa memakai cookie
      ══════════════════════════════════════════════════════════════════════

      Cookie HttpOnly di atas adalah rancangan yang BENAR untuk browser: JS
      tak bisa membacanya, jadi XSS tak bisa mencuri sesi. Itu tak diubah,
      dan web tetap menerima `session: { expires_at }` saja.

      Tapi aplikasi mobile TIDAK memakai cookie — ia mengirim
      `Authorization: Bearer <token>`, dan tokennya diambil dari badan
      balasan ini. Yang tak pernah ada di sana.

      Diukur langsung ke produksi 2026-09-01:

          session dari login    { expires_at }   (tanpa access_token)
          mobile menyimpan      undefined
          GET /api/v1/projects  401

      **Aplikasi mobile tak pernah bisa login sekali pun** — bukan sejak
      perubahan tertentu, melainkan sejak ia ditulis. Dan tak ada galat yang
      menyebutnya: layar login menampilkan pesan kredensial, seolah sandinya
      yang salah.

      ── Kenapa berpagar header, bukan diberikan ke semua

      Memberikan token di badan untuk SEMUA klien membuang perlindungan XSS
      yang jadi alasan cookie HttpOnly dipakai: halaman web yang tersuntik
      skrip bisa membaca balasan `fetch`, tetapi tak bisa membaca cookie
      HttpOnly.

      `X-Client: mobile` tak menambah keamanan dengan sendirinya — penyerang
      bisa mengirimnya juga — dan itu memang bukan tugasnya. Yang dijaganya
      BAWAAN: web tak pernah menerima token di badan, jadi XSS di web tak
      mendapat apa-apa dari sini. Penyerang yang bisa menyuntik header sudah
      mengendalikan kliennya, dan pada titik itu ia bisa membaca token dari
      mana pun.

      ── Yang WAJIB menyertainya di sisi mobile

      `expo-secure-store` (Keychain/Keystore), bukan AsyncStorage.
      `lib/storage.ts` sudah melakukannya dan dijaga
      `audit-token-mobile-terenkripsi.mjs` — token di badan tak boleh
      berakhir di penyimpanan polos.
    */
    const klien = String(request.headers['x-client'] ?? '').toLowerCase()
    const untukMobile = klien === 'mobile'

    return reply.send({
      user,
      permissions,
      homePortal,
      session: untukMobile
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
          }
        : {
            expires_at: data.session.expires_at,
          },
    })
  })

  // POST /api/v1/auth/register — hanya admin yang bisa daftarkan user baru
  // F1 (AKTA 0 lockout fix): otorisasi via permission `users:manage`, BUKAN role
  // literal 'admin'. Sebelumnya register tak punya requirePermission sama sekali —
  // otorisasi 100% role literal yang melockout role custom (direktur punya users:manage).
  app.post('/api/v1/auth/register', {
    preHandler: [authenticate, requirePermission('users:manage')]
  }, async (request, reply) => {

    const { email, password, name, phone, role } = request.body as {
      email: string
      password: string
      name: string
      phone?: string
      role: string
    }

    if (!email || !password || !name || !role) {
      return reply.status(400).send({ error: 'Email, password, name, dan role wajib diisi' })
    }

    if (password.length < 8) {
      return reply.status(400).send({ error: 'Password minimal 8 karakter' })
    }

    /*
      T4i: lewat wrapper — `roles` kategori AB, jadi saringannya
      `company_id IS NULL OR company_id = tenant ini`. Tanpa saringan itu admin
      tenant A yang menebak nama role custom tenant B bisa mendaftarkan user
      dengan role_id milik B dan mewarisi permission set perusahaan lain.

      ⚠ SATU NAMA BISA MEMULANGKAN DUA BARIS, dan itu bukan anomali data.

      Komentar lama di sini menyatakan `roles.name` UNIQUE GLOBAL (migrasi 050).
      Diukur 2026-08-29: TIDAK. Indeks yang benar-benar ada dua, dan keduanya
      parsial:

        roles_template_name_uniq  (name)             WHERE company_id IS NULL
        roles_company_name_uniq   (company_id, name) WHERE company_id IS NOT NULL

      Jadi `pm` sah punya DUA baris: satu TEMPLATE global, satu milik tenant.
      Kode lama memakai `.maybeSingle()` — yang MELEMPAR kalau lebih dari satu
      baris, bukan memilih — lalu galatnya tak pernah diperiksa, sehingga
      roleRow jadi null dan pengguna melihat:

          "Role 'pm' tidak valid"

      Pesan yang menuduh PERAN, padahal perannya benar dan dipakai 4 user.
      Akibatnya SELURUH pembuatan user mati, bukan cuma PM. Dilaporkan founder
      dari layar, bukan dari galat — tak ada satu pun yang tercatat.

      Yang benar: role MILIK TENANT menang atas template. Template hanya dipakai
      kalau tenant belum punya salinannya sendiri — dan itu memang gunanya.
    */
    const { data: kandidatRole, error: galatRole } = await request.db!
      .from('roles').select('id, company_id').eq('name', role)

    // Galat baca TIDAK boleh menyamar jadi "role tidak valid": keduanya
    // menuntun ke perbaikan yang sama sekali berbeda.
    if (galatRole) {
      request.log.error({ galatRole, role }, 'gagal membaca tabel roles saat register')
      return reply.status(500).send({ error: 'Gagal memeriksa role' })
    }

    const daftarRole = (kandidatRole ?? []) as { id: string; company_id: string | null }[]
    const roleRow =
      daftarRole.find((r) => r.company_id !== null) ?? daftarRole.find((r) => r.company_id === null)

    if (!roleRow) {
      return reply.status(400).send({ error: `Role '${role}' tidak valid` })
    }

    // ── Batas paket: masih ada jatah pengguna? ────────────────────────────
    //
    // Diperiksa TEPAT sebelum `createUser` — langkah pertama yang tak bisa
    // dibatalkan. Sebelum ini semuanya masih pemeriksaan; sesudahnya sudah ada
    // akun di Supabase Auth yang harus dibersihkan kalau kita berubah pikiran.
    //
    // ⚠ Gagal-TERBUKA saat tenant tak punya langganan. Disengaja, alasannya di
    // `utils/batas-paket.ts`: 1878 perusahaan hidup tanpa satu baris
    // `subscriptions` pun, dan gerbang yang gagal-tertutup akan membuat
    // TAK SEORANG PUN bisa menambah pengguna, di mana pun.
    const batasPaket = await bacaBatasPaket(request.companyId!)
    if (batasPaket.dibatasi) {
      // Yang dicacah pengguna AKTIF: yang sudah dinonaktifkan tak memakai
      // jatah, dan menghitungnya membuat tenant terkunci oleh akun yang sudah
      // tak dipakai siapa pun — tanpa cara memulihkannya selain menghapus
      // orang dari basis.
      const { count, error: galatHitung } = await request.db!
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)

      if (galatHitung) {
        // Gagal MENGHITUNG tak boleh diam-diam jadi "masih muat" — batasnya
        // akan hilang tiap kali basis tersendat.
        request.log.error({ err: galatHitung }, 'gagal menghitung pengguna aktif untuk batas paket')
        return reply.status(503).send({ error: 'Gagal memeriksa batas paket. Coba lagi.' })
      }

      const muat = masihMuat(batasPaket, 'kuota.pengguna', count ?? 0)
      if (!muat.boleh) {
        // 402, bukan 403: yang pertama berarti "bayar untuk melanjutkan",
        // yang kedua "Anda tak berhak" — dan yang membaca 403 akan mencari
        // admin untuk minta izin, bukan menaikkan paketnya.
        return reply.status(402).send({
          error: muat.alasan,
          batas: muat.batas,
          terpakai: muat.terpakai,
        })
      }
    }

    // Buat auth user di Supabase
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })

    if (authError) {
      return reply.status(400).send({ error: authError.message })
    }

    // Simpan ke tabel users
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        auth_id: authData.user.id,
        name,
        email,
        phone: phone ?? null,
        role_id: roleRow.id // FASE 3 CONTRACT: role_id satu-satunya sumber (enum di-drop).
                            // Menerima role custom apa pun yang ada di tabel roles.
      })
      .select()
      .single()

    if (userError) {
      // Rollback: hapus auth user yang sudah dibuat
      await supabase.auth.admin.deleteUser(authData.user.id)
      return reply.status(500).send({ error: 'Gagal menyimpan data user' })
    }

    /*
      KEANGGOTAAN PERUSAHAAN — tanpa ini user yang baru dibuat HILANG.

      Dilaporkan founder 2026-08-29: akun yang baru didaftarkan tak muncul di
      /users, tapi pendaftaran ulang ditolak "email sudah terpakai".

      Sebabnya rute ini menyimpan ke `users` lalu berhenti. Tanpa baris di
      `company_members`, `auth_company_id()` NULL untuk orang itu, lalu
      `tenant_isolation` RESTRICTIVE (migrasi 373) menyaring HABIS: ia tak
      terlihat siapa pun, tak bisa masuk ke data apa pun, sementara emailnya
      tetap memblokir pendaftaran ulang. Nol galat.

      `is_default` WAJIB true: keanggotaan tanpa default membuat
      `auth_company_id()` tetap NULL, dan gejalanya sama persis. Cacat itu
      sudah dibersihkan DUA KALI (migrasi 379 lalu 394) karena sumbernya tak
      ikut ditutup — ini salah satu sumbernya.

      Gagal di sini = ROLLBACK, bukan diteruskan. User yang setengah jadi
      lebih buruk daripada pendaftaran yang gagal terang-terangan: yang kedua
      bisa diulang, yang pertama memblokir emailnya selamanya.
    */
    const { error: galatAnggota } = await supabase.from('company_members').insert({
      user_id: user.id,
      company_id: request.companyId!,
      // `role_id` NOT NULL dan tanpa default — keanggotaan membawa perannya
      // SENDIRI, bukan mewarisi dari `users`. Percobaan pertama melewatkannya
      // dan insert-nya gagal; rollback bekerja, jadi gejalanya "pendaftaran
      // dibatalkan" — jujur, tapi menuduh keanggotaan alih-alih kolomnya.
      role_id: roleRow.id,
      is_active: true,
      is_default: true,
      created_by: request.currentUser?.id ?? null,
    })

    if (galatAnggota) {
      request.log.error({ galatAnggota, userId: user.id }, 'gagal membuat keanggotaan perusahaan')

      /*
        HASIL PEMBERSIHAN DIPERIKSA — meski kita sudah di jalur galat.

        Godaannya jelas: pendaftarannya sudah gagal, jadi apa gunanya memeriksa
        pembersihannya? Gunanya ini — kalau `delete` juga gagal, tertinggal
        akun `users` TANPA keanggotaan apa pun. Akun seperti itu bisa masuk,
        lalu `auth_company_id()` NULL membuat RLS menyaring habis SEGALANYA:
        pengguna melihat aplikasi kosong dan menyimpulkan sistemnya rusak.

        Itu persis cacat yang menghabiskan waktu 2026-08-18, saat
        `authIdForRole` memilih admin tanpa keanggotaan dan tiga test merah
        403 di tempat yang menuduh kode lain.

        Yang TIDAK diubah: alurnya tetap membalas 500 apa pun hasilnya —
        pendaftarannya memang gagal. Yang ditambahkan cuma JEJAK, supaya akun
        yatim bisa ditemukan alih-alih ditemukan oleh pemakainya.

        Dijaga `scripts/audit-tulis-tanpa-periksa.mjs` (ambang 17); baris ini
        yang menaikkannya ke 18 sejak commit ada7df51.

        ⚠ `{ error }` SAJA TIDAK CUKUP, dan itu ambang KEDUA penjaga yang sama.
        `error` hanya terisi kalau QUERY-nya gagal — `delete` yang tak cocok
        dengan satu baris pun membalas sukses dengan nol baris tersentuh.

        Percobaan pertama saya memakai `{ error }` saja, dan penjaganya naik
        72 → 73: pelanggarannya cuma berpindah pintu. `.select('id')`
        membuatnya memulangkan baris yang BENAR-BENAR terhapus.
      */
      const { data: terhapus, error: galatBersih } = await supabase
        .from('users')
        .delete()
        .eq('id', user.id)
        .select('id')

      if (galatBersih || !terhapus || terhapus.length === 0) {
        request.log.error(
          {
            galatBersih,
            baris_terhapus: terhapus?.length ?? 0,
            userId: user.id,
            authUserId: authData.user.id,
          },
          'AKUN YATIM: pendaftaran gagal DAN pembersihannya tak menyentuh satu baris pun — user tanpa keanggotaan tertinggal di basis',
        )
      }
      await supabase.auth.admin.deleteUser(authData.user.id)
      return reply.status(500).send({
        error: 'Gagal mendaftarkan keanggotaan perusahaan — pendaftaran dibatalkan',
      })
    }

    // Fire-and-forget welcome email
    sendWelcomeEmail({ to: email, name, role, password }).catch(() => {})

    return reply.status(201).send({ message: 'User berhasil didaftarkan', user })
  })

  // GET /api/v1/auth/me — ambil data user yang sedang login
  app.get('/api/v1/auth/me', {
    preHandler: [authenticate]
  }, async (request) => {
    return { user: request.currentUser }
  })

  // POST /api/v1/auth/refresh — refresh token via cookie atau body
  app.post('/api/v1/auth/refresh', async (request, reply) => {
    // Coba ambil refresh token dari HttpOnly cookie dulu, fallback ke body
    const refreshTokenFromCookie = request.cookies?.puraloka_refresh
    const { refresh_token: refreshTokenFromBody } = (request.body ?? {}) as { refresh_token?: string }
    const refresh_token = refreshTokenFromCookie ?? refreshTokenFromBody

    if (!refresh_token) {
      return reply.status(400).send({ error: 'Refresh token tidak ditemukan' })
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    })

    if (error || !data.session) {
      // Hapus cookie yang sudah tidak valid
      reply
        .clearCookie('puraloka_token', { path: '/' })
        .clearCookie('puraloka_refresh', { path: '/' })
      return reply.status(401).send({ error: 'Refresh token tidak valid' })
    }

    // Update HttpOnly cookies dengan token baru
    reply
      .setCookie('puraloka_token', data.session.access_token, COOKIE_OPTS)
      .setCookie('puraloka_refresh', data.session.refresh_token, COOKIE_OPTS)

    return reply.send({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    })
  })

  // POST /api/v1/auth/google-callback — tukar Supabase OAuth session → HttpOnly cookie
  // Whitelist-only: hanya email yang sudah ada di tabel users yang boleh masuk
  app.post('/api/v1/auth/google-callback', async (request, reply) => {
    const { access_token, refresh_token } = request.body as {
      access_token: string
      refresh_token?: string
    }

    if (!access_token) {
      return reply.status(400).send({ error: 'access_token wajib diisi' })
    }

    // Verifikasi access_token ke Supabase
    const { data: { user: supaUser }, error: tokenError } = await supabase.auth.getUser(access_token)
    if (tokenError || !supaUser) {
      return reply.status(401).send({ error: 'Token tidak valid' })
    }

    // Whitelist check: email harus sudah ada di tabel users. FASE 3: role via FK.
    const { data: userRow } = await supabase
      .from('users')
      .select('id, auth_id, name, email, phone, role_id, roles:role_id ( name ), avatar_url')
      .eq('email', supaUser.email!)
      .single()

    if (!userRow) {
      return reply.status(403).send({ error: 'Akun belum terdaftar. Hubungi admin untuk mendapatkan akses.' })
    }
    const user = flattenUserRole(userRow)

    // Jika auth_id belum diisi (user dibuat sebelum Google OAuth aktif), update sekarang
    if (!user.auth_id) {
      // Hasil DIPERIKSA: `auth_id` adalah tautan akun ke Supabase Auth. Kalau
      // update ini gagal diam-diam, login Google berikutnya menempuh jalur yang
      // sama dan gagal menaut lagi — selamanya, tanpa gejala. Tak diblokir
      // (login yang sedang berjalan tetap sah), tapi dicatat sebagai error
      // supaya kegagalan berulang terlihat.
      const { error: tautErr } = await supabase
        .from('users').update({ auth_id: supaUser.id }).eq('id', user.id)
      if (tautErr) {
        request.log.error({ tautErr, userId: user.id }, 'Gagal menautkan auth_id ke user')
      }
    }

    // `last_login_at` sengaja fire-and-forget: kegagalannya tak mengubah apa
    // pun yang penting, dan memblokir login karena stempel waktu jauh lebih
    // buruk daripada stempel yang meleset. Dicatat, tak diblokir.
    const { error: loginErr } = await supabase
      .from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
    if (loginErr) {
      request.log.warn({ loginErr, userId: user.id }, 'Gagal mencatat last_login_at')
    }

    // Ambil permissions + portal home
    const [permsResult2, roleResult2] = await Promise.all([
      supabase.rpc('get_role_permissions', { role_name: user.role }),
      // `.maybeSingle()` + `.limit(1)`, BUKAN `.single()`.
      //
      // Sejak migrasi 363-365, `roles.name` tak lagi unik: tiap tenant punya
      // salinan rolenya sendiri, dan template global tetap ada. `.single()`
      // melempar begitu barisnya lebih dari satu — dan yang meledak adalah
      // LOGIN, jalur yang paling tak boleh gagal.
      //
      // Hari ini kebetulan belum meledak (PostgREST toleran pada bentuk
      // tertentu), tapi mengandalkan kebetulan itu berarti menunggu tenant
      // kedua untuk mengunci semua orang keluar.
      //
      // Template didahulukan kalah: `order('company_id', nullsFirst:false)`
      // menaruh baris ber-company_id di atas, sejalan dengan
      // `get_role_permissions` (migrasi 366).
      supabase.from('roles').select('portal').eq('name', user.role)
        .order('company_id', { ascending: true, nullsFirst: false })
        .limit(1).maybeSingle(),
    ])
    const permissions = (permsResult2.data ?? []).map((r: { permission_key: string }) => r.permission_key)
    const homePortal = roleResult2.data?.portal ?? 'dashboard'

    // Set HttpOnly cookies
    reply
      .setCookie('puraloka_token', access_token, COOKIE_OPTS)
    if (refresh_token) {
      reply.setCookie('puraloka_refresh', refresh_token, COOKIE_OPTS)
    }

    return reply.send({ user, permissions, homePortal })
  })

  // POST /api/v1/auth/logout — hapus cookie server-side
  app.post('/api/v1/auth/logout', async (_request, reply) => {
    reply
      .clearCookie('puraloka_token', { path: '/' })
      .clearCookie('puraloka_refresh', { path: '/' })
    return reply.send({ success: true })
  })
}
