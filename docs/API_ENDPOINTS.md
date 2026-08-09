# API Endpoints — Puraloka Suite

> ## ⚠️ TIDAK LENGKAP — 169 dari 366 rute (diukur 2026-08-01)
>
> **Terakhir disentuh 2026-07-16.** Lebih dari separuh rute yang hidup hari ini
> tidak ada di sini — termasuk seluruh modul CECEP, multi-company, punch list,
> RFI, dan submittal.
>
> Sumber kebenaran rute adalah **kodenya sendiri**: `apps/api/src/routes/v1/*.ts`.
> Daftar ini berguna untuk orientasi awal, bukan untuk memastikan sebuah
> endpoint ada atau tidak.

**Base URL**: `http://localhost:3001`  
**Auth header**: `Authorization: Bearer <token>` (atau via HttpOnly cookie)

---

## Existing Endpoints (sudah berfungsi)

### Health
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/health` | No | - | Health check |

### Auth
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| POST | `/api/v1/auth/login` | No | - | Login, return token |
| POST | `/api/v1/auth/register` | Yes | admin | Daftarkan user baru |
| GET | `/api/v1/auth/me` | Yes | all | Data user yang login |
| POST | `/api/v1/auth/refresh` | No | - | Refresh token via cookie |
| POST | `/api/v1/auth/logout` | Yes | all | Hapus cookie session |

### Users
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/users` | Yes | admin | List semua user (all=true termasuk nonaktif) |
| PATCH | `/api/v1/users/:id` | Yes | admin | Update nama/telepon/role |
| PATCH | `/api/v1/users/:id/toggle-active` | Yes | admin | Aktifkan/nonaktifkan user |

### Projects
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects` | Yes | admin,pm | List proyek (exclude soft-deleted) |
| POST | `/api/v1/projects` | Yes | admin,pm | Buat proyek baru |
| GET | `/api/v1/projects/:id` | Yes | all | Detail proyek + nested data |
| PUT | `/api/v1/projects/:id` | Yes | admin,pm | Update proyek |
| PATCH | `/api/v1/projects/:id/status` | Yes | admin,pm | Update status |
| DELETE | `/api/v1/projects/:id` | Yes | admin | Soft-delete proyek |

### Dashboard
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/dashboard` | Yes | admin,pm | Aggregation data (period filter) |
| GET | `/api/v1/dashboard/fokus` | Yes | — | Hal yang menunggu keputusan + yang sudah lewat tenggat (widget rail) |
| GET | `/api/v1/dashboard/deret` | Yes | — | Deret bulanan 8 bulan untuk sparkline KPI |
| GET | `/api/v1/lapangan/ringkasan` | Yes | `projects:view` | Ikhtisar lapangan LINTAS-PROYEK: KPI, progres harian, milestone, tenaga kerja, punch/NCR/inspeksi |
| GET | `/api/v1/keuangan/ikhtisar` | Yes | `finance:view:all` | Ikhtisar keuangan LINTAS-PROYEK: KPI, tagihan vs pembayaran bulanan, komposisi kasbon, umur piutang, per-proyek, invoice tertunggak. **Tanpa RAB** — lihat catatan di berkasnya |
| GET | `/api/v1/deret/:modul` | Yes | — | Deret bulanan + komposisi untuk grafik halaman ikhtisar. `:modul` = `proyek` \| `kas` \| `procurement` \| `mandor`. Bentuk jawaban IDENTIK apa pun modulnya — satu komponen web melayani keempatnya |
| GET | `/api/v1/gudang/ikhtisar` | Yes | `gudang:view` | Ikhtisar gudang: aset di gudang vs di proyek, kondisi, riwayat pergerakan, nilai buku, **proyek selesai yang materialnya belum ditarik** |

**Period params**: `last_30_days`, `last_3_months`, `last_6_months`, `this_year`, `all_time`

