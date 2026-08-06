# Task 5 Report — F8-3: coverage sebaran route

Status: DONE_WITH_CONCERNS (guard works, mutation-proven; one CI-realism caveat below)
Commit: `4b7df3b69437ab5e0258a64f32c49e651b9fea98`
Measured floor: `routeNol = 27`

## Note on brief location

The brief was not at `E:\Project\puraloka-suite\.superpowers\sdd\...\task-5-brief.md` as
stated in the task prompt — that path does not exist. The actual file lives at
`E:\Project\puraloka-suite\apps\api\.superpowers\sdd\2026-08-06-sumbu-ui-roadmap\task-5-brief.md`
(nested under `apps/api/`, untracked, presumably written there because the concurrent
session's cwd is `apps/api`). Content matched what the task prompt described, so I
proceeded from that copy.

## Step 1 — measure zero-coverage route files (verbatim command + blocker + fix)

First attempt used the exact command from the brief:

```
npx vitest run --coverage --coverage.include='src/**/*.ts' \
  --coverage.exclude='src/**/*.test.ts' --coverage.exclude='src/**/__tests__/**' \
  --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
  --coverage.thresholds.branches=0 --coverage.thresholds.statements=0 \
  --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage
```

Result: suite ran to completion (304s), 158/159 test files passed, but
`apps/api/coverage/coverage-summary.json` was **never written** — no `coverage/`
directory at all.

Root cause (isolated with a single-file repro): vitest 3.2.7's coverage-v8 provider
skips writing the report on any test failure unless `--coverage.reportOnFailure` is
passed (confirmed via `npx vitest --help --coverage`, default `false`). One
pre-existing test — `src/routes/v1/__tests__/tenancy-ratchet.test.ts` — fails right
now because of the **concurrent session's uncommitted work**
(`rekonsiliasi-material.ts` introduces table `penerimaan_material_klien` used via
the tenancy wrapper but not yet registered in the tenant map). This is unrelated to
F8-3 and out of scope to fix (explicit instruction: leave `rekonsiliasi-material.*`
alone).

Verbatim failing-test output:

```
FAIL src/routes/v1/__tests__/tenancy-ratchet.test.ts > T4f — P3: peta tenancy sinkron dengan skema (ADR-011 §9.5) > SETIAP tabel yang dipakai lewat wrapper ada di peta (gerbang P3 sebenarnya)
Error: Tabel dipakai lewat wrapper TAPI tak ada di peta tenancy:
  'penerimaan_material_klien' (rekonsiliasi-material.ts)

Jalankan: node scripts/gen-tenant-map.mjs emit — lalu commit hasilnya.
Kalau ini tabel BARU: pastikan kategorinya benar dulu (ADR-011 §5). Tabel tanpa kategori = lubang tenancy yang tak terlihat.

 Test Files  1 failed | 158 passed (159)
      Tests  1 failed | 1630 passed | 2 skipped (1633)
   Duration  304.13s
```

Fix: added `--coverage.reportOnFailure` (a real, documented vitest CLI flag — no test
files touched) and re-ran the full suite:

```
npx vitest run --coverage --coverage.include='src/**/*.ts' \
  --coverage.exclude='src/**/*.test.ts' --coverage.exclude='src/**/__tests__/**' \
  --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 \
  --coverage.thresholds.branches=0 --coverage.thresholds.statements=0 \
  --coverage.reportOnFailure \
  --coverage.reporter=json-summary --coverage.reportsDirectory=./coverage
```

Verbatim tail output:

```
Test Files  1 failed | 158 passed (159)
      Tests  1 failed | 1630 passed | 2 skipped (1633)
   Start at  19:33:17
   Duration  328.17s (transform 1.36s, setup 0ms, collect 15.53s, tests 276.86s, ...)
```

`apps/api/coverage/coverage-summary.json` was produced this time (39668 bytes).

**CI-realism caveat**: the existing CI "Test + coverage (shard N/6)" step (ci.yml
line ~581-589) also lacks `--coverage.reportOnFailure`. In practice this doesn't
currently matter for CI because a failing test already fails that shard's step
(non-zero exit), which blocks `needs: api` and the downstream `coverage` job never
runs — so this gap is latent, not actively breaking anything today. I did not modify
the shard step; that's outside this task's file list and would be a scope
expansion. Flagging it here as a concern rather than silently leaving it undocumented.

## Measured zero-coverage route list (routeNol = 27)

```
Route ber-coverage NOL : 27
   absensi.ts
   assets.ts
   audit.ts
   bids.ts
   clients.ts
   contracts.ts
   cost-control.ts
   dashboard.ts
   documents.ts
   inspeksi.ts
   kasbon-purposes.ts
   milestones.ts
   modules.ts
   ncr.ts
   notifications.ts
   punch-list.ts
   rab-schedule.ts
   rab.ts
   rekonsiliasi-material.ts
   rfi.ts
   submittal.ts
   termin-payment.ts
   transfer-stok.ts
   units.ts
   users.ts
   wip.ts
   work-categories.ts
```

Note: this list is **not** the same 27 as the stale `COVERAGE-BASELINE.md` list —
it's a coincidental count match. `companies.ts` (closed by F1-8) is correctly
absent; `rekonsiliasi-material.ts` (new, from the concurrent session, not yet
tested at the route layer) is present instead. Never copy the old list; this one
was measured fresh via `--naikkan`.

## Step 2 — guard script

Written verbatim from the brief to
`apps/api/scripts/audit-route-coverage-nol.mjs` (see brief for full source; header
explains "SEBARAN, bukan kedalaman" rationale, matching `coverage-ratchet.mjs`'s
elaborate-header style).

## Step 3 — floor file

`apps/api/scripts/route-nol-lantai.json`, value measured via `--naikkan` (not
hand-written):

```json
{
  "_catatan": "Jumlah berkas routes/v1/*.ts ber-coverage NOL. Boleh turun, TIDAK boleh naik.",
  "_diukur": "2026-08-06 — diukur ulang; daftar 27 di COVERAGE-BASELINE.md sudah basi (F1-8 menutup companies.ts).",
  "routeNol": 27
}
```

## Step 4 — mutation proof (verbatim)

```
=== mutate: routeNol 27 -> 26 ===
{
  "_catatan": "Jumlah berkas routes/v1/*.ts ber-coverage NOL. Boleh turun, TIDAK boleh naik.",
  "_diukur": "2026-08-06 — diukur ulang; daftar 27 di COVERAGE-BASELINE.md sudah basi (F1-8 menutup companies.ts).",
  "routeNol": 26
}

=== jalankan guard (harus MERAH/exit 1) ===
Route ber-coverage NOL : 27
   ... (same 27 files as above) ...

MERAH: route ber-coverage nol naik 26 -> 27
EXIT=1  (harus 1)

=== restore via --naikkan ===
Route ber-coverage NOL : 27
   ... (same 27 files) ...
Lantai diperbarui: 27

=== jalankan guard (harus HIJAU/exit 0) ===
Route ber-coverage NOL : 27
   ... (same 27 files) ...
EXIT=0  (harus 0)
```

Both exit codes confirmed: red (1) on regression, green (0) after restore. The
guard is not decorative.

## Step 5 — CI wiring

Added to the `coverage` job in `.github/workflows/ci.yml` (job that runs
`needs: api`, after shards are downloaded and merged — same job as
`coverage-ratchet`, immediately after its step, relying on the job's existing
`defaults.run.working-directory: apps/api` rather than repeating it):

```yaml
      - name: Gabungkan coverage lalu jalankan ratchet
        run: |
          node scripts/gabung-coverage.mjs
          node scripts/coverage-ratchet.mjs

      - name: Route ber-coverage NOL (F8-3)
        run: node scripts/audit-route-coverage-nol.mjs
```

## Final floor file contents

`apps/api/scripts/route-nol-lantai.json`:

```json
{
  "_catatan": "Jumlah berkas routes/v1/*.ts ber-coverage NOL. Boleh turun, TIDAK boleh naik.",
  "_diukur": "2026-08-06 — diukur ulang; daftar 27 di COVERAGE-BASELINE.md sudah basi (F1-8 menutup companies.ts).",
  "routeNol": 27
}
```

## Commit

```
4b7df3b feat(ci): F8-3 — jaga SEBARAN coverage, bukan persentase global
 3 files changed, 55 insertions(+)
 create mode 100644 apps/api/scripts/audit-route-coverage-nol.mjs
 create mode 100644 apps/api/scripts/route-nol-lantai.json
```

Staged and committed **only**:
- `.github/workflows/ci.yml`
- `apps/api/scripts/audit-route-coverage-nol.mjs`
- `apps/api/scripts/route-nol-lantai.json`

## Left untouched (concurrent session's in-progress work)

- `apps/api/src/lib/__tests__/rekonsiliasi-material.test.ts` (modified)
- `apps/api/src/lib/rekonsiliasi-material.ts` (modified)
- `apps/api/src/routes/v1/rekonsiliasi-material.ts` (modified)
- `apps/api/scripts/uji-invarian-material-klien.mjs` (untracked)
- `db/migrations/194_material_milik_klien.sql` (untracked)
- `apps/api/.superpowers/` (untracked — contains this task's own brief/progress files)

These are the reason `tenancy-ratchet.test.ts` currently fails on `main`/this
branch's working tree; not touched or worked around beyond the `reportOnFailure`
flag needed purely to get a coverage-summary.json out of a local measurement run.

## Cleanup

Left `apps/api/coverage/` on disk (gitignored — not staged/committed) as evidence
of the measurement; can be deleted, it regenerates on any future coverage run.
