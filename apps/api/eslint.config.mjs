import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // ── A3 (STATUS.md §AUDIT) ────────────────────────────────────────────
      //
      // Sebelum 2026-07-31 rule ini di-set `"off"` — padahal
      // `01-foundations/01-coding-standards.md` MUST #3 menyebut rule INI
      // SENDIRI sebagai mekanisme verifikasinya. Aturan dan praktik
      // bertentangan diam-diam: persis governance drift yang
      // `00-engineering-principles.md` MUST #3 larang eksplisit.
      //
      // Mematikan rule sambil tetap menuliskan MUST di dokumen adalah bentuk
      // terburuk — standarnya TERLIHAT ditegakkan padahal tidak.
      //
      // Dinyalakan sebagai `warn`, bukan `error`: 227 `any` yang sudah ada
      // akan langsung memerahkan CI dan memaksa satu PR raksasa lintas
      // puluhan file. Jumlahnya dikunci di `scripts/lint-ratchet.mjs` —
      // boleh turun, tak boleh naik. Aturan kembali selaras dengan praktik,
      // hutangnya terlihat, terukur, dan tak bisa diam-diam bertambah.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