### AI
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/ai/insight` | Yes | — | Penjelasan kesehatan portofolio dari Claude (kartu beranda) |

**Skor tidak datang dari model.** Ia dihitung deterministik dari fakta yang
dibaca endpoint ini sendiri; model hanya menulis dua kalimat (penilaian +
rekomendasi), dan skema jawabannya tak punya field angka sama sekali.

**Selalu 200, tak pernah 500 karena AI.** Kunci kosong / kuota habis / model
menolak / jawaban tak layak → `sumber: "deterministik"` + `wawasan: null` +
`alasan` yang menyebut penyebabnya. Web menampilkan kalimat hitungannya sendiri.

Env: `ANTHROPIC_API_KEY` (opsional), `ANTHROPIC_MODEL` (bawaan
`claude-haiku-4-5` sejak 2026-08-09 — tugasnya cuma dua kalimat dari fakta
yang sudah dihitung, dan Haiku ~5× lebih murah).
Batas laju 20/menit — panggilan berbayar ke pihak ketiga.

**Dipanggil hanya saat DIKLIK**, bukan saat halaman dibuka. Dua komponen
memakainya (kartu Kesehatan + rail Asisten) dan keduanya tampil bersamaan di
beranda; `useEffect` tanpa syarat berarti dua panggilan berbayar tiap kali
beranda dibuka — termasuk saat orang cuma lewat. Diukur sesudah diperbaiki:
**0 panggilan otomatis**, 1 per klik.

### Notifications
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/notifications` | Yes | all | List notifikasi (filter: is_read, priority; max 100) |
| GET | `/api/v1/notifications/count` | Yes | all | Unread count untuk badge |
| PATCH | `/api/v1/notifications/:id/read` | Yes | all | Tandai satu notif dibaca |
| PATCH | `/api/v1/notifications/read-all` | Yes | all | Tandai semua dibaca |
| DELETE | `/api/v1/notifications/:id` | Yes | all | Hapus notif (ownership enforced) |
| POST | `/api/v1/notifications/:id/action` | Yes | admin,pm | Approve/reject kasbon atau wage report |
| GET | `/api/v1/notifications/check-milestones` | Yes | admin | Polling milestone approaching/overdue |
| POST | `/api/v1/notifications/subscribe` | Yes | all | Simpan push_subscription untuk Web Push |
| DELETE | `/api/v1/notifications/subscribe` | Yes | all | Hapus push_subscription |

### Finance
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/finance/kasbons` | Yes | admin,pm | List kasbon lintas proyek (max 200) |
| GET | `/api/v1/finance/kasbon-summary` | Yes | admin,pm | Summary kasbon per mandor |
| GET | `/api/v1/finance/invoices` | Yes | admin,pm | List invoice (max 200) |
| POST | `/api/v1/finance/invoices` | Yes | admin,pm | Buat invoice baru |
| POST | `/api/v1/finance/invoice/:id/pay` | Yes | admin,pm | Catat pembayaran |

### Cash Management
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/cash/accounts` | Yes | admin,pm | List akun kas |
| POST | `/api/v1/cash/accounts` | Yes | admin | Buat akun kas baru |
| PATCH | `/api/v1/cash/accounts/:id` | Yes | admin | Edit akun kas |
| GET | `/api/v1/cash/transfers` | Yes | admin,pm | List transfer dana (max 200) |
| POST | `/api/v1/cash/transfers` | Yes | admin,pm | Catat transfer baru |
| PATCH | `/api/v1/cash/transfers/:id/confirm` | Yes | admin | Konfirmasi transfer |
| GET | `/api/v1/cash/expenses` | Yes | admin,pm | List pengeluaran proyek (max 200) |
| POST | `/api/v1/cash/expenses` | Yes | admin,pm | Catat pengeluaran (multipart + nota upload) |
| PATCH | `/api/v1/cash/expenses/:id/status` | Yes | admin | Approve/reject pengeluaran |
| DELETE | `/api/v1/cash/expenses/:id` | Yes | admin | Hapus pengeluaran (draft/submitted only) |
| GET | `/api/v1/cash/summary` | Yes | admin,pm | Ringkasan saldo semua kas |
| GET | `/api/v1/cash/categories` | Yes | admin,pm | Kategori pengeluaran (auto-clone template) |

