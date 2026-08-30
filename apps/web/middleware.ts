import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/auth/callback",
  // `/uji-gulir` hanya di luar produksi — halaman uji `useVirtualList` yang
  // butuh viewport & scroll sungguhan (lihat `e2e/gulir-virtual.spec.ts`).
  // Halamannya sendiri juga merender `null` saat produksi; dua lapis, karena
  // yang dijaga di sini adalah rute yang bisa ter-build tanpa sengaja.
  ...(process.env.NODE_ENV === "production" ? [] : ["/uji-gulir"]),
];

// Routes that each role is allowed to access (prefix match)
const ROLE_HOME: Record<string, string> = {
  client: "/portal",
  mandor: "/mandor-portal",
  // ⚠ SEJARAH — dibaca sebelum mengubah baris ini.
  //
  // Sampai 2026-08-29 home PM adalah `/pm-portal`, dan `/dashboard` DILARANG
  // untuknya. Alasannya ditulis terus terang waktu itu: "routes/v1/dashboard.ts
  // tak menyaring apa pun per-role, jadi membukanya untuk PM berarti memberi
  // angka keuangan seluruh perusahaan".
  //
  // Pagar dipasang di PINTU HALAMAN karena datanya sendiri tak berpagar. Itu
  // tak pernah cukup: middleware menjaga halaman Next.js, sementara
  // `/api/v1/dashboard` dijawab untuk siapa pun yang memanggilnya langsung
  // dengan token yang sah.
  //
  // Sekarang datanya YANG berpagar (`finance:view` / `finance:view:all` di
  // `routes/v1/dashboard.ts`), dan dibuktikan lewat HTTP sungguhan dengan lima
  // akun uji per peran — `scripts/uji-dashboard-per-peran.mjs`:
  //
  //     admin · direktur · pm   4/4 angka perusahaan diterima
  //     mandor · client         0/4
  //
  // Home PM karena itu boleh naik ke `/dashboard`. Yang TIDAK boleh: menaikkan
  // home tanpa menambahkan prefiksnya ke ROLE_ALLOWED — itu yang melahirkan
  // ERR_TOO_MANY_REDIRECTS pada 2026-08-02, karena redirect ke halaman yang
  // tak diizinkan akan ditolak lagi, tanpa akhir.
  pm: "/dashboard",
  admin: "/dashboard",
};

