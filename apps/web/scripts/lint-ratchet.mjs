#!/usr/bin/env node
/**
 * RATCHET LINT `apps/web` — jumlah warning boleh TURUN, tak boleh NAIK.
 *
 * Kenapa ada (A1, STATUS.md §AUDIT): sampai 2026-07-31 `apps/web` SAMA SEKALI
 * tidak masuk CI — hanya job `api` yang ada. Akibatnya 315 lint error menumpuk
 * tanpa pernah menghalangi siapa pun, dan frontend bisa rusak tanpa CI tahu.
 *
 * Menaikkan job CI web sambil membiarkan semuanya `error` = CI merah sejak
 * menit pertama. Memperbaiki 315 sekaligus = satu PR raksasa lintas puluhan
 * file, justru berisiko regresi UI. Jalan tengahnya: aturan diturunkan ke
 * `warn` di `eslint.config.mjs`, lalu jumlahnya dikunci di sini.
 *
 * Efeknya: CI tetap menangkap yang benar-benar rusak (tsc, build, error baru),
 * DAN hutang lint tak bisa diam-diam bertambah. Ini pola yang sama dengan
 * `apps/api/src/routes/v1/__tests__/tenancy-ratchet.test.ts` — sudah terbukti
 * di repo ini: ambang diturunkan tiap gelombang beres, tak pernah dinaikkan.
 *
 * ⚠️ KALAU SCRIPT INI GAGAL karena angka NAIK: jangan naikkan ambangnya.
 *    Perbaiki warning di kode baru Anda. Ambang hanya boleh turun.
 *    Kalau gagal karena angka TURUN: bagus — turunkan ambang ke angka baru.
 */
import { ESLint } from 'eslint'

/**
 * AMBANG per-rule. Angka 2026-07-31, sesudah `ds-bundle/**` diabaikan
 * (6.070 dari 6.503 problem lama ternyata semu — keluaran bundler, bukan kode
 * yang kita tulis; lihat komentar di eslint.config.mjs).
 *
 * Dipecah PER-RULE, bukan satu angka total: kalau hanya total yang dijaga,
 * menambah 10 `any` sambil menghapus 10 `unused-vars` akan lolos — padahal
 * yang terjadi adalah hutang bergeser, bukan berkurang.
 */
