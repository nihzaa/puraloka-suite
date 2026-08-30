import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ── A4 (STATUS.md §AUDIT) — penegakan aksesibilitas ───────────────────────
  //
  // `12-ui-engineering-standard.md` MUST #6–8 (kontras 4.5:1, keyboard Level 1,
  // indikator non-warna) sebelumnya NOL penegakan: `eslint-plugin-jsx-a11y`
  // tak terpasang sama sekali. `eslint-config-next` membawa segelintir rule
  // a11y sebagai bawaan (terdeteksi hanya `alt-text` yang aktif), jauh dari
  // cakupan penuh — jadi "ada beberapa temuan a11y" selama ini menyesatkan:
  // yang lain memang tak pernah diperiksa.
  //
  // Ini bukan kepatuhan formalitas. Taksonomi menilai Kriteria Kualitas #5
  // ("UI tidak bikin pusing orang lapangan") sebagai LEMAH, dan pengguna nyata
  // sistem ini — mandor & tukang di perangkat lama, sering di bawah sinar
  // matahari — persis kelompok yang paling dirugikan kontras rendah dan target
  // sentuh kecil.
  //
  // Hanya RULE-nya yang diaktifkan, bukan `flatConfigs.recommended` utuh:
  // `eslint-config-next` sudah mendaftarkan plugin `jsx-a11y`, dan mendaftarkan
  // ulang membuat ESLint mati dengan `Cannot redefine plugin "jsx-a11y"`.
  {
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,

      // 498 temuan saat rule dinyalakan pertama kali (2026-07-31) — bukti
      // bahwa selama ini memang tak pernah diperiksa. Diturunkan ke `warn` +
      // dikunci ratchet per-rule, alasan sama persis dengan A1: memaksa
      // `error` berarti gate ini tak akan pernah dipasang sama sekali, dan
      // memperbaiki 498 sekaligus lintas puluhan file justru berisiko regresi.
      //
      // Ini bukan "diabaikan" — angkanya terkunci di scripts/lint-ratchet.mjs
      // dan hanya boleh turun. Prioritas perbaikan (dampak ke pengguna nyata):
      //   1. click-events-have-key-events + no-static-element-interactions
      //      (225) — elemen bisa diklik tapi TAK BISA dijangkau keyboard.
      //      Melanggar 12-ui-engineering-standard MUST #7 secara langsung.
      //   2. label-has-associated-control (255) — pembaca layar tak bisa
      //      menyebutkan field apa yang sedang diisi.
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",

      // MATI — keempat temuannya adalah `autoFocus` pada field PERTAMA di
      // dalam MODAL (`CreateCoModal`, `UploadModalContent`, `MilestoneModal`,
      // form tambah pekerja), diverifikasi satu per satu.
      //
      // Untuk dialog, memindahkan fokus ke dalamnya saat terbuka justru pola
      // yang BENAR — tanpa itu pengguna keyboard tertinggal di belakang modal.
      // Rule ini menyasar `autoFocus` saat pemuatan halaman, yang memang
      // membingungkan karena memindahkan fokus tanpa diminta. Kasus di sini
      // kebalikannya: fokus berpindah sebagai respons atas aksi pengguna.
      "jsx-a11y/no-autofocus": "off",

      // MATI, bukan warn — 3 temuannya SEMUA false positive, diverifikasi
      // satu per satu lewat import-nya:
      //   • mandor-portal/progress/page.tsx:353 → `Image` dari lucide-react
      //     (ikon SVG, bukan gambar)
      //   • invoice-pdf.tsx:221,410 → `Image` dari @react-pdf/renderer,
      //     merender ke PDF; tak ada DOM, tak ada pembaca layar.
      // Menambal `alt=""` di sini bukan perbaikan aksesibilitas — itu prop
      // yang tak dikenal komponennya, sekadar membungkam linter.
      // Nyalakan lagi begitu ada `<img>` HTML sungguhan di kode ini.
      "jsx-a11y/alt-text": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Bundle design-system hasil build + vendor react yang di-copy ke dalamnya.
    // Sudah ada di .gitignore:27 (tidak ter-track git) tapi eslint tetap
    // memindainya: 6.046 dari 6.503 problem berasal dari sini — semuanya semu,
    // karena ini keluaran bundler, bukan kode yang kita tulis. Tanpa baris ini
    // angka lint tidak bisa dipakai sebagai ukuran apa pun.
    "ds-bundle/**",
    // Sandbox milik alat DesignSync (skrip + node_modules-nya sendiri). Sudah
    // di .gitignore:26 — tidak ter-track git, tidak ikut ter-build, dan bukan
    // kode yang kita tulis. Kelas yang persis sama dengan `ds-bundle/**` di
    // atas: selama ia ikut dipindai, angka ratchet naik-turun mengikuti isi
    // sandbox alat, bukan mengikuti kode kita — sehingga tak berarti apa-apa.
    ".ds-sync/**",
    // Alat ukur sekali-pakai (Playwright): potret topbar, hitung padding sel,
    // sapu konsistensi antar-halaman. Di `.gitignore` — tak ter-track, tak
    // ikut ter-build, tak pernah dijalankan pengguna.
    //
    // Kelas yang persis sama dengan dua baris di atas: selama ia dipindai,
    // angka ratchet naik-turun mengikuti skrip ukur yang kebetulan tertinggal
    // di mesin seseorang, bukan mengikuti kode aplikasi. Satu `_tanda` di
    // skrip potret layar bukan hutang teknis yang perlu dijaga CI.
    ".layar/**",
  ]),

  // ── Hutang lint yang diturunkan ke `warn` + dijaga RATCHET ────────────────
  //
  // A1 (STATUS.md §AUDIT): `apps/web` sebelumnya SAMA SEKALI di luar CI, jadi
  // 315 error di bawah tak pernah menghalangi siapa pun. Menaikkan job CI web
  // sambil membiarkannya `error` = CI merah sejak menit pertama; memperbaiki
  // 315 sekaligus = satu PR raksasa yang menyentuh puluhan file sekaligus dan
  // justru berisiko regresi UI.
  //
  // Jalan tengah yang dipilih founder: turunkan ke `warn` supaya CI bisa
  // menjaga hal-hal yang BENAR-BENAR rusak (tsc, build, error baru), lalu
  // kunci jumlahnya dengan ratchet satu-arah di `lint-ratchet.test.mjs` —
  // boleh turun, TIDAK boleh naik. Persis pola `tenancy-ratchet.test.ts` yang
  // sudah terbukti di apps/api.
  //
  // Kalau ini dibiarkan `error` tanpa ratchet, yang terjadi bukan kode lebih
  // bersih — melainkan job CI web tak pernah dipasang sama sekali (status quo
  // selama ini). Warn+ratchet menukar "sempurna tapi tak pernah ada" dengan
  // "berjalan hari ini dan tak bisa memburuk".
  {
    rules: {
      // 194 — kandidat pembersihan terbesar; sejalan A3 di apps/api.
      "@typescript-eslint/no-explicit-any": "warn",
      // 71 — pola `useEffect(() => { void load(); }, [load])` berulang di
      // banyak halaman. Perbaikannya menyentuh alur fetch tiap halaman.
      "react-hooks/set-state-in-effect": "warn",
      // 28 — apostrof/kutip di teks Indonesia ("Belum ada data"). Kosmetik.
      "react/no-unescaped-entities": "warn",
      // 14+4+2+1 — temuan React Compiler; perlu ditelaah satu per satu, bukan
      // diperbaiki massal (beberapa menyangkut kebenaran render).
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/rules-of-hooks": "warn",
    },
  },

  /*
    Rute ImageResponse — `no-img-element` tidak berlaku di sini.

    `app/icon.tsx` bukan komponen halaman melainkan rute `ImageResponse`
    (next/og) yang dirender Satori DI SERVER menjadi PNG: tak ada DOM, tak
    ada peramban, dan `next/image` — yang aturan itu sarankan — tidak
    berlaku sama sekali. `<img>` memang satu-satunya cara.

    ── Kenapa dimatikan per-berkas, bukan ditandai per-baris

    Arahan `eslint-disable-next-line` di sana membuat CI merah:

        (tanpa-rule): 1 (ambang 0)
          app/icon.tsx:121 — Unused eslint-disable directive

    dan MENGHAPUSNYA membuat lokal merah:

        @next/next/no-img-element: 12 (ambang 11)

    Aturannya menyala di satu lingkungan dan diam di lingkungan lain. Selama
    ia aktif untuk berkas ini, TAK ADA bentuk arahan yang benar di keduanya:
    memasangnya salah di CI, tak memasangnya salah di lokal.

    Mematikannya untuk berkas yang memang di luar jangkauan aturan itu
    menyelesaikan keduanya, dan menyatakan alasannya sekali.
  */
  {
    files: ["app/icon.tsx", "app/**/opengraph-image.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
