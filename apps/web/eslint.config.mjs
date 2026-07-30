import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
]);

export default eslintConfig;