const AMBANG = {
  // ── Aksesibilitas (A4, 2026-07-31) ──────────────────────────────────────
  // Angka ini muncul saat `eslint-plugin-jsx-a11y` dinyalakan PERTAMA KALI —
  // sebelumnya nol penegakan, jadi 498 temuan ini memang tak pernah terlihat.
  // Prioritas perbaikan menurut dampak ke pengguna nyata (mandor & tukang,
  // perangkat lama, sering di bawah sinar matahari):
  //   1. click-events + no-static-element-interactions (232) — bisa diklik
  //      tapi TAK BISA dijangkau keyboard. Melanggar MUST #7 langsung.
  //   2. label-has-associated-control (255) — pembaca layar tak bisa
  //      menyebutkan field apa yang sedang diisi.
  // 255 → 253 (2026-07-31) → 88 → 44 (2026-08-01, codemod `pasangkan-label.mjs`
  // dua gelombang: bentuk satu-baris dulu, lalu label MULTI-BARIS yang semula
  // dilewatkan begitu saja — 9 label di `termin-payment-modal.tsx` lolos di
  // gelombang pertama hanya karena teksnya dipecah beberapa baris).
  //
  // 167 label dipasangkan `htmlFor` ↔ `id`, id DITURUNKAN dari `value={state}`
  // yang sudah ada — tak dikarang. Efek sampingnya bagus untuk semua orang,
  // bukan hanya pembaca layar: teks label jadi bisa diketuk untuk memfokuskan
  // kontrolnya, sehingga target sentuh membesar — persis yang dibutuhkan
  // mandor di HP, satu tangan, di bawah matahari.
  //
  // Satu cacat ketahuan saat memeriksa hasilnya: label di `progress-log-modal`
  // BERCABANG ke dua kontrol berbeda (`select` scope vs `input` jumlah
  // pekerja). `htmlFor` statis menunjuk elemen yang tak dirender di salah satu
  // cabang — label MATI, yang lebih buruk daripada tak berpasangan karena
  // pembaca layar menyebutkan kaitan yang tak ada. Diperbaiki manual;
  // pemindaian menyeluruh memastikan hanya satu yang berbentuk begitu.
  //
  // 44 sisanya dilewati codemod dengan alasan: di dalam `.map()` (id tak akan
  // unik) atau tak punya `value={state}`/`name=` untuk menurunkan id.
  // 44 → 30 (2026-08-02, codemod `pasangkan-grup.mjs`): 14 label ternyata
  // menamai GRUP tombol pilihan, bukan satu kontrol — pemilih tipe akun,
  // status transfer, sumber dana, tipe invoice. `htmlFor` tak berlaku dan
  // memaksakannya justru salah: ia hanya bisa menunjuk SATU kontrol, jadi
  // label "Sumber Dana" akan menempel ke tombol pertama seolah tiga lainnya
  // tak dinamai. Yang benar: `role="group"` + `aria-labelledby`, sehingga
  // pembaca layar mengumumkan "Sumber Dana, grup" dan orang tahu itu SATU
  // pertanyaan, bukan empat tombol lepas.
  // 30 → 27: tiga di antaranya ternyata JUDUL BAGIAN, bukan label kontrol —
  // "Rincian Tukang", "Potongan", "Detail Tukang", masing-masing dengan
  // tombol "Tambah" di sebelahnya dan tak satu pun input yang ia namai.
  // `<label>` di sana memang salah elemen; diganti `<span>`.
  //
  // 22 sisanya bentuk KELIMA yang tak bisa di-codemod: label multi-baris yang
  // diikuti percabangan (`? :`), kontrolnya ada di dalam cabang. `htmlFor`
  // statis akan MATI di salah satu cabang — cacat yang sudah terbukti sekali
  // di `progress-log-modal`. Butuh penilaian per-kasus.
  'jsx-a11y/label-has-associated-control': 16,  // 21 -> 20 (2026-08-13, label foto yatim -> <span id> + aria-labelledby); 20 -> 19 (2026-08-14, satu label ikut hilang saat header buatan sendiri diganti KepalaHalaman); 19 -> 16 (2026-08-15, halaman Ambang Otomasi memakai <label htmlFor> berpasangan sejak awal — TURUN karena kode baru benar, bukan karena ada yang dilonggarkan)
  // 117 → 112 → 104 → 102 → 98 → 93 → 88 → 86 (2026-08-01/02): 5 foto di `progress-log-list` yang semula
  // `<img onClick>` — bisa diklik tetikus, TAK BISA dijangkau keyboard sama
  // sekali. Diganti `<button>`, bukan ditambal `role`+`tabIndex`+`onKeyDown`:
  // browser sudah tahu apa itu tombol, dan tambalan manual mudah tak lengkap.
  // 98 → 86 → 63 (2026-08-02). Gelombang ini menutup 25 KONTROL NYATA — bukan
  // latar modal: kartu proyek, baris mandor/scope/notifikasi yang melipat,
  // zona unggah dokumen & bukti bayar, sel kalender, galeri foto, kategori
  // laporan, dan widget dashboard.
  //
  // Sisanya 63 hampir semuanya latar modal & penahan klik `stopPropagation`
  // yang jalan keluarnya sudah dijamin Esc (P9/P13b) — bentuknya bukan tombol,
  // tapi jebakan keyboardnya sudah tak ada.
  //
  // Dua pola dipakai, dipilih per-kasus bukan disapu:
  //   `<button>`        bila isinya sederhana (zona unggah, baris upah PM)
  //   `role="button"`   bila isinya blok bersarang yang tata letaknya akan
  //   + tabIndex          berubah kalau dibungkus tombol
  //   + onKeyDown
  // Keduanya memberi hal yang sama pada pemakai keyboard: bisa difokus,
  // diaktifkan Enter/Spasi, dan dikenali pembaca layar. `e.preventDefault()`
  // pada Spasi wajib — tanpa itu halaman ikut menggulir saat tombol ditekan.
  /*
    57 → 56 (2026-09-01). Hitungan sebenarnya 54; jarak 2.

    ⚠ Ambang ini LONGGAR SEJAK HARI PERTAMA, dan itu temuan yang lebih
    penting daripada angkanya.

    Diukur di worktree pada commit penyetelnya (0aa1cc05, 2026-08-13):
    hitungan saat itu 36 — sementara ambangnya dipasang 57. Longgar 21.

    Akibatnya hutang a11y NAIK 36 → 54 sepanjang tiga minggu dan CI tetap
    hijau sepanjang itu. Ratchet yang dipasang jauh di atas kenyataan
    bukan ratchet; ia izin bertambah yang tak seorang pun sadari
    diberikan.

    Bentuknya sama dengan catatan 2026-08-07 di berkas ini sendiri
    ("utang naik 3 tanpa CI menangkapnya") — hanya enam kali lebih besar
    dan tiga minggu lebih lama.

    ── Kenapa 56, bukan 54

    Mengencangkan ke hitungan sekarang MENGUNCI hutang yang terlanjur
    naik alih-alih memperbaikinya. Jarak 2 menutup ruang naik diam-diam
    (yang tadinya 21) tanpa membekukan keadaan buruk sebagai "normal
    baru".

    Diukur sebelum menyetel: worktree `kematangan-modul` (25 berkas belum
    ter-commit) NOL menyentuh `onClick`, jadi ini tak mengunci siapa pun
    yang sedang bekerja.

    Turunkan tiap kali ada yang benar-benar dibersihkan — pelanggarannya
    tersebar di banyak berkas, jadi penurunannya akan bertahap.
  */
  'jsx-a11y/click-events-have-key-events': 56,  // 59 -> 57 (2026-08-13, backdrop lightbox jadi <button> saudara)
  // 115 → 108 → 106 (2026-08-01; `rab-section`, lalu kartu proyek jadi `<Link>`): baris kategori/sub-kategori yang
  // bisa dilipat, sel komponen biaya, dan area seret-jatuh. Dipakai helper
  // `lib/dapat-ditekan.ts` supaya `role`+`tabIndex`+Enter/Space selalu lengkap
  // — separuh implementasi (umumnya Enter ditangani, Space tidak) terasa rusak
  // sesekali, dan itu lebih membingungkan daripada rusak konsisten.
  /*
    63 → 61 (2026-09-01). Hitungan sebenarnya 59; jarak 2.

    Kasus yang sama persis dengan `click-events-have-key-events` di atas —
    keduanya disetel commit yang sama (0aa1cc05) dan sama-sama longgar
    sejak hari pertama:

        saat disetel  40   ambang 63   longgar 23
        sekarang      59   ambang 63   longgar  4

    Hutang naik 19 tanpa satu pun penjaga berbunyi. Alasan lengkapnya di
    komentar `click-events` di atas; jangan menurunkannya di sini saja
    tanpa membaca yang itu — keduanya bergerak bersama, dan pelanggaran
    yang sama sering menghitung di kedua aturan.
  */
  'jsx-a11y/no-static-element-interactions': 61,  // 64 -> 63 (2026-08-13, sumber yang sama)
  'jsx-a11y/no-noninteractive-element-interactions': 6,

  // ── Hutang lint lain ────────────────────────────────────────────────────
  /*
    59 → 43 (2026-09-01). Hitungan sebenarnya 39; ambang diberi jarak 4.

    ── Kenapa dikencangkan sekarang

    Selisih 59 vs 39 ditemukan saat CI hidup kembali sesudah mati 42
    commit, dan pertanyaannya: apakah hutangnya benar-benar turun, atau
    angka 59 yang sudah lama tak mencerminkan kenyataan?

    Diukur di worktree pada commit penyetel ambang (8ade844e, 2026-08-07):
    hitungannya 56 — jadi 59 memang akurat saat itu, dan 56 → 39 adalah
    17 pelanggaran yang benar-benar dibersihkan sejak Agustus.

    ⚠ Pelacakan `git log -S ': any'` memulangkan netto NOL dan sempat
    membuat saya menyimpulkan sebaliknya. Sebabnya: hanya 14 dari 39
    pelanggaran berbentuk `: any` — sisanya `as any`, `any[]`, generik,
    yang tak terlihat pencarian teks. Nol hasil bukan bukti ketiadaan.

    ── Kenapa 43, bukan 39

    Worktree `kematangan-modul` sedang menggarap
    `mandor/_bersama/komponen.tsx` (25 berkas belum ter-commit) — berkas
    yang menyumbang 10 dari 39 pelanggaran ini. Diukur: kerjanya TAK
    menyentuh `any` (nol di kedua arah), jadi 39 tak akan mengunci
    mereka hari ini.

    Tetapi ratchet yang dipaku persis di hitungan sekarang membuat
    penambahan `any` yang wajar di tengah pekerjaan berjalan langsung
    memerahkan CI orang lain. Jarak 4 menutup selisih 20 yang menganga
    tanpa mengunci siapa pun.

    Turunkan ke 39 saat modul mandor selesai digarap.
  */
  '@typescript-eslint/no-explicit-any': 43, // 194 → 191 (2026-08-01) → 180 (2026-08-07)
 // 100 -> 99 (2026-08-07) // 99 -> 59 (2026-08-07, mandor-portal bertipe)
  // 71 → 70 (HargaTab) → 69 (2026-08-01, klien) → 68.
  //
  // 2026-08-07: ditemukan HEAD sudah 71 — utang naik 3 tanpa CI menangkapnya,
  // artinya penjaga ini pernah dilewati. Ketiganya diperbaiki di modul
  // `mandor/`, dan dua di antaranya menutup bug nyata (daftar tukang tak
  // direset saat ganti mandor; profil mandor lama tampil di bawah id baru).
  // 68 → 58 (2026-08-07, saringan dioper lewat parameter)
  // 58 → 57 (2026-08-16, halaman pindah ke `useData`: pemuatan tak lagi
  //          memanggil setState dari dalam efek, hook-nya yang menanganinya)
  // 57 → 50 (2026-08-16, empat agent paralel: tujuh halaman lagi berhenti
  //          memanggil setState dari dalam efek — `useData` yang menanganinya)
  // 50 → 44 (2026-08-16, agent proyek+sdm: delapan halaman lagi)
  // 44 → 43 (2026-08-16, agent tersebar)
  // 43 → 41 (2026-08-16, agent pengaturan: 18 halaman)
  // 41 → 39 (2026-08-16, agent kas+kontrak+risiko: tiga arahan eslint yang
  //          SALAH TEMPAT diperbaiki — arahannya mati, pelanggarannya menyala)
  'react-hooks/set-state-in-effect': 39,
  // turun 71 → 67 (.ds-sync diabaikan) → 15 (2026-08-01).
  //
  // Sebagian besar adalah 50 impor ikon/helper yatim yang menumpuk saat
  // remediasi ADR-004 mencabut `getStoredUser()` dari 8 halaman. Impor yatim
  // tak punya ambiguitas — tak dipakai berarti dibuang, `tsc` membuktikannya.
  //
  // Tapi sisanya BUKAN kerja kosmetik, dan justru di situ nilainya: variabel
  // yatim ternyata penanda fitur yang tak tersambung. Yang ditemukan lewat
  // daftar ini dan diperbaiki hari yang sama:
  //   · `setNotes` (kas)        → modal pengeluaran mengirim `notes` ke API
  //                               tapi TAK PUNYA input. Selalu kosong.
  //   · `setFundSource` (mandor)→ kasbon selalu tercatat "Dana Owner" karena
  //                               pemilihnya tak pernah dirender; komentar di
  //                               sana menjanjikan alur approve yang tak ada.
  //   · `rowOk` (rab-schedule)  → validasi constraint DB dihitung lalu dibuang;
  //                               baris salah tak ditandai dan tombol simpan
  //                               tetap aktif sampai Postgres menolaknya.
  //   · `hasBorongan` (portal)  → dua saudaranya membuka menu, yang ini tidak:
  //                               halaman settlement borongan memang belum ada.
  //
  // 11 sisanya menunggu penilaian serupa, bukan penyapuan.
  // 11 -> 10: `localIdx` di photo-gallery dihapus (2026-08-02)
  // 10 -> 3: kode mati dibersihkan saat rombak visual (2026-08-05) —
  //   ProgressRing/ProgressBar/Avatar & PAYMENT_SYSTEM_LABEL di halaman
  //   proyek, getBudgetColor di mandor, TRIGGER_LABELS di project-modal,
  //   toLeft & prop `height` di gantt, scopeTotal di mandor-section.
  //   Semuanya benar-benar tak terpakai — diperiksa satu per satu, bukan
  //   dihapus borongan. `height` di TodayLine bahkan menyembunyikan cacat:
  //   garis "hari ini" memakai top/bottom, jadi tinggi yang dihitung
  //   pemanggil akan menyimpang diam-diam begitu jumlah baris berubah.
  '@typescript-eslint/no-unused-vars': 0,   // 1 -> 0 (2026-08-13, .layar/ diabaikan + 4 ikon mati + KETERANGAN disatukan)
  // 10 → 6 (2026-08-16, turunan array dibungkus useMemo saat halaman pindah
  //        ke `useData` — dependensi jadi stabil, bukan referensi baru tiap render)
  // 6 → 5 (2026-08-31): tiga `?? []` di useData dibungkus useMemo.
  //
  //   `const users = data?.users ?? []` membuat array BARU tiap render, jadi
  //   `useMemo` yang bergantung padanya tak pernah menahan hasilnya — semua
  //   perhitungan di dalamnya berjalan ulang setiap render, termasuk render
  //   yang tak ada hubungannya dengan data itu.
  //
  //   Jadi peringatannya menunjuk pemborosan nyata, bukan kerewelan aturan.
  //   Diperbaiki, bukan ditandai: users/page, mutu/insiden/page, isian-beban.
  'react-hooks/exhaustive-deps': 5,   // 22 -> 10 (2026-08-13, 35 salinan hook 'sudah terpasang' disatukan ke useTerpasang)
  'react/no-unescaped-entities': 0,   // 18 -> 0 (2026-08-13, kutip tipografis; contoh curl pakai &quot; supaya tetap bisa disalin)
  // 14 → 8 (2026-08-04): `Tab` di halaman mandor diangkat ke level modul.
  // Ia dulu dibuat DI DALAM render, jadi tiap pemakaiannya dihitung — 6
  // warning, dan naik jadi 7 begitu satu tab ditambahkan. Mengangkatnya
  // menghapus ketujuhnya sekaligus, bukan hanya yang baru.
  'react-hooks/static-components': 8,
  '@next/next/no-img-element': 11,
  // 4 → 2 (2026-08-16, halaman pindah ke `useData`: data diturunkan dari
  //        jawaban, bukan disalin ke state lalu dimutasi di tempat)
  // 2 → 1 (2026-08-16, situs/ berhenti menyisipkan respons PATCH ke array
  //       state secara manual — kini `muatUlang()`)
  'react-hooks/immutability': 1,
  'react-hooks/purity': 2,
  'react-hooks/rules-of-hooks': 1,
  // NOL sejak 2026-08-01: satu-satunya pelanggaran adalah ternary-sebagai-statement
  // di `mandor-section.tsx` (`next.has(id) ? next.delete(id) : next.add(id)`).
  // Berfungsi, tapi memakai ekspresi bercabang untuk efek samping menyembunyikan
  // maksudnya; `if/else` menyatakannya langsung.
  '@typescript-eslint/no-unused-expressions': 0,
}

