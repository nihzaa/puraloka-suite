# 03 — AUDIT KUALITAS KODE

## 3.1 Metrik terukur

| Metrik | Nilai | Perintah |
|---|---:|---|
| `any` (`: any` / `as any`) | **358** | `grep -rEo ":\s*any\b\|as any"` |
| `@ts-ignore` / `@ts-expect-error` | **130** | `grep -rn` |
| `as unknown as` | **53** | `grep -rn` |
| `TODO` / `FIXME` / `HACK` / `XXX:` | **0** | `grep -rn` |
| `catch {}` kosong | **23** | `grep -rn` |
| `console.log` | **7** | `grep -rn` |
| `strict: true` | ✅ api & web | `apps/api/tsconfig.json:8`, `apps/web/tsconfig.json:7` |

### Bacaan jujur atas angka ini

- **`TODO` = 0 pada ~217.700 LOC** sangat tidak biasa. Ini bukan tanda tak ada utang —
  utangnya dipindahkan ke `ROADMAP.md` dan ratchet CI, yang lebih baik daripada komentar
  yang membusuk di kode.
- **`console.log` = 7** — praktis bersih.
- **358 `any` + 130 `@ts-ignore`** adalah angka besar, tapi harus dibaca bersama
  `strict: true` di kedua paket. Pola dominannya kemungkinan besar berasal dari bentuk
  balikan Supabase client yang memang sulit di-type. `BELUM DIVERIFIKASI` — sebaran
  per-file tidak dianalisis.
- **23 `catch {}` kosong** adalah temuan nyata, **tetapi** CI menjalankan
  `audit-catch-senyap.mjs` yang khusus menjaga "error ditelan tanpa jejak". Jadi angka ini
  ada di bawah ratchet, bukan liar. `[FIX-LATER]` P2.

## 3.2 Arsitektur & layering

Bukti terukur:
- `request.db` (wrapper sadar-tenant) dipakai **611×** di routes.
- Akses `supabase` mentah **364×**; dari 164 rute ber-supabase-mentah, **157 bergerbang**.

Artinya proyek **sedang bermigrasi** dari akses mentah ke wrapper, dan migrasi itu
**diukur dan dijaga CI** (`audit-gerbang-tenancy.mjs`, ratchet 7). Ini bukan layering
route→service→repository klasik, tapi **ada disiplin lapis yang ditegakkan mesin** —
lebih kuat daripada layering yang hanya jadi konvensi tak terperiksa.

Business logic memang banyak berada di route handler (49 file untuk 198 endpoint,
`gl.ts` 430 baris). `BELUM DIVERIFIKASI` — file terburuk tidak diperingkat.

## 3.3 Transaksi & atomisitas

Bukti positif yang ditemukan:
- `apps/api/src/utils/approval.ts:115` — "idempoten via `UNIQUE(entity_type, entity_id, level)`"
- `:133` — `23505` (unique violation) diperlakukan sebagai **sukses-idempoten**, bukan error
- `apps/api/src/utils/penalty.ts:125` — "idempotent — jangan hitung dua kali"
- `apps/api/src/utils/audit.ts:15` — "INSERT murni → idempotent secara alami"
- **192 trigger DB** memindahkan invarian ke lapis database (saldo kas, `protect_created_at`)

Jadi idempotensi **dipikirkan secara eksplisit** di jalur approval dan denda. Namun
**tak ditemukan mekanisme `Idempotency-Key` HTTP** untuk operasi finansial. Pertanyaan
brief — "bisakah double-submit membuat pembayaran ganda?" — **BELUM DIVERIFIKASI** untuk
`POST /finance/invoice/:id/pay` dan `POST /procurement/supplier-payments`. **P1, layak diuji.**

## 3.4 Uang & angka

- **0 kolom float di DB** — semua `numeric`. Kelas bug pembulatan biner tidak ada.
- Pembulatan AHSP terbukti konsisten & teruji eksak: `applyRounding(278362.7, ROUND_100) === 278300`.
- PPN dua-field (`ppn_rate` × `dpp_factor`): ada guardrail
  `src/lib/__tests__/ppn-dpp-guardrail.test.ts` yang **berjalan** dan melaporkan jujur:

```
[D10 GUARDRAIL] PPN records diperiksa: total=0, regime-11%=0
  ⚠️  VACUOUS: 0 record ber-PPN di lingkungan ini → regresi (b) TIDAK menguji data nyata.
      JANGAN nyalakan split dpp_factor pada lingkungan yang punya invoice PPN nyata
      sebelum guardrail ini dijalankan ULANG DI LINGKUNGAN ITU.
```

Test yang **mengumumkan dirinya sendiri hampa** alih-alih lulus diam-diam adalah praktik
rekayasa yang sangat baik. Konsekuensinya tetap harus dicatat: **penerapan seragam PPN
dua-field BELUM DIVERIFIKASI terhadap data nyata.**

## 3.5 Duplikasi, dead code, performa

`BELUM DIVERIFIKASI` seluruhnya:
- Duplikasi kalkulasi uang / format tanggal / cek permission lintas file — tidak dianalisis.
- Dead code (file/route/komponen/tabel tak terpakai) — tidak dianalisis.
- N+1 query, `SELECT *`, index hilang — tidak dianalisis. Catatan: **505 index** untuk
  122 tabel adalah rasio sehat, dan `rls-initplan.test.ts` menandakan performa policy
  sudah pernah jadi perhatian.

Alasan: keempatnya butuh analisis statis mendalam yang melampaui anggaran sesi ini.