### Mandor
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/mandor/summary` | Yes | admin,pm | Ringkasan mandor & kasbon |
| GET | `/api/v1/mandor/assignments` | Yes | admin,pm | List semua assignment |
| POST | `/api/v1/mandor/assignments` | Yes | admin,pm | Assign mandor ke proyek |
| GET | `/api/v1/mandor/work-scopes/:id` | Yes | admin,pm,mandor | Detail scope + items |
| POST | `/api/v1/mandor/work-scopes` | Yes | admin,pm | Buat scope pekerjaan baru |
| POST | `/api/v1/mandor/work-scopes/:id/items` | Yes | admin,pm | Tambah item rincian |
| PATCH | `/api/v1/mandor/scope-items/:id` | Yes | admin,pm | Update item |
| DELETE | `/api/v1/mandor/scope-items/:id` | Yes | admin,pm | Hapus item |
| PATCH | `/api/v1/mandor/scope-items/:id/progress` | Yes | admin,pm,mandor | Update volume_done |
| GET | `/api/v1/mandor/list` | Yes | admin,pm | Daftar mandor untuk dropdown |
| GET | `/api/v1/mandor/wage-reports` | Yes | admin,pm,mandor | List laporan upah mingguan |
| POST | `/api/v1/mandor/wage-reports` | Yes | mandor | Buat laporan upah |
| GET | `/api/v1/kasbons` | Yes | admin,pm,mandor | List kasbon (mandor: project-based filter; admin/pm: semua) |
| POST | `/api/v1/kasbons` | Yes | mandor | Ajukan kasbon — project_id ATAU work_scope_id wajib |
| PATCH | `/api/v1/kasbons/:id/status` | Yes | admin,pm | Approve/reject kasbon (PM isolation via kasbons.project_id) |
| GET | `/api/v1/mandor/rekapitulasi` | Yes | admin,pm,mandor | Earned/paid/outstanding/kasbon_beredar/sisa_bersih per mandor |

### Progress Logs
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects/:id/progress-logs` | Yes | all | List progress logs (paginated) |
| POST | `/api/v1/projects/:id/progress-logs` | Yes | admin,pm,mandor | Buat progress log + foto |
| DELETE | `/api/v1/projects/:id/progress-logs/:logId` | Yes | admin,pm | Hapus log |

### Milestones
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects/:id/milestones` | Yes | all | List milestones |
| POST | `/api/v1/projects/:id/milestones` | Yes | admin,pm | Tambah milestone |
| PATCH | `/api/v1/projects/:id/milestones/:milestoneId` | Yes | admin,pm | Update milestone |
| DELETE | `/api/v1/projects/:id/milestones/:milestoneId` | Yes | admin,pm | Hapus milestone |

### RAB & Progress (Phase 1 ERP Upgrade)
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects/:id/rab` | Yes | all | RAB tree + komponen_set per item |
| PUT | `/api/v1/projects/:id/rab` | Yes | admin,pm | Upload RAB (XLSX, 2MB) |
| GET | `/api/v1/projects/:id/rab/categories` | Yes | admin,pm | Sub-kategori RAB untuk dropdown mandor scope |
| GET | `/api/v1/projects/:id/rab/items` | Yes | admin,pm,mandor | Item-level RAB untuk dropdown progress detail |
| GET | `/api/v1/projects/:id/rab/gantt` | Yes | admin,pm | Semua items + gantt fields + actual_start/end |
| PATCH | `/api/v1/projects/:id/rab/:itemId` | Yes | admin,pm | Update komponen biaya (material/upah/alat/other pct) atau progress_pct |
| PATCH | `/api/v1/projects/:id/rab/bulk-komponen` | Yes | admin,pm | Bulk update komponen biaya beberapa items |
| PATCH | `/api/v1/projects/:id/rab/:itemId/gantt` | Yes | admin,pm | Update planned_start, planned_end, gantt_dep_rules |