/** Rule apa pun DI LUAR daftar di atas harus NOL — termasuk rule baru. */
const AMBANG_RULE_TAK_TERDAFTAR = 0

async function hitung() {
  // API programatik, bukan spawn `npx`: `npx.cmd` gagal EINVAL di Windows,
  // dan path `eslint/bin/*` tidak diekspos oleh ESLint v9. Jalur ini identik
  // di Windows lokal maupun Linux CI, dan tak perlu parsing stdout.
  const eslint = new ESLint({ cwd: process.cwd() })
  const hasil = await eslint.lintFiles(['.'])

  const perRule = {}
  /*
    Lokasi disimpan, bukan cuma cacahnya.

    Diukur 2026-08-31: CI melaporkan `(tanpa-rule): 1 (ambang 0)` sementara
    lokal nol — dan tak ada cara mengetahui warning MANA, karena penjaga ini
    hanya mencetak jumlah.

    Warning yang tak menyebut lokasinya tak bisa diperbaiki siapa pun. Yang
    membacanya di CI hanya bisa menebak, dan tebakan yang salah menghabiskan
    waktu lebih banyak daripada yang dihemat penjaga ini.

    Disimpan maksimal lima per rule — cukup untuk menemukan polanya, tak cukup
    untuk menenggelamkan keluaran.
  */
  const contoh = {}
  let error = 0
  for (const berkas of hasil) {
    for (const pesan of berkas.messages) {
      const rule = pesan.ruleId ?? '(tanpa-rule)'
      perRule[rule] = (perRule[rule] ?? 0) + 1
      if (pesan.severity === 2) error++
      ;(contoh[rule] ??= [])
      if (contoh[rule].length < 5) {
        const rel = berkas.filePath.replace(process.cwd(), '').replace(/^[\\/]/, '')
        /*
          Newline DIRATAKAN sebelum dipotong.

          Pesan `react-hooks` bisa 1.000+ karakter dan MEMUAT baris baru —
          memotongnya begitu saja menghasilkan keluaran yang terpecah di
          tengah kalimat ("Effe" lalu baris kosong), yang justru lebih sulit
          dibaca daripada tak ada contoh sama sekali.
        */
        const ringkas = (pesan.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 96)
        contoh[rule].push(`${rel}:${pesan.line} — ${ringkas}`)
      }
    }
  }
  return { perRule, error, contoh }
}

