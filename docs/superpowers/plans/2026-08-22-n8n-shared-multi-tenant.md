# n8n Shared Multi-Tenant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make n8n's 5 live event-driven WhatsApp workflows (`kasbon_submitted`, `wage_report_submitted`, `invoice_paid`, `project_status_changed`, `stok_menipis`) genuinely tenant-agnostic — credentials and destination number supplied per execution via webhook payload instead of baked into the workflow JSON at build time — and retire the 8 dead legacy "jadwal" n8n recipes that never reached production usage.

**Architecture:** `terbitkanPeristiwa()` (the existing single bridge from in-app notifications to n8n) reads tenant WA credentials via the existing one-door credential reader (`ambilKredensialTanpaRequest`) and includes them in the `muatan` payload it already sends to `jalankanAlur()`. The n8n "Kirim WhatsApp" node changes from reading baked-in `cfg.*` parameters to reading `$json.wa.*` from the incoming webhook body. A new tenant credential, `WA_NOMOR_NOTIFIKASI`, is added because the current destination number has no per-tenant home today (it's a build-time script env var). No database schema changes. No changes to `jadwal_tugas`/`otomasi-terjadwal.ts` — those ~62 automations are explicitly out of scope (they never touch n8n).

**Tech Stack:** TypeScript (Fastify API), n8n workflow JSON (built via `scripts/n8n/bangun-alur.mjs`), PostgreSQL/Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-22-n8n-shared-multi-tenant-design.md` (read §0 first — it documents a scope correction mid-brainstorm; the design sections assume the corrected, narrower scope).

## Global Constraints

- All money values `numeric`, all timestamps `timestamptz` (CLAUDE.md §5.4) — not applicable to this plan (no new monetary/timestamp columns), noted for completeness.
- `requirePermission`, never role literals, for any new authorization gate (ADR-004) — not applicable here (no new routes with auth gates), noted for completeness.
- Credentials are read ONLY through `apps/api/src/lib/kredensial.ts` (`ambilKredensial`/`ambilKredensialTanpaRequest`) — never decrypted elsewhere, enforced by `audit-kredensial-tak-bocor.mjs` (K-4, ambient NOL).
- `scripts/n8n/bangun-alur.mjs` recipe entries MUST keep a literal `kode: '...'` field per entry — `audit-peristiwa-punya-alur.mjs` greps this file as text, not as parsed AST (spec §3.6).
- Every task that touches `otomasi_jalan`/`otomasi_alur` behavior must be verifiable by running the real test suite against the real Postgres instance (`cd apps/api && npx vitest run <file>`) — no mocks for these tables, per repo convention (`otomasi-n8n.test.ts` is the existing reference pattern).
- Before any `git stash`, destructive git operation, or `pnpm install`, check `git worktree list` and consider that 11+ other sessions may have this repo open concurrently (observed live via `ListAgents` during planning) — CLAUDE.md §8a.1 stop condition #1.
- This plan does not touch `jadwal_tugas`, `KATALOG_TUGAS`, or any of the ~62 routes in `otomasi-terjadwal.ts` — confirmed out of scope by the spec's §0 correction. Do not "helpfully" extend scope to wire WhatsApp into those automations; that is a separate, unscoped future project (spec §6).

---

### Task 1: Add `WA_NOMOR_NOTIFIKASI` tenant credential

**Files:**
- Modify: `apps/api/src/lib/kredensial.ts` (add entry to `KATALOG_KREDENSIAL` array, after the existing `WA_PENYEDIA` entry around line 125)
- Test: `apps/api/src/lib/__tests__/kredensial-jatuhan.test.ts` (existing file — add assertions), or a new focused test if that file's scope doesn't fit

**Interfaces:**
- Consumes: `MetaKredensial` interface (already defined in `kredensial.ts`, unchanged)
- Produces: A new catalog key `'WA_NOMOR_NOTIFIKASI'` retrievable via `ambilKredensial(request, 'WA_NOMOR_NOTIFIKASI')` and `ambilKredensialTanpaRequest(companyId, 'WA_NOMOR_NOTIFIKASI')` — both functions are generic over the catalog and need no code changes themselves, only the catalog entry.

- [ ] **Step 1: Read the current WhatsApp credential group to match its exact style**

Read `apps/api/src/lib/kredensial.ts` lines 84-125 (the `WA_BASE_URL`/`WA_API_KEY`/`WA_INSTANCE`/`WA_PENYEDIA` entries) to copy the comment style and field shape exactly.

- [ ] **Step 2: Add the new catalog entry**

Insert after the `WA_PENYEDIA` entry (before the `ANTHROPIC_API_KEY` entry) in `apps/api/src/lib/kredensial.ts`:

```ts
  {
    /*
     * ── NOMOR TUJUAN NOTIFIKASI — sebelumnya env build-time, sekarang kredensial tenant
     *
     * Sampai migrasi n8n shared (2026-08-22), nomor ini dipatok lewat
     * `WA_TUJUAN` di environment SAAT `scripts/n8n/bangun-alur.mjs`
     * dijalankan — bukan kredensial tenant sama sekali. Setiap tenant baru
     * akan butuh workflow n8n dibangun ulang dengan env berbeda, yang
     * bertentangan langsung dengan tujuan instance shared.
     *
     * Sekarang dibaca `terbitkanPeristiwa()` per-tenant lewat jalur
     * kredensial yang sama dengan WA_BASE_URL dkk, dan disertakan di
     * payload webhook ke n8n — bukan dipatok ke node workflow.
     */
    kunci: 'WA_NOMOR_NOTIFIKASI',
    label: 'WhatsApp — nomor tujuan notifikasi',
    keterangan: 'Nomor yang menerima notifikasi otomatis (kasbon diajukan, invoice dibayar, dst), format 62xxxxxxxxxx tanpa +. Kosong = notifikasi otomatis tidak terkirim.',
    grup: 'WhatsApp',
  },
```

- [ ] **Step 3: Verify the catalog entry is picked up by the existing credentials UI/route without further code changes**

Run: `cd apps/api && npx vitest run src/routes/v1/__tests__/kredensial.test.ts -t "katalog"`
Expected: PASS — this file already asserts the credentials route reflects `KATALOG_KREDENSIAL` contents dynamically, so a new entry should appear automatically. If this specific test name doesn't exist, run the whole file and confirm nothing breaks: `cd apps/api && npx vitest run src/routes/v1/__tests__/kredensial.test.ts`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/kredensial.ts
git commit -m "feat(kredensial): tambah WA_NOMOR_NOTIFIKASI sebagai kredensial tenant

Sebelumnya dipatok lewat env WA_TUJUAN saat build workflow n8n —
tak ada tempat tenant mengisinya sendiri. Prasyarat migrasi n8n
shared multi-tenant (lihat spec 2026-08-22)."
```

---

### Task 2: Extend `terbitkanPeristiwa()` to read and forward WA credentials

**Files:**
- Modify: `apps/api/src/utils/terbit-peristiwa.ts` (function `terbitkanPeristiwa`, lines ~91-217; specifically the block currently at lines 185-209)
- Test: `apps/api/src/lib/__tests__/otomasi-n8n.test.ts` is the closest existing pattern for testing `jalankanAlur()` payloads — but `terbitkanPeristiwa()` itself has no dedicated test file today. Create `apps/api/src/utils/__tests__/terbit-peristiwa.test.ts`.

**Interfaces:**
- Consumes: `ambilKredensialTanpaRequest(companyId: string, kunci: string): Promise<string | null>` (already imported in `terbit-peristiwa.ts` line 51, unchanged signature). `jalankanAlur(opsi): Promise<HasilJalan>` (from `otomasi-n8n.ts`, unchanged signature — `opsi.muatan` accepts any `Record<string, unknown>`).
- Produces: `terbitkanPeristiwa()` keeps its exact existing signature (`companyId: string, jenis: string, contoh: NotificationParams, jumlahPenerima: number): Promise<void>`) — no caller elsewhere in the codebase needs to change. The change is entirely inside the function body.

- [ ] **Step 1: Write the failing test — payload includes `wa` object with credentials**

Create `apps/api/src/utils/__tests__/terbit-peristiwa.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Client } from 'pg'
import { createRlsClient } from '../../test-utils/rls-harness.js'
import { terbitkanPeristiwa } from '../terbit-peristiwa.js'
import * as kredensialMod from '../../lib/kredensial.js'

let db: Client
let companyId: string

beforeAll(async () => {
  db = await createRlsClient()
  const { rows } = await db.query(`
    SELECT c.id FROM companies c
     WHERE EXISTS (SELECT 1 FROM company_members m WHERE m.company_id = c.id) LIMIT 1`)
  companyId = rows[0].id

  await db.query(
    `INSERT INTO otomasi_alur (company_id, kode, nama, n8n_id, jalur_webhook, aktif)
     VALUES ($1, 'teruskan-kasbon-diajukan', 'Uji Peristiwa', 'wf-uji-tp', 'teruskan-kasbon-diajukan', true)
     ON CONFLICT (company_id, kode) DO UPDATE SET aktif = true`,
    [companyId],
  )
})

afterAll(async () => {
  await db.query(`DELETE FROM otomasi_alur WHERE company_id = $1 AND kode = 'teruskan-kasbon-diajukan' AND nama = 'Uji Peristiwa'`, [companyId])
  await db.end()
})

describe('terbitkanPeristiwa — payload WA', () => {
  it('menyertakan wa.{url,apiKey,instance,nomorTujuan} dari kredensial tenant', async () => {
    // NODE_ENV harus BUKAN 'test' untuk baris ini — terbitkanPeristiwa()
    // sengaja diam total saat NODE_ENV==='test' (lihat komentar di berkas
    // sumbernya, baris ~100-130). Simulasikan lingkungan non-test dengan
    // menyuntik langsung, BUKAN mengubah process.env.NODE_ENV (mengubahnya
    // di tengah suite vitest membuka saluran keluar sungguhan bagi test
    // lain yang berjalan paralel — persis yang dicegah pagar itu).
    //
    // Karena pagar NODE_ENV ada DI DALAM terbitkanPeristiwa() sebelum baris
    // yang diuji, test ini memverifikasi lewat mocking konfigurasiN8n/
    // jalankanAlur agar tetap bisa memeriksa BENTUK muatan tanpa memicu
    // panggilan jaringan sungguhan. Lihat implementasi Task 2 Step 3 untuk
    // opsi injeksi yang dipilih.
    expect(true).toBe(true) // placeholder — diganti Step 2 setelah bentuk injeksi diputuskan
  })
})
```

⚠ **Before implementing Step 1 for real**: `terbitkanPeristiwa()` has a hard `if (process.env.NODE_ENV === 'test') return` guard (current line ~130) specifically so test suites never fire real outbound WhatsApp messages. This means the function as currently structured is **not directly testable** for its post-guard behavior from within the vitest suite. Resolve this in Step 1a below before writing the real test body.

- [ ] **Step 1a: Decide and implement the test-seam (do this before Step 1's placeholder test)**

Read `apps/api/src/utils/terbit-peristiwa.ts` lines 91-135 in full to see the exact guard. The correct fix is **not** to remove or weaken the `NODE_ENV==='test'` guard (that guard is exactly what stops CI from sending real WhatsApp messages, per the file's own extensive comment about the 2026-08-14 incident). Instead, extract the credential-gathering logic (the new code from Task 2 Step 2) into a small, separately-testable pure-ish function:

```ts
// New, exported for testing — pure composition of kredensial reads.
// Exported specifically so tests can verify the SHAPE of the wa object
// without going through the NODE_ENV guard or calling jalankanAlur.
export async function muatanWaPeristiwa(companyId: string): Promise<{
  url: string | null
  apiKey: string | null
  instance: string | null
  nomorTujuan: string | null
}> {
  const [url, apiKey, instance, nomorTujuan] = await Promise.all([
    ambilKredensialTanpaRequest(companyId, 'WA_BASE_URL'),
    ambilKredensialTanpaRequest(companyId, 'WA_API_KEY'),
    ambilKredensialTanpaRequest(companyId, 'WA_INSTANCE'),
    ambilKredensialTanpaRequest(companyId, 'WA_NOMOR_NOTIFIKASI'),
  ])
  return { url, apiKey, instance, nomorTujuan }
}
```

This function is called from inside `terbitkanPeristiwa()` in Step 2, AND is directly unit-testable (it has no `NODE_ENV` guard of its own — the guard stays where it is, before the n8n call). Now replace the placeholder test in Step 1 with a real one:

```ts
import { muatanWaPeristiwa } from '../terbit-peristiwa.js'
import { supabase } from '../../utils/supabase.js'
import { bukaNilai } from '../../lib/kredensial-sandi.js' // not needed directly; using DB round-trip instead

describe('muatanWaPeristiwa', () => {
  it('mengembalikan null untuk keempat field saat tenant belum mengisi kredensial', async () => {
    // companyId dummy yang pasti tak punya baris app_credentials
    const hasil = await muatanWaPeristiwa('00000000-0000-0000-0000-000000000000')
    expect(hasil).toEqual({ url: null, apiKey: null, instance: null, nomorTujuan: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/utils/__tests__/terbit-peristiwa.test.ts -v`
Expected: FAIL with "muatanWaPeristiwa is not exported" or similar — the function doesn't exist yet.

- [ ] **Step 3: Implement `muatanWaPeristiwa()` and wire it into `terbitkanPeristiwa()`**

In `apps/api/src/utils/terbit-peristiwa.ts`:

1. Add the `muatanWaPeristiwa` export shown in Step 1a, placed above `terbitkanPeristiwa()`.
2. Modify the `jalankanAlur()` call block (currently lines ~194-209) to:

```ts
  const wa = await muatanWaPeristiwa(companyId)

  const hasil = await jalankanAlur({
    db: createTenantDb(companyId),
    companyId,
    cfg,
    alur: alurRow as never,
    sumber: 'peristiwa',
    oleh: null,
    muatan: {
      companyId,
      jenis,
      kode,
      judul: contoh.title,
      pesan: contoh.message,
      proyek_id: contoh.project_id ?? null,
      penerima: jumlahPenerima,
      wa,
    },
  })
```

3. Update the stale header comment at lines ~44-49 ("Kenapa muatannya tipis"). It currently claims *"n8n punya kunci API untuk mengambil sendiri apa yang ia butuhkan lewat `/api/v1/otomasi/umpan/*`"* — this is no longer true after this change (n8n never calls back). Replace with:

```
 * ── Kenapa muatannya tipis (TAPI kini membawa kredensial WA)
 *
 * Yang dikirim hanya jenis, judul, pesan, id proyek, DAN — sejak migrasi
 * n8n shared (2026-08-22) — kredensial WA tenant (wa.url/apiKey/instance/
 * nomorTujuan). BUKAN seluruh baris entitas: n8n tak lagi mengambil data
 * sendiri (lihat docs/superpowers/specs/2026-08-22-n8n-shared-multi-tenant-design.md
 * §0 untuk kenapa asumsi lama soal itu salah), tapi payload tetap tak
 * membawa data operasional mentah — hanya yang perlu ditampilkan/dikirim.
 *
 * Kredensial WA transit di payload ini SADAR dan diterima sebagai
 * trade-off (spec §5.2) — mitigasinya retensi log eksekusi n8n yang
 * diperketat (spec §7.1), bukan menghindari payload ini sama sekali.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/utils/__tests__/terbit-peristiwa.test.ts -v`
Expected: PASS

- [ ] **Step 5: Run the full existing otomasi-n8n test suite to confirm no regression**

Run: `cd apps/api && npx vitest run src/lib/__tests__/otomasi-n8n.test.ts -v`
Expected: PASS (unchanged — `jalankanAlur()` itself wasn't modified)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/utils/terbit-peristiwa.ts apps/api/src/utils/__tests__/terbit-peristiwa.test.ts
git commit -m "feat(otomasi): terbitkanPeristiwa menyertakan kredensial WA di payload n8n

muatanWaPeristiwa() baca WA_BASE_URL/WA_API_KEY/WA_INSTANCE/
WA_NOMOR_NOTIFIKASI tenant sebelum memanggil jalankanAlur() — n8n
tak lagi butuh kredensial dipatok ke node saat build. Prasyarat
redesain node 'Kirim WhatsApp' (task berikutnya)."
```

---

### Task 3: Redesign n8n "Kirim WhatsApp" node to read from payload, add tenant_id tag

**Files:**
- Modify: `scripts/n8n/bangun-alur.mjs` (function `simpulPeristiwa`, currently lines 349-~430)

**Interfaces:**
- Consumes: The `wa` object shape produced by `muatanWaPeristiwa()` (Task 2): `{ url, apiKey, instance, nomorTujuan }`, plus `companyId` — both top-level keys of the webhook payload body as sent by `jalankanAlur()`.
- Produces: An n8n workflow JSON (via n8n's REST API, `PUT`/`POST /api/v1/workflows`) with a node reading `$json.wa.*` and `$json.companyId` instead of `cfg.waUrl` etc. No other module consumes this output directly — it's applied live to the running n8n instance via the script.

- [ ] **Step 1: Read the current `simpulPeristiwa` function in full**

Read `scripts/n8n/bangun-alur.mjs` lines 349-430 (the exact end line may have shifted after Task 1/2 — search for `function simpulPeristiwa`).

- [ ] **Step 2: Modify the node body for "Kirim WhatsApp" and "Susun pesan"**

Replace the `Susun pesan` node's `jsCode` and the `Kirim WhatsApp` node's `jsonBody`/headers so they read from `$json` (the webhook payload) instead of `cfg.*`. The exact replacement (adapt to match surrounding node structure found in Step 1):

```js
function simpulPeristiwa(resep, cfg) {
  return [
    {
      parameters: {
        httpMethod: 'POST',
        path: resep.kode,
        responseMode: 'onReceived',
        options: {},
      },
      id: 'pemicu',
      name: 'Pemicu peristiwa',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: [0, 0],
      webhookId: resep.kode,
    },
    {
      parameters: {
        jsCode: `
const d = $input.first().json;
// Tag tenant_id eksplisit untuk audit lintas eksekusi (spec §5.1/§3.4.2).
const tenantId = d.companyId || 'tak-diketahui';
const teks = '*${resep.judul}*\\n\\n' + (d.pesan || '(tanpa pesan)') +
  '\\n\\n_Puraloka Suite · ${resep.kode} · tenant:' + tenantId + '_';
return [{ json: { teks, wa: d.wa || {}, companyId: tenantId } }];
`.trim(),
      },
      id: 'susun',
      name: 'Susun pesan',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [220, 0],
    },
    {
      parameters: {
        method: 'POST',
        // BUKAN dipatok — $json.wa.* datang dari payload webhook,
        // dibaca aplikasi lewat ambilKredensialTanpaRequest() per tenant
        // (lihat terbit-peristiwa.ts, muatanWaPeristiwa()).
        url: '={{ $json.wa.url }}/message/sendText/{{ $json.wa.instance }}',
        sendHeaders: true,
        headerParameters: {
          parameters: [{ name: 'apikey', value: '={{ $json.wa.apiKey }}' }],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ number: $json.wa.nomorTujuan, text: $json.teks }) }}',
        options: { timeout: 30000 },
      },
      id: 'kirim',
      name: 'Kirim WhatsApp',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [440, 0],
    },
  ]
}
```

Note: the `cfg` parameter to `simpulPeristiwa` is now unused inside the function body (it was only used to bake in credentials). Keep the parameter in the function signature for now (removing it means also updating every call site) — flag with a one-line comment `// cfg tak lagi dipakai di sini — dipertahankan agar tanda tangan tetap sama dengan simpul()` rather than silently leaving dead code unexplained.

- [ ] **Step 3: Manually verify the generated JSON is well-formed**

Run: `node scripts/n8n/bangun-alur.mjs --daftar`
Expected: Lists all 13 recipes (5 peristiwa + 8 jadwal, jadwal removed in Task 5) without throwing — this only reads, doesn't write, confirming the script still parses and the recipe list loads.

- [ ] **Step 4: Commit (workflow not yet pushed to n8n — that's Task 4)**

```bash
git add scripts/n8n/bangun-alur.mjs
git commit -m "feat(n8n): node Kirim WhatsApp baca kredensial dari payload, bukan dipatok

simpulPeristiwa() tak lagi menyisipkan cfg.waUrl/waApiKey/waInstance/
nomorTujuan ke JSON node saat build — semua dibaca \$json.wa.* dari
payload webhook saat eksekusi. Tag tenant_id ditambahkan ke teks
pesan untuk ketertelusuran audit (spec §3.4.2). Belum di-deploy ke
n8n — jalankan scripts/n8n/bangun-alur.mjs terpisah, di luar CI."
```

---

### Task 4: Deploy updated workflows to the live n8n instance, verify end-to-end

> ⚠ This task performs a **live write to the running n8n instance** (`:5680`). Per CLAUDE.md's risk-communication norm, this is a moderately consequential action (affects production automation for the one live tenant, Puraloka) — proceed, but do not run this unattended without first confirming n8n is reachable and the API key is valid (Step 1 below does exactly that, non-destructively, before Step 2 writes anything).

**Files:**
- No new files. Runs `scripts/n8n/bangun-alur.mjs` (from Task 3) against the live n8n instance.

**Interfaces:**
- Consumes: `N8N_KEY`, `PURALOKA_API_KEY`, `WA_KEY`, `WA_TUJUAN` env vars (per the script's existing `process.exit(2)` guard at line ~481-487) — these are build-time-only inputs now, used only to populate the OLD 8 jadwal recipes which are about to be deleted in Task 5. For the 5 peristiwa recipes being updated in this task, these env vars are no longer read by node bodies (Task 3 removed that), but the script still requires them present to run at all until Task 5 removes the jadwal recipes.

- [ ] **Step 1: Confirm n8n is reachable and the API key still works, read-only**

Run: `node scripts/n8n/bangun-alur.mjs --daftar`
Expected: Prints `n8n: <N> workflow terpasang · resep: 13 (8 jadwal + 5 peristiwa)` — confirms live connectivity before any write.

- [ ] **Step 2: Push the updated workflows**

Run: `node scripts/n8n/bangun-alur.mjs`
Expected: For the 5 `RESEP_PERISTIWA` entries, output line `diperbarui: Puraloka — <Nama> → n8n_id=<id>` (existing workflow updated in place, matched by name — see the script's own idempotency comment at its header). The 8 jadwal recipes are also rebuilt at this point (Task 5 hasn't removed them yet) — this is expected and harmless, they remain inactive as before.

- [ ] **Step 3: Manually verify one workflow's node JSON in the n8n UI**

Open `http://localhost:5680` (or whatever `N8N_BASE_URL` resolves to), find workflow "Puraloka — Kasbon Diajukan", open the "Kirim WhatsApp" node, confirm its `url`/`jsonBody` fields show `{{ $json.wa.url }}` etc. — NOT a literal Evolution URL or API key string. This is a manual visual check; there is no automated test for n8n's internal workflow storage from this repo.

- [ ] **Step 4: End-to-end test — trigger a real event and confirm it reaches WhatsApp correctly**

This cannot be scripted safely (it sends a real WhatsApp message) — run manually:
1. In the app, trigger a `kasbon_submitted` event through the normal UI flow (submit a kasbon as a test user) OR use the "Alur Otomasi" UI page's manual trigger for `teruskan-kasbon-diajukan` (per `otomasi-alur.ts`'s `POST` manual-trigger endpoint, gated by `otomasi:alur:jalankan` permission).
2. Confirm a WhatsApp message arrives at the number configured in `WA_NOMOR_NOTIFIKASI` for that tenant (Task 1's new credential — must be filled in via the Kredensial UI page first, since this is a brand-new field with no default).
3. Query `otomasi_jalan` for the triggering `alur_id`, confirm `status = 'sukses'` and `n8n_jalan_id` is populated.

- [ ] **Step 5: Negative test — confirm failure is visible, not silent**

Temporarily set an intentionally wrong value for `WA_API_KEY` via the Kredensial UI for the test tenant, repeat step 4.1, confirm:
- The WhatsApp message does NOT arrive (expected — bad key).
- `otomasi_jalan` shows `status = 'gagal'` with a readable `pesan` (not empty, not "undefined").
- Restore the correct `WA_API_KEY` afterward.

- [ ] **Step 6: No commit for this task** (no file changes — this task is a deployment + manual verification checkpoint). Record the verification results in `docs/execution/JOURNAL.md` per CLAUDE.md §8a.4:

```bash
# Append an entry to docs/execution/JOURNAL.md following its existing format —
# read the last 5 entries first to match style/heading convention exactly.
```

---

### Task 5: Retire the 8 dead legacy "jadwal" n8n recipes

**Files:**
- Modify: `scripts/n8n/bangun-alur.mjs` (remove `RESEP` array contents, lines ~62-166, and the `simpul()` function that only `RESEP` used, lines ~179-295 — keep `simpulPeristiwa()` from Task 3)
- Modify: `apps/api/src/routes/v1/otomasi-umpan.ts` (shrink or empty `JENIS_TERSEDIA`, lines 74-91, and correspondingly the `bangunUmpan()` switch cases that become unreachable, lines 152-483 minus the `default` case)
- Test: `apps/api/src/routes/v1/__tests__/otomasi-umpan.test.ts` (existing — update/remove test cases for retired `jenis` values)

**Interfaces:**
- Consumes: The measured production data from spec §5.5 (6/8 recipes zero lifetime executions, 2/8 exactly one execution each, both over a week old as of 2026-08-22) — this is the evidence basis for proceeding without founder sign-off, already gathered, do not re-ask.
- Produces: `otomasi-umpan.ts` still exports the same route (`GET /api/v1/otomasi/umpan/:jenis`) with the same `requireApiKey('otomasi:umpan:baca')` gate — only the *set of valid `jenis` values* shrinks, so no caller signature changes.

- [ ] **Step 1: Deactivate (do not delete) the 8 workflows in n8n first**

In the n8n UI (`http://localhost:5680`), toggle Active → off for each of these 8 workflows (exact names, grepped from `bangun-alur.mjs`'s `RESEP` array):

```
Puraloka — Eskalasi Invoice Terlambat
Puraloka — Persetujuan Tertahan
Puraloka — NCR Belum Ditutup
Puraloka — Milestone Terlambat
Puraloka — Ringkasan Harian Pemilik
Puraloka — Invoice Mendekati Jatuh Tempo
Puraloka — Milestone Mendekat
Puraloka — Rekap Mingguan Proyek
```

Most are already inactive per the built-them-nonaktif convention documented in the script's own header comment — verify each one's current state rather than assuming. Do not delete the workflows yet — deletion happens only after Step 10's confirmation window.

- [ ] **Step 2: Read the full existing test file — this is a rewrite, not an addition**

Read `apps/api/src/routes/v1/__tests__/otomasi-umpan.test.ts` in full (255 lines). **Important finding from planning**: this file's auth/gating tests (`'tanpa header X-API-Key ditolak 401'`, `'kunci karangan ditolak 401'`, `'kunci yang DICABUT ditolak...'`) all call `panggil('ringkasan-harian', ...)` as their "any valid jenis" fixture — they don't test business logic, they test the auth gate, and they happen to need SOME valid `jenis` string to do it. Once `JENIS_TERSEDIA` is emptied, `'ringkasan-harian'` stops being valid and these tests break for the WRONG reason (their assertions are about auth, not about `ringkasan-harian` specifically).

**Verified exact mapping** (grepped directly, not inferred): all 8 `RESEP` recipes' `umpan:` field values match all 8 `JENIS_TERSEDIA` entries 1:1, and no other code references any of these 8 strings outside this test file (confirmed zero overlap with `otomasi-terjadwal.ts`'s ~62 routes during brainstorming):

```
invoice-terlambat        (recipe: eskalasi-invoice-terlambat)
persetujuan-tertahan     (recipe: ingatkan-persetujuan-tertahan)
ncr-belum-ditutup        (recipe: eskalasi-ncr-belum-ditutup)
milestone-terlambat      (recipe: eskalasi-milestone-terlambat)
ringkasan-harian         (recipe: ringkasan-harian-pemilik)
invoice-jatuh-tempo      (recipe: tagih-invoice-jatuh-tempo)
milestone-mendekat       (recipe: peringatan-milestone-mendekat)
rekap-mingguan-proyek    (recipe: laporan-mingguan-klien)
```

This is ALL of `JENIS_TERSEDIA` — after this task, `JENIS_TERSEDIA` becomes an empty array (`[] as const`) and `bangunUmpan()`'s switch has only the `default: return kosong` case left. The route itself (`GET /api/v1/otomasi/umpan/:jenis`, `requireApiKey('otomasi:umpan:baca')` gate) stays — it becomes dormant infrastructure ready for the next `jenis` someone adds, not a dead route (spec §5.5 step 3 explicitly keeps the route).

- [ ] **Step 3: Rewrite the test file's structure**

Restructure `apps/api/src/routes/v1/__tests__/otomasi-umpan.test.ts` as follows (keep the existing `beforeAll`/`afterAll`/`panggil()` helper — those are infrastructure, not jenis-specific):

1. **The three auth/gating tests** (`'tanpa header X-API-Key ditolak 401'` at line 75, `'kunci karangan ditolak 401'` at line 80, `'kunci yang DICABUT ditolak...'` at line 88) — replace their `panggil('ringkasan-harian', ...)` calls with `panggil('jenis-yang-tak-pernah-ada', ...)`. This is safe: these tests check the response status code for auth failures, which happen BEFORE the `jenis` lookup in the route handler (`requireApiKey` preHandler runs first) — so the `jenis` value passed doesn't need to be valid for these three tests to still prove what they're proving. Verify this ordering by reading `otomasi-umpan.ts`'s handler once more before making this change — the `preHandler: [requireApiKey(...)]` array executes before the handler body's `JENIS_TERSEDIA` check, per Fastify's lifecycle, but confirm rather than assume.

2. **`'jenis karangan ditolak 404 dan MENYEBUT yang tersedia'`** (line 126) — update its assertion: `expect(b.tersedia.length).toBeGreaterThan(0)` becomes `expect(b.tersedia).toEqual([])` (the list of available jenis is now legitimately empty — this test's NAME should also change to reflect that, e.g. `'jenis karangan ditolak 404, daftar tersedia kosong (belum ada umpan aktif)'`).

3. **The `it.each([...5 jenis...])` block** (lines 142-160, "menjawab 200 dengan bentuk yang dibaca n8n") — **delete entirely**. It tests business logic (`bangunUmpan()`'s query correctness) for 5 of the 8 retired jenis. This logic is being removed in Step 4, so there is nothing left to test.

4. **`'umpan berjenjang membawa TINGKAT eskalasi...'`** (line 162) — **delete entirely**. Tests `invoice-terlambat`-specific escalation logic being removed.

5. **`'umpan hanya memuat proyek milik company pemegang kunci'`** (line 182) and **`'kasbon tertahan milik company LAIN tidak pernah ikut terbawa'`** (line 220) — **delete entirely**. Both test tenant-isolation of business logic (`milestone-terlambat`, `persetujuan-tertahan` respectively) being removed. Tenant isolation for the *route itself* (as opposed to the retired business logic inside it) has no remaining surface to test once `JENIS_TERSEDIA` is empty — every request just gets 404 regardless of tenant.

6. **Add one new test** confirming the empty-catalog state explicitly:

```ts
it('katalog jenis kosong sejak resep jadwal lama dipensiunkan (spec 2026-08-22 §5.5)', async () => {
  const r = await panggil('apa-saja', kunciSah)
  expect(r.statusCode).toBe(404)
  const b = JSON.parse(r.body)
  expect(b.tersedia).toEqual([])
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/routes/v1/__tests__/otomasi-umpan.test.ts -v`
Expected: FAIL — `JENIS_TERSEDIA` still has 8 entries in the source, so `tersedia` is not empty yet, and `ringkasan-harian` is still valid (the deleted-but-not-yet-removed business logic tests would also still reference deleted code if Step 3 was applied to the test file before Step 5 touches the source — confirm you're seeing the RIGHT failure, i.e. assertion mismatches, not import/syntax errors from editing the test file only).

- [ ] **Step 5: Remove all 8 `jenis` values and their `bangunUmpan()` cases from the source**

In `apps/api/src/routes/v1/otomasi-umpan.ts`:
1. Replace the `JENIS_TERSEDIA` array (lines 74-91) with `const JENIS_TERSEDIA = [] as const`. Keep the surrounding comment structure but update it to explain the array is intentionally empty pending the next real `umpan` consumer (reference spec §5.5 in the comment).
2. Remove all 8 `case '<jenis>':` blocks in `bangunUmpan()` (lines 152-483), leaving only the `default: return kosong` fallback.

- [ ] **Step 7: Remove `RESEP` and `simpul()` from `bangun-alur.mjs`**

Delete the `RESEP` array (lines ~62-166) and the `simpul()` function (lines ~179-295) from `scripts/n8n/bangun-alur.mjs`. In the `SEMUA` array construction (around line 494), remove the `...RESEP.map(...)` spread, leaving only `...RESEP_PERISTIWA.map((r) => ({ ...r, jenis: 'peristiwa' }))`.

- [ ] **Step 8: Run the guard that greps this file for `kode:` literals — confirm it still passes**

Run: `node apps/api/scripts/audit-peristiwa-punya-alur.mjs`
Expected: `✅ 5 peristiwa menunjuk alur yang ada, resepnya lengkap, kodenya sah sebagai path` (was passing before with 5 peristiwa entries regardless of the 8 jadwal entries also being present — this guard only reads `RESEP_PERISTIWA`-derived `PETA_PERISTIWA` codes against ALL `kode:` literals in the file, so removing the jadwal entries should not break it, but MUST be verified, not assumed).

- [ ] **Step 9: Re-run `--daftar` to confirm the script still runs and now lists only 5 recipes**

Run: `node scripts/n8n/bangun-alur.mjs --daftar`
Expected: `n8n: <N> workflow terpasang · resep: 5 (0 jadwal + 5 peristiwa)`

- [ ] **Step 10: Commit the code changes**

```bash
git add scripts/n8n/bangun-alur.mjs apps/api/src/routes/v1/otomasi-umpan.ts apps/api/src/routes/v1/__tests__/otomasi-umpan.test.ts
git commit -m "chore(otomasi): pensiunkan 8 resep jadwal n8n generasi lama

Diukur produksi (spec §5.5): 6/8 nol eksekusi seumur hidup, 2/8
tepat sekali lebih dari seminggu lalu — bukan pola pemakaian aktif.
Mekanisme ini (cron n8n + Ambil-umpan + X-API-Key dipatok) generasi
lebih tua dari jadwal_tugas/terbitkanPeristiwa yang jadi jalur utama
sejak sebelum spec ini ditulis. RESEP + simpul() dihapus dari
bangun-alur.mjs; JENIS_TERSEDIA di otomasi-umpan.ts dikosongkan
(nol pemakai tersisa), test file ditulis ulang mengikutinya."
```

- [ ] **Step 11: Delete the 8 workflows from n8n (after confirming no regression from Step 1's deactivation)**

Only after confirming (via n8n's execution history, or simply the passage of a few days per your own judgment at execution time — this plan does not mandate a specific wait period since the spec's evidence already shows these are dead) that deactivating them caused no reports of missing notifications, delete the 8 workflows in the n8n UI. This step has no automated verification — it's a manual cleanup action with low risk given the zero/near-zero execution history already measured.

- [ ] **Step 12: Delete the corresponding `otomasi_alur` rows**

```sql
-- Run via psql or Supabase SQL editor, NOT via a throwaway script per
-- CLAUDE.md's guidance on schema-affecting one-off scripts.
DELETE FROM otomasi_alur
 WHERE kode IN (
   'eskalasi-invoice-terlambat', 'ingatkan-persetujuan-tertahan',
   'eskalasi-ncr-belum-ditutup', 'eskalasi-milestone-terlambat',
   'ringkasan-harian-pemilik', 'tagih-invoice-jatuh-tempo',
   'peringatan-milestone-mendekat', 'laporan-mingguan-klien'
 );
-- otomasi_jalan rows cascade-delete automatically (ON DELETE CASCADE,
-- migration 272) — no separate cleanup needed there.
```

No commit for this step (data-only change, not a file change).

---

### Task 6: Update tenant-facing credential copy for the now-shared n8n instance

**Files:**
- Modify: `apps/api/src/lib/kredensial.ts` (the `N8N_BASE_URL`/`N8N_API_KEY` entries, currently around lines 272-286)

**Interfaces:**
- Consumes: Nothing new.
- Produces: Updated `keterangan` text only — no behavior change, no new exports.

- [ ] **Step 1: Read the current N8N credential entries**

Read `apps/api/src/lib/kredensial.ts` lines 243-287 (the full n8n comment block and both entries) to preserve the existing comment's historical context while updating only the `keterangan` fields.

- [ ] **Step 2: Update both `keterangan` strings**

Per spec §7.2 (already decided: update copy, do not hide the fields):

```ts
  {
    kunci: 'N8N_BASE_URL',
    label: 'n8n — alamat server',
    keterangan:
      'Sejak migrasi ke instance shared (2026-08-22), n8n dikelola operator ' +
      'Puraloka — mengisi kotak ini di sini TIDAK berpengaruh untuk tenant ' +
      'selain operator. Dibiarkan tampil untuk keterlihatan konfigurasi, ' +
      'bukan untuk diisi.',
    grup: 'Otomasi (n8n)',
  },
  {
    kunci: 'N8N_API_KEY',
    label: 'n8n — kunci API',
    keterangan:
      'Sejak migrasi ke instance shared (2026-08-22), kunci ini dikelola ' +
      'operator Puraloka — mengisi kotak ini di sini TIDAK berpengaruh untuk ' +
      'tenant selain operator.',
    grup: 'Otomasi (n8n)',
  },
```

- [ ] **Step 3: Run the credentials route test to confirm no regression**

Run: `cd apps/api && npx vitest run src/routes/v1/__tests__/kredensial.test.ts -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/kredensial.ts
git commit -m "docs(kredensial): perbarui keterangan N8N_BASE_URL/N8N_API_KEY untuk instance shared

Kotak tetap tampil (spec §7.2 — bukan cabang UI baru), tapi teksnya
kini jujur: mengisinya tak berpengaruh untuk tenant selain operator
sejak n8n jadi instance shared."
```

---

### Task 7: Configure n8n execution data retention

**Files:**
- Modify: `scripts/jalankan-n8n.cmd`

**Interfaces:**
- Consumes: Nothing (environment variable configuration only).
- Produces: n8n process environment — no code interface, verified by manual observation of n8n's execution list behavior.

- [ ] **Step 1: Read the current script**

Read `scripts/jalankan-n8n.cmd` in full (already read once during brainstorming — 69 lines) to find the correct insertion point among the existing `set` commands.

- [ ] **Step 2: Add the retention environment variables**

Insert after the existing `set "TZ=Asia/Jakarta"` line, before the `if not exist` check:

```cmd
REM  Retensi eksekusi — DIPUTUSKAN spec 2026-08-22 §7.1.
REM
REM  Payload webhook sekarang membawa kredensial WA tenant (lihat
REM  terbit-peristiwa.ts, muatanWaPeristiwa()). Eksekusi SUKSES tak perlu
REM  disimpan sama sekali — otomasi_jalan di sisi Puraloka sudah jadi
REM  jejak UI utama dan TIDAK menyimpan payload rahasia (hanya status/
REM  durasi/pesan galat terpotong 300 karakter). Eksekusi GAGAL tetap
REM  disimpan penuh untuk didebug, tapi dipangkas otomatis lewat prune.
set "EXECUTIONS_DATA_SAVE_ON_SUCCESS=none"
set "EXECUTIONS_DATA_SAVE_ON_ERROR=all"
set "EXECUTIONS_DATA_PRUNE=true"
set "EXECUTIONS_DATA_MAX_AGE=72"
```

- [ ] **Step 3: Manually verify by restarting n8n and checking one execution**

This cannot be automated (requires restarting a long-running local process and inspecting UI state):
1. Stop the currently running n8n process (close the terminal running `jalankan-n8n.cmd`, or find and stop the process).
2. Re-run `scripts\jalankan-n8n.cmd`.
3. Trigger one event (per Task 4 Step 4's method).
4. In the n8n UI, open Executions — confirm the successful execution does NOT show full node data (or shows "data not saved" per n8n's UI convention for `SAVE_ON_SUCCESS=none`).
5. Trigger a deliberate failure (per Task 4 Step 5's method) — confirm the FAILED execution DOES show full data (needed for debugging).
6. Restore the working `WA_API_KEY` afterward if not already done in Task 4.

- [ ] **Step 4: Commit**

```bash
git add scripts/jalankan-n8n.cmd
git commit -m "chore(n8n): retensi eksekusi asimetris — sukses none, gagal all, prune 72 jam

Payload sekarang membawa kredensial WA tenant (lihat task
terbitkanPeristiwa). otomasi_jalan tetap jadi jejak UI utama dan
tak menyimpan rahasia, jadi riwayat n8n bisa dipangkas agresif
tanpa kehilangan observability yang dipakai pengguna. Spec §7.1."
```

---

### Task 8: Run full CI guard suite and vitest suite, confirm zero regressions

**Files:** None modified — verification-only task.

**Interfaces:** N/A.

- [ ] **Step 1: Run the full guard suite**

Run: `cd apps/api && node scripts/jalankan-semua-penjaga.mjs`
Expected: All 167+ guards pass (exact count may have grown since this plan was written — CLAUDE.md explicitly warns against hand-picking a subset "remembered as relevant"; run the full script, not a curated list).

If any guard fails, read its output carefully — do not assume it's unrelated to this plan's changes. In particular, re-check:
- `audit-kredensial-lintas-tenant.mjs` — Task 1 added a new credential key; confirm it's correctly classified as NOT falling back to env (WA group, no `env:` field, matches the pattern this guard checks for messaging-identity credentials).
- `audit-kredensial-punya-tempat.mjs` (if it exists under a similar name — verify via the guard list) — confirms every credential key read in code has a catalog entry and vice versa; Task 1/2 added both a catalog entry and a reader, should be consistent.
- `audit-peristiwa-punya-alur.mjs` — already re-checked in Task 5 Step 7, but re-verify here as part of the full suite in case Task 6's edits to the same file region introduced a stray syntax issue the regex-based guard can't parse.

- [ ] **Step 2: Run the full vitest suite once, sequentially (not parallel with any other session)**

Before running, confirm no other vitest run is active from a peer session — CLAUDE.md's §7 warning about overlapping test runs against the same live Postgres instance producing false failures (documented incident: 5853→5837 passed, 95→111 failed, same code, just two overlapping runs) applies directly here given the 11+ peer sessions observed during planning.

Run: `cd apps/api && npx vitest run`
Expected: Paste the actual summary line (pass/fail/file counts) — do not claim "all green" without pasting real output, per CLAUDE.md §8 (Kejujuran).

- [ ] **Step 3: If anything is red, diagnose before claiming completion**

Do not filter output, do not assume unrelated failures are pre-existing without checking `git log` / re-running the specific failing file in isolation against a clean baseline if in doubt.

- [ ] **Step 4: Update `docs/execution/JOURNAL.md` and `docs/PETA-PRIORITAS-ERP.md` (if it references n8n/otomasi state) with the outcome**

Read the last 5 entries of `JOURNAL.md` first to match its format exactly (CLAUDE.md §8a.4 — docs must not lag behind code in the same commit).

- [ ] **Step 5: Final commit for documentation sync**

```bash
git add docs/execution/JOURNAL.md
git commit -m "docs(journal): catat penyelesaian migrasi n8n shared multi-tenant

Ringkasan hasil test + guard suite, lihat entri untuk detail."
```

---

## Self-Review Notes (completed during plan authoring, not a task to execute)

**Spec coverage check:**
- §5.1 (node redesign) → Task 3. ✅
- §5.2 (`terbitkanPeristiwa()` payload extension, `WA_NOMOR_NOTIFIKASI`) → Tasks 1, 2. ✅
- §5.3 (provisioning tenant baru) → Not a task here — this plan covers the migration of the *existing* 5 workflows for the *existing* single tenant (Puraloka). Provisioning a *second* tenant is correctly out of scope until a second tenant actually exists (YAGNI — the spec's SQL example in §5.3 is a template for that future event, not work to do now). Noted explicitly rather than silently dropped.
- §5.4 (migration steps) → Task 4.
- §5.5 (retire 8 legacy recipes) → Task 5.
- §7.1 (retention policy) → Task 7.
- §7.2 (credential copy) → Task 6.
- §7.3, §8, §9 verification bullets → §9's bullets map to Task 4 Steps 4-5 (health/failure verification) and Task 5's pre-measured evidence (already done during brainstorming, cited not repeated).

**Placeholder scan:** The one placeholder-looking line (Task 2 Step 1's `expect(true).toBe(true)`) is explicitly a scaffolding step immediately superseded by Step 1a in the same task — not a final deliverable, and the plan says so explicitly rather than leaving it ambiguous.

**Type/name consistency check:** `muatanWaPeristiwa()` name and shape used consistently across Task 2 (definition) and referenced in Task 3's node comment and Task 7's script comment. `WA_NOMOR_NOTIFIKASI` string literal consistent across Tasks 1, 2, 3, 5's SQL is unaffected (different table). `otomasi_jalan`/`otomasi_alur` column names used consistently with the schema read during brainstorming (migration 272).

**Note on Task 5's recipe↔jenis mapping:** verified exactly (grepped both `RESEP`'s `umpan:` fields and `otomasi-umpan.ts`'s `JENIS_TERSEDIA` directly during planning) — it is a clean 1:1 bijection across all 8 entries, not 7-vs-8 as an earlier draft of this plan incorrectly stated. `JENIS_TERSEDIA` becomes empty after Task 5, not partially reduced.