### Kurva S
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects/:id/kurva-s` | Yes | all | 3 garis + meta.evm (BAC, AC, EV, PV, CPI, SPI, EAC, ETC, VAC, TCPI, SV, CV) |
| POST | `/api/v1/projects/:id/kurva-s` | Yes | admin,pm | Set data points S-curve rencana |

### Documents & Photos
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects/:id/documents` | Yes | all | List dokumen (role-based filter) |
| POST | `/api/v1/projects/:id/documents` | Yes | admin,pm | Upload dokumen (5MB, multipart) |
| PATCH | `/api/v1/projects/:id/documents/:docId` | Yes | admin,pm | Update is_visible_to_client |
| DELETE | `/api/v1/projects/:id/documents/:docId` | Yes | admin,pm | Hapus dokumen |
| POST | `/api/v1/documents/:id/access-log` | Yes | all | Catat view/download (fire-and-forget) |
| GET | `/api/v1/projects/:id/photos` | Yes | all | List foto (filter: category) |
| PATCH | `/api/v1/projects/:id/photos/:photoId` | Yes | admin,pm | Update category/caption |

### Change Orders (Phase 3)
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects/:projectId/change-orders` | Yes | admin,pm | List CO per proyek (filter: ?status=) |
| POST | `/api/v1/projects/:projectId/change-orders` | Yes | admin,pm | Buat CO baru (draft) |
| GET | `/api/v1/change-orders/:id` | Yes | admin,pm | Detail CO + items |
| PUT | `/api/v1/change-orders/:id` | Yes | admin,pm | Update CO (hanya draft) |
| DELETE | `/api/v1/change-orders/:id` | Yes | admin,pm | Hapus CO (hanya draft) |
| POST | `/api/v1/change-orders/:id/items` | Yes | admin,pm | Tambah item ke CO |
| PUT | `/api/v1/change-orders/:id/items/:itemId` | Yes | admin,pm | Update item |
| DELETE | `/api/v1/change-orders/:id/items/:itemId` | Yes | admin,pm | Hapus item |
| PATCH | `/api/v1/change-orders/:id/submit` | Yes | admin,pm | Submit CO untuk approval |
| PATCH | `/api/v1/change-orders/:id/approve` | Yes | admin | Approve CO → update contract_value + audit_log + notif |
| PATCH | `/api/v1/change-orders/:id/reject` | Yes | admin | Reject CO + notif |

### Contracts, Reports, Termin
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/projects/:id/contracts/generate` | Yes | admin,pm | Generate kontrak PDF |
| GET | `/api/v1/reports/project/:id` | Yes | admin,pm | Laporan per proyek |
| GET | `/api/v1/reports/mandor` | Yes | admin,pm | Laporan mandor |
| GET | `/api/v1/reports/finance` | Yes | admin,pm | Laporan keuangan |
| GET | `/api/v1/reports/export` | Yes | admin,pm | Export Excel |
| GET | `/api/v1/reports/export-pdf` | Yes | admin,pm | Export PDF (laporan proyek/mandor/keuangan via PDFKit) |
| PATCH | `/api/v1/projects/:id/termin/:terminId/pay` | Yes | admin,pm | Bayar termin + upload bukti |