const { perRule, error, contoh } = await hitung()
const pelanggaran = []

// 1. NOL ERROR. Ini garis keras — `warn` boleh menumpuk (dijaga ambang),
//    `error` tidak boleh ada sama sekali.
if (error > 0) {
  pelanggaran.push(`${error} ERROR lint (harus 0 — perbaiki, jangan turunkan ke warn tanpa alasan)`)
}

// 2. Tiap rule tak boleh melebihi ambangnya.
for (const [rule, jumlah] of Object.entries(perRule)) {
  const ambang = AMBANG[rule] ?? AMBANG_RULE_TAK_TERDAFTAR
  if (jumlah > ambang) {
    pelanggaran.push(
      `${rule}: ${jumlah} (ambang ${ambang})` +
      (AMBANG[rule] === undefined ? ' — rule BARU, harus nol sejak awal' : '') +
      // Contoh lokasinya ikut dicetak. Tanpa ini, yang membaca di CI tak punya
      // cara menemukan warning mana yang dimaksud — dan lokal bisa saja nol.
      (contoh[rule]?.length ? '\n' + contoh[rule].map((c) => `        ${c}`).join('\n') : ''),
    )
  }
}

// 3. Laporkan yang TURUN supaya ambang bisa dikencangkan.
const turun = Object.entries(AMBANG)
  .filter(([rule, ambang]) => (perRule[rule] ?? 0) < ambang)
  .map(([rule, ambang]) => `${rule}: ${perRule[rule] ?? 0} < ${ambang}`)