const ROLE_ALLOWED: Record<string, string[]> = {
  client:  ["/portal", "/verify"],
  // mandor bisa akses /pm-portal juga — guard di layout PM akan verifikasi apakah dia memang PM di proyek
  // `/lapangan` (punch list, inspeksi, submittal) dan `/mutu` (NCR): temuan
  // lapangan DITEMUKAN mandor, jadi ia harus bisa mencatatnya. Apa yang boleh
  // DILAKUKAN tetap dijaga permission — middleware hanya soal membuka halaman.
  // `/k3` DIBUKA untuk mandor: yang menemukan bahaya dan mengalami insiden
  // adalah orang di lapangan, dan melaporkan kecelakaan tak boleh menuntut
  // kewenangan administratif. Menahannya di admin berarti laporan insiden
  // berhenti di lisan — yang persis keadaan sebelum modul ini ada, dan
  // persis alasan `evaluasi_subkon.jumlah_kecelakaan` dulu diketik dari
  // ingatan. Apa yang boleh DILAKUKAN tetap dijaga permission: mandor punya
  // `k3:insiden:manage` tetapi tidak `k3:inspeksi:manage`.
  // `/dashboard` dibuka 2026-08-29 — angka perusahaan disaring di sumbernya,
  // dan mandor terbukti menerima 0/4 lewat uji HTTP. Home-nya TETAP
  // `/mandor-portal`: mandor bekerja dari HP di lapangan, dan mendaratkannya
  // di dashboard desktop berarti memaksanya menempuh dua ketukan tambahan
  // untuk pekerjaan yang setiap hari ia buka.
  mandor:  ["/dashboard", "/mandor-portal", "/pm-portal", "/proyek", "/verify", "/mutu", "/lapangan", "/k3"],
  // `/m` = halaman peta menu (`/m/<key>`). Satu rute untuk 100+ menu yang
  // belum punya halamannya sendiri — mendaftarkannya satu per satu di sini
  // akan jadi daftar 100 baris yang pasti ketinggalan saat menu bertambah.
  // `/mutu` (register NCR, migrasi 189) dibuka untuk PM dan mandor juga —
  // ketidaksesuaian DITEMUKAN di lapangan, dan orang yang menemukannya harus
  // bisa mencatatnya. Menahannya di admin berarti temuan lapangan berhenti
  // di lisan, yang persis keadaan sebelum modul ini ada.
  //
  // Apa yang boleh DILAKUKAN di sana tetap dijaga permission (`ncr:manage`,
  // `ncr:disposisi`, `ncr:verify`) — middleware hanya mengatur siapa yang
  // boleh membuka halamannya.
  // `/approval-inbox` untuk PM DAN admin: menyetujui bukan pekerjaan admin
  // saja — rantai approval berjenjang justru dirancang supaya level pertama
  // dipegang PM. Yang boleh DILIHAT di dalamnya tetap disaring per jenis oleh
  // `canParticipateInChain`, jadi PM yang tak berwenang atas suatu jenis
  // melihat antrean kosong untuk jenis itu — bukan 403 di depan pintu.
  //
  // `/risiko` (register risiko + mitigasi) DIBUKA untuk PM: PM yang tak tahu
  // risiko proyeknya tak bisa mengelolanya, dan tindakan mitigasi justru
  // dikerjakan timnya. `/risiko/izin` juga — izin yang belum terbit
  // menghentikan pekerjaan di lapangan, dan yang pertama tahu harus PM.
  //
  // `/risiko/sengketa` TIDAK dibuka untuk PM, dan itu bukan kelalaian:
  // isinya posisi hukum perusahaan terhadap pihak lawan — nilai tuntutan,
  // dasar hukum, dan seberapa lemah perkaranya. Bocornya ke pihak yang salah
  // merugikan perkaranya sendiri, dan PM proyek A tak berkepentingan atas
  // sengketa proyek B.
  //
  // Karena itu PM TIDAK diberi prefiks `/risiko`. `cocokRute` mencocokkan di
  // batas segmen, dan `/risiko/sengketa` ADALAH sub-segmen `/risiko` — memberi
  // PM prefiks induknya akan membuka sengketa sekaligus, diam-diam. Yang
  // diberikan: `/risiko/izin` saja.
  //
  // Akibatnya `/risiko` (register) belum terbuka untuk PM lewat daftar ini.
  // Itu DISENGAJA untuk sekarang: membukanya butuh rute register dipisah dari
  // induk yang menaungi sengketa — pekerjaan tersendiri, bukan tambalan satu
  // baris yang kebetulan lolos penjaga.
  pm:      ["/dashboard", "/pm-portal", "/proyek", "/kepatuhan", "/dokumen", "/jadwal", "/verify", "/estimasi", "/tender", "/piutang", "/aset", "/mutu", "/lapangan", "/kontrak", "/approval-inbox", "/risiko/izin", "/k3", "/m"],
  // `/gudang` = rekonsiliasi material. Ditahan di admin: angkanya menuduh —
  // "susut 12%" pada material yang dipegang mandor tertentu. Yang dituduh
  // tidak boleh jadi yang pertama membacanya.
  // `/otomasi` = ikhtisar AI & Otomasi (migrasi 267). Ditahan di admin karena
  // isinya menyebut BIAYA bulan berjalan dan percobaan akses yang ditolak —
  // dua hal yang jadi bahan kesimpulan tentang orang, bukan tentang pekerjaan.
  // `/sdm` = data kepegawaian & timesheet staf (migrasi 286). DITAHAN DI
  // ADMIN, tidak dibuka untuk PM: halaman pegawai memuat gaji pokok, status
  // PTKP, dan NPWP. Yang boleh melihat jam kerja belum tentu boleh melihat
  // berapa gaji rekannya — dan sekali terlihat, tak bisa ditarik kembali.
  //
  // Kalau kelak staf perlu mengisi timesheet-nya sendiri, yang dibuka adalah
  // rute terpisah (mis. `/sdm/saya`) dengan endpoint yang menyaring ke
  // pegawai yang sedang masuk — bukan membuka `/sdm` seluruhnya.
  // ⚠ `/master` WAJIB disebut sendiri — `/m` TIDAK mencakupnya.
  //
  // `cocokRute` mencocokkan DI BATAS SEGMEN (`pathname === prefix ||
  // pathname.startsWith(prefix + "/")`), jadi `/m` hanya cocok untuk `/m`
  // dan `/m/…`. `/master/wbs` tidak pernah cocok.
  //
  // Ditemukan 2026-08-17: founder mengeklik tiga sub-menu Master Data
  // (Template WBS, Data Kepegawaian, Penomoran Dokumen) dan ketiganya
  // terlempar ke dashboard. Halamannya ADA — 718, 760, dan 404 baris, hidup
  // sejak 2026-08-12 — tapi middleware menutup jalannya sebelum halaman
  // sempat dimuat.
  //
  // Bentuk kegagalannya yang paling jahat: TAK ADA galat sama sekali. Orang
  // menyimpulkan modulnya belum jadi, padahal sudah. Itu kelas cacat yang
  // sama dengan titik kesiapan yang basi (migrasi 439/440) — hanya saja yang
  // ini menutup aksesnya, bukan sekadar menyesatkan tampilannya.
  // `/admin-portal` — Portal Admin/Direktur (Task 1, 2026-08-22). Tanpa baris
  // ini admin akan di-redirect SENYAP ke /dashboard sebelum layout React
  // admin-portal sempat jalan sama sekali — bug class yang sudah 2x terjadi
  // di repo ini (PM 2026-08-02, Master Data 2026-08-17), TANPA satu pun
  // error. Layout admin-portal sendiri (app/admin-portal/layout.tsx) sudah
  // menjaga whitelist role admin+direktur; baris ini hanya membuka pintu
  // middleware supaya layout itu sempat dimuat.
  admin:   ["/dashboard", "/proyek", "/kepatuhan", "/dokumen", "/jadwal", "/keuangan", "/akuntansi", "/mandor", "/laporan", "/notifications", "/kas", "/users", "/klien", "/procurement", "/pengaturan", "/kalender", "/audit", "/sistem", "/estimasi", "/tender", "/piutang", "/aset", "/mutu", "/lapangan", "/kontrak", "/gudang", "/approval-inbox", "/otomasi", "/sdm", "/risiko", "/k3", "/m", "/master", "/peta-modul", "/admin-portal"],
};