### Clients
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/clients` | Yes | admin,pm | List klien (filter: is_active) |
| POST | `/api/v1/clients` | Yes | admin | Tambah klien baru |
| PATCH | `/api/v1/clients/:id` | Yes | admin | Update data klien |
| PATCH | `/api/v1/clients/:id/toggle-active` | Yes | admin | Aktifkan/nonaktifkan klien |

---

## E-Procurement / Pengadaan Endpoints (Phase 2 — Done)

### Materials
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/procurement/materials` | Yes | all | List material catalog |
| POST | `/api/v1/procurement/materials` | Yes | admin,pm | Tambah material baru |
| PATCH | `/api/v1/procurement/materials/:id` | Yes | admin,pm | Update material |
| GET | `/api/v1/procurement/material-categories` | Yes | all | List kategori material |
| POST | `/api/v1/procurement/material-categories` | Yes | admin | Tambah kategori |

### Project Stocks
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/procurement/stocks` | Yes | admin,pm | Stok material semua proyek (filter: project_id) |
| GET | `/api/v1/procurement/stocks/:project_id/movements` | Yes | admin,pm,mandor | Histori mutasi stok per proyek (limit param, default 200) |
| POST | `/api/v1/procurement/stocks/usage` | Yes | admin,pm,mandor | Catat pemakaian/return/adjustment stok; validasi tidak negatif |
| POST | `/api/v1/procurement/stocks/opname` | Yes | admin,pm | Opname bulk: bandingkan fisik vs sistem, insert adjustment jika selisih ≠ 0 |

**Body POST /stocks/usage**: `{ project_id, material_id, qty, movement_type: 'usage'|'return'|'adjustment', notes? }`  
**Body POST /stocks/opname**: `{ project_id, notes?, items: [{ material_id, qty_actual }] }`  
**Response /stocks/opname**: `{ opname_by, project_id, total_items_checked, items_with_adjustment, items_unchanged }`

### Suppliers
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/procurement/suppliers` | Yes | admin,pm | List supplier |
| POST | `/api/v1/procurement/suppliers` | Yes | admin,pm | Tambah supplier |
| PATCH | `/api/v1/procurement/suppliers/:id` | Yes | admin,pm | Update supplier |

### Material Requests (MR)
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/procurement/material-requests` | Yes | admin,pm,mandor | List MR (filter: project_id, status) |
| POST | `/api/v1/procurement/material-requests` | Yes | admin,pm,mandor | Buat MR baru |
| GET | `/api/v1/procurement/material-requests/:id` | Yes | admin,pm,mandor | Detail MR + items |
| PATCH | `/api/v1/procurement/material-requests/:id/submit` | Yes | admin,pm,mandor | Submit MR |
| PATCH | `/api/v1/procurement/material-requests/:id/approve` | Yes | admin,pm | Approve MR |
| PATCH | `/api/v1/procurement/material-requests/:id/reject` | Yes | admin,pm | Reject MR |

### Purchase Orders (PO)
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/procurement/purchase-orders` | Yes | admin,pm | List PO |
| POST | `/api/v1/procurement/purchase-orders` | Yes | admin,pm | Buat PO baru |
| GET | `/api/v1/procurement/purchase-orders/:id` | Yes | admin,pm | Detail PO + items |
| PATCH | `/api/v1/procurement/purchase-orders/:id/confirm` | Yes | admin | Confirm PO |
| PATCH | `/api/v1/procurement/purchase-orders/:id/send` | Yes | admin,pm | Kirim PO (WA deep-link) |

### Goods Receipts (GR)
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/procurement/goods-receipts` | Yes | admin,pm | List GR |
| POST | `/api/v1/procurement/goods-receipts` | Yes | admin,pm,mandor | Buat GR baru (confirm terima barang) |
| PATCH | `/api/v1/procurement/goods-receipts/:id/confirm` | Yes | admin,pm | Konfirmasi GR → trigger chain update stok |

### Supplier Invoices & Payments
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/procurement/supplier-invoices` | Yes | admin,pm | List supplier invoice |
| POST | `/api/v1/procurement/supplier-invoices` | Yes | admin,pm | Catat bon/invoice supplier |
| GET | `/api/v1/procurement/supplier-invoices/overdue` | Yes | admin,pm | Bon jatuh tempo / overdue |
| POST | `/api/v1/procurement/supplier-payments` | Yes | admin | Catat pembayaran hutang; optional `cash_account_id` → DB trigger deduct saldo |
| GET | `/api/v1/procurement/supplier-payments` | Yes | admin,pm | List pembayaran (filter: cash_account_id, supplier_id) |