/*
  ── AMBANG YANG TERLALU LONGGAR ADALAH IZIN BERTAMBAH ────────────────────

  Ditemukan 2026-09-01, dengan menjalankan lint di worktree pada commit
  penyetel tiap ambang:

      click-events-have-key-events   disetel 57, hitungan saat itu 36
      no-static-element-interactions disetel 63, hitungan saat itu 40

  Longgar 21 dan 23 SEJAK HARI PERTAMA. Akibatnya hutang naik 36 → 54 dan
  40 → 59 sepanjang tiga minggu, dan CI hijau sepanjang itu.

  Ratchet yang dipasang jauh di atas kenyataan bukan ratchet — ia izin
  bertambah yang tak seorang pun sadar telah diberikan. Dan blok `turun`
  di atas hanya MENYARANKAN (exit 0), jadi saran itu bisa diabaikan
  berminggu-minggu tanpa gejala.

  Sekarang kelonggarannya sendiri dijaga: jarak > BATAS_LONGGAR membuat
  ratchet MERAH, dengan pesan yang menyebut angkanya.

  ── Kenapa 8, bukan 0

  Jarak nol memaksa tiap perbaikan kecil disertai sunting berkas ini —
  gesekan yang membuat orang berhenti memperbaiki. Dan pekerjaan yang
  sedang berjalan di worktree lain butuh ruang: satu `onClick` sementara
  tak boleh memerahkan CI orang yang tak memakukan angkanya.

  Delapan cukup untuk keduanya, dan jauh di bawah 21 yang lolos selama
  tiga minggu.
*/
const BATAS_LONGGAR = 8
const terlaluLonggar = Object.entries(AMBANG)
  .map(([rule, ambang]) => ({ rule, ambang, kini: perRule[rule] ?? 0 }))
  .filter((x) => x.ambang - x.kini > BATAS_LONGGAR)