/**
 * Cocokkan `pathname` dengan prefiks rute, DI BATAS SEGMEN.
 *
 * `startsWith` biasa membocorkan izin ke rute yang namanya kebetulan mirip:
 * `/proyek` cocok dengan `/proyeksi-kas`, sehingga mandor bisa membukanya
 * tanpa ada yang pernah menambahkannya ke daftar izin. Ditemukan lewat uji
 * browser 2026-08-02 — dan "Proyeksi Kas" memang sudah antre di roadmap #10,
 * jadi ini bukan skenario karangan.
 *
 * Yang cocok: prefiks itu sendiri (`/proyek`) dan anaknya (`/proyek/123`).
 * Yang tidak: saudara yang sekadar berawalan sama (`/proyeksi-kas`).
 */
function cocokRute(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

// Home tiap role WAJIB termasuk dalam izinnya sendiri. Kalau tidak, redirect
// "kembali ke home" mengarah ke halaman yang juga ditolak — dan middleware
// mengarahkan ulang selamanya sampai browser menyerah dengan
// ERR_TOO_MANY_REDIRECTS: layar kosong, tanpa pesan apa pun.
//
// Persis itu yang terjadi pada `pm` sampai 2026-08-02 (home `/dashboard`, tapi
// `/dashboard` tak ada di daftar izinnya). Ditulis sebagai kode, bukan sebagai
// catatan, supaya daftar izin berikutnya tak bisa salah tanpa ketahuan.
for (const [role, home] of Object.entries(ROLE_HOME)) {
  const izin = ROLE_ALLOWED[role];
  if (izin && !izin.some((p) => cocokRute(home, p))) {
    throw new Error(
      `ROLE_ALLOWED["${role}"] tak memuat home-nya sendiri ("${home}") — ` +
        `setiap redirect ke home akan ditolak lagi dan berulang tanpa akhir.`,
    );
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get("puraloka_token")?.value;
  const role = request.cookies.get("puraloka_role")?.value;
  const isPublic = PUBLIC_ROUTES.some((r) => cocokRute(pathname, r));

  // Belum login → redirect login
  if (!token && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Sudah login + akses public route → redirect ke home role
  if (token && isPublic) {
    const home = role ? (ROLE_HOME[role] ?? "/dashboard") : "/dashboard";
    return NextResponse.redirect(new URL(home, request.url));
  }

  // Sudah login, punya role info → cek akses
  // Custom role (tidak ada di ROLE_ALLOWED) → selalu diizinkan ke /dashboard
  if (token && role && ROLE_ALLOWED[role]) {
    const allowed = ROLE_ALLOWED[role];
    const hasAccess = allowed.some((prefix) => cocokRute(pathname, prefix)) || pathname === "/";
    if (!hasAccess) {
      const home = ROLE_HOME[role] ?? "/dashboard";
      return NextResponse.redirect(new URL(home, request.url));
    }
  } else if (token && role && !ROLE_ALLOWED[role]) {
    // Custom role: akses bebas ke /dashboard dan /proyek, blokir portal khusus role lain
    //
    // `direktur` (Task 1, Portal Admin/Direktur) JATUH KE CABANG INI — tak
    // ada entri `direktur` di ROLE_ALLOWED, jadi `role` sengaja dibiarkan
    // "custom role" (data konfigurasi per-tenant, ADR-004 §5.1 CLAUDE.md,
    // bukan konstanta literal di sini). `/admin-portal` SENGAJA TIDAK
    // ditambahkan ke `blockedPrefixes` di bawah — kalau ditambahkan,
    // direktur ikut ter-redirect ke /dashboard sebelum layout React
    // admin-portal sempat memverifikasi role-nya sendiri (layout itu
    // whitelist admin+direktur, lihat app/admin-portal/layout.tsx).
    const blockedPrefixes = ["/portal", "/mandor-portal", "/pm-portal"];
    if (blockedPrefixes.some((p) => cocokRute(pathname, p))) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  /*
    `icon` DIKECUALIKAN — favicon diminta peramban SEBELUM login.

    `app/icon.tsx` adalah rute yang menghasilkan gambar (logo perusahaan).
    Tanpa pengecualian ini middleware mengalihkannya ke /login, peramban
    menerima HTML alih-alih PNG, dan tab tampil tanpa ikon sama sekali.

    Diukur: `curl /icon` membalas `307 → /login`. Aman dibuka: yang
    diterbitkannya hanya logo dan nama perusahaan — keduanya sudah tampil di
    situs publik dan di setiap invoice.

    `manifest` DIKECUALIKAN dengan alasan yang sama, satu lapis lebih penting:
    peramban mengambil `app/manifest.ts` (disajikan di `/manifest.webmanifest`)
    untuk menawarkan "Add to Home Screen" SEBELUM ada sesi — prompt install PWA
    justru paling berguna di layar login. Tanpa pengecualian ini, manifest ikut
    redirect ke /login dan peramban menerima HTML alih-alih JSON manifest,
    sehingga PWA tak pernah dianggap installable.

    Ditemukan lewat `curl /manifest.webmanifest` yang membalas `307 → /login`
    saat menguji Task 2 (2026-08-20) — kata "icon" di matcher lama KEBETULAN
    ikut meloloskan `/icon-192` dan `/icon-512` (substring match tanpa batas
    segmen di negative lookahead), tapi tidak "manifest" karena kata itu tak
    pernah ditambahkan.

    `sw.js` DIKECUALIKAN dengan alasan yang sama, ditemukan saat menguji
    Task 3 (2026-08-20, app-shell cache PWA): `lib/register-sw.ts` sekarang
    dipanggil dari ROOT layout, jadi `navigator.serviceWorker.register('/sw.js')`
    berjalan bahkan di halaman `/login` — sebelum ada sesi. Tanpa pengecualian
    ini, `GET /sw.js` ikut redirect 307 ke /login, peramban menerima HTML
    alih-alih JavaScript, dan `register()` gagal dengan
      "The script has an unsupported MIME type ('text/html')."
    — app-shell cache tak pernah aktif untuk siapa pun yang belum login.
    Diukur: `curl /sw.js` membalas `307 → /login` sebelum baris ini
    ditambahkan. Aman dibuka: sw.js adalah berkas statis dari `public/`,
    isinya kode klien yang sudah bisa dibaca siapa pun lewat DevTools.
  */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest|sw\\.js|api).*)",
  ],
};