**Body POST /supplier-payments**: `{ supplier_invoice_id, amount, payment_date, payment_method, reference_number?, notes?, cash_account_id? }`  
Jika `cash_account_id` diisi: validasi saldo ≥ amount sebelum INSERT; DB trigger otomatis kurangi saldo kas.

---

## Planned Endpoints — Phase 5 (SCM Enhancement + Governance)

### RAB Material Tracking (Modul 9a)
| Method | Path | Auth | Role | Description | Body |
|--------|------|------|------|-------------|------|
| GET | `/api/v1/projects/:id/rab-materials` | Yes | admin,pm | List material RAB + sisa kuota | - |
| POST | `/api/v1/projects/:id/rab-materials` | Yes | admin,pm | Input volume RAB per material | `{ material_id, rab_quantity, rab_unit_cost, notes? }` |
| PATCH | `/api/v1/projects/:id/rab-materials/:materialId` | Yes | admin | Update kuota RAB + audit log override | `{ rab_quantity, override_reason }` |
| GET | `/api/v1/material-requests/quota-check` | Yes | admin,pm,mandor | Cek sisa kuota sebelum submit MR | `?project_id=&material_id=&quantity=` |

**Validasi WAJIB di POST /api/v1/material-requests (saat Modul 9a aktif)**:
```typescript
// Sebelum INSERT, loop semua items:
for (const item of mrItems) {
  const quota = await db.from('project_rab_materials')
    .select('rab_quantity, requested_quantity')
    .eq('project_id', projectId).eq('material_id', item.materialId).single()

  const remaining = quota.rab_quantity - quota.requested_quantity
  if (item.qty_requested > remaining) {
    throw { status: 422, error: `Material ${item.name}: kuota RAB tersisa ${remaining} ${item.unit}` }
  }
}
// Setelah INSERT MR, update requested_quantity += item.qty_requested
```

### PO Delivery (Modul 9b)
| Method | Path | Auth | Role | Description | Body |
|--------|------|------|------|-------------|------|
| POST | `/api/v1/purchase-orders/:id/send-whatsapp` | Yes | admin,pm | Generate WA deep-link + log pengiriman | - |
| POST | `/api/v1/purchase-orders/:id/send-email` | Yes | admin,pm | Kirim email PO via Resend + attach PDF | `{ recipient_email? }` |
| GET | `/api/v1/po/public/:token` | No | - | View PO tanpa auth (untuk supplier) | - |

### Field Opname (Modul 11a)
| Method | Path | Auth | Role | Description | Body |
|--------|------|------|------|-------------|------|
| GET | `/api/v1/mandor/work-scopes/:id/opname-reports` | Yes | admin,pm,mandor | List BA opname per scope | - |
| POST | `/api/v1/mandor/work-scopes/:id/opname-reports` | Yes | admin,pm | Submit BA opname fisik | `{ opname_date, measured_volume, unit, completion_pct, photo_urls?, notes? }` |
| PATCH | `/api/v1/mandor/opname-reports/:id/verify` | Yes | admin,pm | Verifikasi BA opname | `{ notes? }` |
| PATCH | `/api/v1/mandor/opname-reports/:id/dispute` | Yes | admin,pm | Tandai BA disputed | `{ dispute_reason }` |