if (pelanggaran.length) {
  console.error('\n❌ RATCHET LINT GAGAL — hutang lint BERTAMBAH:\n')
  pelanggaran.forEach((p) => console.error('   ' + p))
  console.error(
    '\n   Jangan menaikkan ambang di scripts/lint-ratchet.mjs.' +
    '\n   Perbaiki warning di kode yang Anda ubah.\n',
  )
  process.exit(1)
}

console.log(`✅ Ratchet lint web: ${error} error, ${Object.values(perRule).reduce((a, b) => a + b, 0)} warning (semua di bawah/sama dengan ambang)`)
if (turun.length) {
  console.log('\n📉 Turun dari ambang — silakan kencangkan angkanya di scripts/lint-ratchet.mjs:')
  turun.forEach((t) => console.log('   ' + t))
}

if (terlaluLonggar.length) {
  console.error(`\n❌ ${terlaluLonggar.length} ambang TERLALU LONGGAR (jarak > ${BATAS_LONGGAR}):\n`)
  for (const x of terlaluLonggar) {
    console.error(`   ${x.rule}: ambang ${x.ambang}, hitungan ${x.kini} — longgar ${x.ambang - x.kini}`)
  }
  console.error('')
  console.error('   Ambang yang jauh di atas kenyataan bukan ratchet; ia IZIN')
  console.error('   BERTAMBAH yang tak seorang pun sadar telah diberikan.')
  console.error('')
  console.error('   Diukur 2026-09-01: dua ambang dipasang longgar 21 dan 23')
  console.error('   sejak hari pertama, dan hutangnya naik 18-19 sepanjang tiga')
  console.error('   minggu dengan CI hijau terus.')
  console.error('')
  console.error('   Turunkan ke sekitar hitungan sekarang — beri jarak kecil')
  console.error('   untuk pekerjaan yang sedang berjalan, bukan puluhan.')
  console.error('')
  process.exit(1)
}