### Digital Contract Signing (Modul 11b)
| Method | Path | Auth | Role | Description | Body |
|--------|------|------|------|-------------|------|
| POST | `/api/v1/mandor/work-scopes/:id/sign` | Yes | admin,pm,mandor | Upload gambar TTD + update status | `{ signer_role: 'mandor'|'pm', signature_data_url }` (base64 PNG) |
| GET | `/api/v1/mandor/work-scopes/:id/contract` | Yes | all | Download contract PDF | - |

### Asset Management (Modul 12)
| Method | Path | Auth | Role | Description | Body |
|--------|------|------|------|-------------|------|
| GET | `/api/v1/assets` | Yes | admin,pm | List semua aset (filter: status, category, project_id) | - |
| POST | `/api/v1/assets` | Yes | admin | Tambah aset baru | `{ asset_code, name, category, purchase_price?, ... }` |
| PATCH | `/api/v1/assets/:id` | Yes | admin | Update data aset | partial fields |
| POST | `/api/v1/assets/:id/deploy` | Yes | admin,pm | Deploy aset ke proyek | `{ to_project_id, condition_before?, return_expected_at? }` |
| POST | `/api/v1/assets/:id/return` | Yes | admin,pm | Return aset ke gudang | `{ condition_after?, notes? }` |
| POST | `/api/v1/assets/:id/maintenance` | Yes | admin | Tandai masuk maintenance | `{ notes? }` |
| GET | `/api/v1/assets/:id/movements` | Yes | admin,pm | Histori mutasi aset | - |
| GET | `/api/v1/assets/:id/depreciation` | Yes | admin | Log amortisasi bulanan | - |

### Audit Log (Modul 13b)
| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| GET | `/api/v1/admin/audit-logs` | Yes | admin | List audit logs (filter: user_id, table_name, severity, from, to; max 500) |
| GET | `/api/v1/admin/audit-logs/critical` | Yes | admin | Hanya severity = critical |
| GET | `/api/v1/admin/audit-logs/export` | Yes | admin | Export CSV audit log |

### General Ledger (Modul 10 — Fase 7)
| Method | Path | Auth | Role | Description | Body |
|--------|------|------|------|-------------|------|
| GET | `/api/v1/accounting/accounts` | Yes | admin | List Chart of Accounts | - |
| POST | `/api/v1/accounting/accounts` | Yes | admin | Tambah akun CoA | `{ code, name, account_type, normal_balance, parent_id? }` |
| GET | `/api/v1/accounting/journal-entries` | Yes | admin | List jurnal entries (paginated) | - |
| POST | `/api/v1/accounting/journal-entries` | Yes | admin | Buat jurnal manual | `{ entry_date, description, lines: [{ account_id, debit?, credit?, project_id? }] }` |
| POST | `/api/v1/accounting/journal-entries/:id/reverse` | Yes | admin | Reverse/storno jurnal | `{ reason }` |
| GET | `/api/v1/accounting/trial-balance` | Yes | admin | Trial balance per tanggal | `?date=` |
| GET | `/api/v1/accounting/balance-sheet` | Yes | admin | Neraca per tanggal | `?date=` |
| GET | `/api/v1/accounting/profit-loss` | Yes | admin | Laporan L/R per periode | `?from=&to=&project_id=` |
| GET | `/api/v1/accounting/cash-flow` | Yes | admin | Arus kas per periode | `?from=&to=` |
| GET | `/api/v1/accounting/general-ledger` | Yes | admin | Buku besar per akun | `?account_code=&from=&to=` |

---

## Common Response Schemas

### Success
```json
{ "data": { ... } }
{ "data": [ ... ], "meta": { "total": 50, "page": 1, "limit": 20 } }
{ "success": true }
```

### Error
```json
{ "error": "Pesan error yang jelas" }
```

### Common Error Cases
| Status | When |
|--------|------|
| 400 | Validasi input gagal |
| 401 | Token tidak ada / expired |
| 403 | Role tidak cukup |
| 404 | Resource tidak ditemukan |
| 409 | Conflict (duplikat, constraint violation) |
| 500 | Internal server error |
