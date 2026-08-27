"use client";

// ============================================================================
// Change Order — Portal Admin/Direktur (Task 10, Tahap 2). Salinan APA
// ADANYA dari `pm-portal/kontrak-lengkap/change-order/page.tsx` (Task 21 PM)
// — TERMASUK gerbang `bolehApprove` dan seluruh logic `billing_mode`/item
// CRUD/`recalcTotalDelta()` sisi klien.
//
// ── Bentuk backend JAUH lebih kaya dari dugaan brief awal — dikoreksi Task 21
//
// Dibaca baris-per-baris ke `apps/api/src/routes/v1/change-orders.ts`
// (1017 baris):
//
//  - TAK ADA field `type`/`value` di level CO. Tiap CO tersusun dari
//    `items` (`change_order_items`) — masing-masing punya `item_type`
//    sendiri, dan `total_amount_delta` DIHITUNG SERVER dari Σ item
//    (`recalcTotalDelta()`). Halaman ini karena itu TIDAK punya form
//    "buat CO lengkap sekali submit" — mengikuti alur backend: buat CO
//    kosong (draft) → tambah item satu-satu → submit.
//  - `billing_mode` WAJIB dipilih sebelum approve bisa jalan (422 tanpanya,
//    `periksaPenyetujuanCo()`) — HANYA `include_termin` yang menaikkan
//    `projects.contract_value`. Dinyatakan eksplisit di form, bukan
//    disembunyikan sebagai istilah teknis.
//  - Approve LEWAT rantai approval berjenjang (`utils/approval.ts`) — bisa
//    minta >1 level. Respons bisa `pending_next_level: true` (bukan galat,
//    bukan sukses penuh) — ditampilkan sebagai info, bukan disamakan
//    dengan "disetujui".
//  - Gerbang: create/edit/hapus/items pakai `projects:edit`, admin DAN
//    direktur PUNYA (live 2026-08-22) — form + item CRUD dirender tanpa
//    gerbang `hasPermission` tambahan.
//
//    ── GERBANG PALING KRITIS Task 10: approve/reject. Rute HANYA
//    `authenticate`, tapi OTORITAS SESUNGGUHNYA hidup di tabel
//    `approval_chains`/`approval_steps` (config), bukan di dekorator rute —
//    persis pola yang membuat Task 19 keliru pertama kali untuk
//    `cecep:estimate:approve` (lihat komentar `rab/[id]/page.tsx`).
//    Diverifikasi LANGSUNG ke DB (live 2026-08-22, bukan ditebak): rantai
//    `change_order` (`approval_chains`) cuma SATU langkah (level 1,
//    `approval_steps.required_permission = 'change_order:approve'`), dan
//    permission itu HANYA di-grant ke role `admin` — role `direktur` NOL
//    baris di `role_permissions`. Artinya `canParticipateInChain()`
//    (`apps/api/src/utils/approval.ts:193-203`) MENOLAK 403 SECARA
//    DETERMINISTIK untuk direktur di setiap CO, sebelum entitasnya bahkan
//    di-fetch. Tombol approve/reject karena itu digerbang
//    `hasPermission("change_order:approve")` + `useSyncExternalStore`, pola
//    PERSIS `rab/[id]/page.tsx:88-97` — TIDAK DIRENDER (bukan disabled)
//    saat direktur tak punya izin, supaya tak ada tombol yang pasti gagal
//    403 kalau diklik. INI SATU-SATUNYA tempat di Tahap 2 di mana direktur
//    (subset permission murni admin di modul lain) benar-benar kehilangan
//    sebuah kemampuan tulis — JANGAN "perbaiki" gerbang ini jadi selalu
//    tampil dengan asumsi "direktur biasanya subset admin".
//
// ⚠️ Beda SATU-SATUNYA lain dari versi PM: `daftarProyek` TIDAK memfilter
// `.filter((p) => p.pm)` — pola sama Task 7/9 (`GET /api/v1/projects`
// company-wide, admin/direktur lihat SEMUA proyek sebagai kandidat picker).
//
// Halaman ini TIDAK dapat entri NAV_ITEMS sendiri — dijangkau lewat tautan
// di badan halaman Register Kontrak (`/admin-portal/kontrak/register`), pola
// sama `/admin-portal/kontrak/asuransi` (Task 8), didaftarkan WAJAR di
// `audit-nav-yatim.mjs`.
// ============================================================================

import { useMemo, useState, useSyncExternalStore } from "react";
import { FileEdit, Plus, Send, CheckCircle2, XCircle } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import { formatRupiah, formatMutasi } from "@/lib/format";
import EmptyState from "@/components/portal/EmptyState";
import KepalaPortal from "@/components/portal/KepalaPortal";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import type { ProyekPM, RespChangeOrder, RespApproveCo, ChangeOrderProyek, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

interface RespProyek {
  projects: ProyekPM[];
}

// `langganan`: dipakai `useSyncExternalStore` supaya perubahan permission
// (login/switch company) tercermin tanpa reload — pola sama dengan
// `pm-portal/cecep/rab/[id]/page.tsx` dan `mandor-lengkap/spk/page.tsx`.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

const LABEL_STATUS: Record<string, string> = {
  draft: "Draf",
  submitted: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral",
  submitted: "pending",
  approved: "approved",
  rejected: "rejected",
};
const LABEL_ITEM_TYPE: Record<string, string> = {
  kerja_tambah: "+ Kerja Tambah",
  kerja_kurang: "− Kerja Kurang",
  perubahan_volume: "~ Perubahan Volume",
  perubahan_spec: "~ Perubahan Spesifikasi",
};
const LABEL_BILLING: Record<string, string> = {
  include_termin: "Termasuk termin (nilai kontrak naik)",
  separate_co: "Tagihan CO tersendiri",
  final_account: "Final account settlement",
};

function fmtDelta(n: number): string {
  return n >= 0 ? formatRupiah(n) : formatMutasi(n);
}

export default function AdminChangeOrderPage() {
  // `change_order:approve` HANYA di-grant ke `admin` (diverifikasi live ke
  // `role_permissions` + `approval_steps` 2026-08-22) — direktur NOL baris.
  // Tombol Setujui/Tolak TIDAK DIRENDER (bukan disabled) saat izin tak ada,
  // pola sama `bolehApprove` di `cecep/rab/[id]/page.tsx`. JANGAN hapus atau
  // lemahkan gerbang ini — ini SATU-SATUNYA pengecualian di Tahap 2 di mana
  // direktur genuinely kehilangan kapabilitas admin.
  const bolehApprove = useSyncExternalStore(
    langganan, () => hasPermission("change_order:approve"), () => false);

  const [proyekId, setProyekId] = useState("");
  const [sheetBaruTerbuka, setSheetBaruTerbuka] = useState(false);
  const [judulBaru, setJudulBaru] = useState("");
  const [deskripsiBaru, setDeskripsiBaru] = useState("");
  const [billingBaru, setBillingBaru] = useState("");
  const [mengirimBaru, setMengirimBaru] = useState(false);
  const [galatBaru, setGalatBaru] = useState<string | null>(null);

  const [coDipilih, setCoDipilih] = useState<ChangeOrderProyek | null>(null);
  const [sheetItemTerbuka, setSheetItemTerbuka] = useState(false);
  const [itemType, setItemType] = useState("kerja_tambah");
  const [itemDeskripsi, setItemDeskripsi] = useState("");
  const [itemDelta, setItemDelta] = useState("");
  const [mengirimItem, setMengirimItem] = useState(false);
  const [galatItem, setGalatItem] = useState<string | null>(null);

  const [sheetTolakTerbuka, setSheetTolakTerbuka] = useState<ChangeOrderProyek | null>(null);
  const [alasanTolak, setAlasanTolak] = useState("");
  const [mengirimTolak, setMengirimTolak] = useState(false);
  const [galatTolak, setGalatTolak] = useState<string | null>(null);

  const [galatHalaman, setGalatHalaman] = useState<string | null>(null);
  const [pendingLevel, setPendingLevel] = useState<string | null>(null);

  const { data: dataProyek } = useData<RespProyek>("/api/v1/projects");
  // Company-wide — TANPA filter kepemilikan PM, beda dari versi PM. Pola
  // sama Task 7/9: admin/direktur lihat SELURUH proyek sebagai kandidat.
  const daftarProyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);
  const proyekAktif = proyekId || daftarProyek[0]?.id || "";

  const url = proyekAktif ? `/api/v1/projects/${proyekAktif}/change-orders` : null;
  const { data, memuat, galat: galatMuat } = useData<RespChangeOrder>(url);
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "Gagal memuat change order.") : null;

  function bukaBaru() {
    setJudulBaru("");
    setDeskripsiBaru("");
    setBillingBaru("");
    setGalatBaru(null);
    setSheetBaruTerbuka(true);
  }

  async function buatCo() {
    if (!proyekAktif || !url) return;
    if (judulBaru.trim().length === 0) {
      setGalatBaru("Judul wajib diisi.");
      return;
    }
    setMengirimBaru(true);
    setGalatBaru(null);
    try {
      await api.post(`/api/v1/projects/${proyekAktif}/change-orders`, {
        title: judulBaru.trim(),
        description: deskripsiBaru.trim() || undefined,
        billing_mode: billingBaru || undefined,
      });
      setSheetBaruTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatBaru(pesanGalat(e as GalatApi, "Gagal membuat change order"));
    } finally {
      setMengirimBaru(false);
    }
  }

  function bukaTambahItem(co: ChangeOrderProyek) {
    setCoDipilih(co);
    setItemType("kerja_tambah");
    setItemDeskripsi("");
    setItemDelta("");
    setGalatItem(null);
    setSheetItemTerbuka(true);
  }

  async function tambahItem() {
    if (!coDipilih || !url) return;
    if (itemDeskripsi.trim().length === 0) {
      setGalatItem("Deskripsi item wajib diisi.");
      return;
    }
    if (!itemDelta || !Number.isFinite(Number(itemDelta))) {
      setGalatItem("Nilai delta biaya wajib angka.");
      return;
    }
    setMengirimItem(true);
    setGalatItem(null);
    try {
      await api.post(`/api/v1/change-orders/${coDipilih.id}/items`, {
        item_type: itemType,
        description: itemDeskripsi.trim(),
        amount_delta: Number(itemDelta),
      });
      setSheetItemTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatItem(pesanGalat(e as GalatApi, "Gagal menambah item"));
    } finally {
      setMengirimItem(false);
    }
  }

  async function submitCo(co: ChangeOrderProyek) {
    if (!url) return;
    setGalatHalaman(null);
    setPendingLevel(null);
    try {
      await api.patch(`/api/v1/change-orders/${co.id}/submit`);
      invalidasi(url);
    } catch (e) {
      setGalatHalaman(pesanGalat(e as GalatApi, "Gagal submit change order"));
    }
  }

  async function approveCo(co: ChangeOrderProyek) {
    if (!url) return;
    setGalatHalaman(null);
    setPendingLevel(null);
    try {
      const { data: resp } = await api.patch<RespApproveCo>(`/api/v1/change-orders/${co.id}/approve`);
      if (resp.pending_next_level) {
        setPendingLevel(resp.message ?? "Persetujuan level ini tercatat, menunggu level berikutnya.");
      }
      invalidasi(url);
    } catch (e) {
      setGalatHalaman(pesanGalat(e as GalatApi, "Gagal menyetujui change order"));
    }
  }

  async function konfirmasiTolak() {
    if (!sheetTolakTerbuka || !url) return;
    setMengirimTolak(true);
    setGalatTolak(null);
    try {
      await api.patch(`/api/v1/change-orders/${sheetTolakTerbuka.id}/reject`, {
        reason: alasanTolak.trim() || undefined,
      });
      setSheetTolakTerbuka(null);
      invalidasi(url);
    } catch (e) {
      setGalatTolak(pesanGalat(e as GalatApi, "Gagal menolak change order"));
    } finally {
      setMengirimTolak(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <KepalaPortal judul="Change Order" />

      {daftarProyek.length > 1 && (
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Proyek</span>
          <select
            value={proyekAktif}
            onChange={(e) => setProyekId(e.target.value)}
            style={{
              minHeight: 44,
              padding: "0 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              fontSize: 14,
              background: "var(--surface)",
              color: "var(--text-primary)",
            }}
          >
            {daftarProyek.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!proyekAktif && <EmptyState icon={FileEdit} judul="Pilih proyek" deskripsi="Change order tercatat per proyek." />}
      {memuat && <SkeletonCard tinggi={140} />}
      {galat && <EmptyState icon={FileEdit} judul="Gagal memuat" deskripsi={galat} />}

      {galatHalaman && (
        <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
          {galatHalaman}
        </div>
      )}
      {pendingLevel && (
        <div role="status" style={{ fontSize: 12, color: "var(--on-info-bg)", padding: 10, borderRadius: 10, background: "var(--info-bg)", border: "1px solid var(--info-border)" }}>
          {pendingLevel}
        </div>
      )}

      {!memuat && !galat && proyekAktif && (data?.data ?? []).length === 0 && (
        <EmptyState icon={FileEdit} judul="Belum ada change order" deskripsi="Perubahan lingkup atau nilai kontrak dicatat di sini." />
      )}

      {(data?.data ?? []).map((co) => {
        const deltaPositif = co.total_amount_delta >= 0;
        return (
          <div
            key={co.id}
            style={{
              padding: "var(--pad-kartu-lega)",
              borderRadius: 16,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{co.co_number}</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{co.title}</div>
              </div>
              <StatusBadge status={VARIAN_STATUS[co.status] ?? "netral"} label={LABEL_STATUS[co.status] ?? co.status} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: deltaPositif ? "var(--text-primary)" : "var(--danger)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtDelta(co.total_amount_delta)}
              </span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{co.items.length} item</span>
            </div>

            {co.billing_mode && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{LABEL_BILLING[co.billing_mode] ?? co.billing_mode}</div>
            )}

            {co.status === "approved" && co.baseline_contract_value !== null && (
              <div style={{ fontSize: 11, color: "var(--text-secondary)", padding: "6px 8px", borderRadius: 8, background: "var(--success-bg)" }}>
                Nilai kontrak: {formatRupiah(co.baseline_contract_value)} → {formatRupiah(co.baseline_contract_value + co.total_amount_delta)}
              </div>
            )}
            {co.status === "rejected" && co.rejected_reason && (
              <div style={{ fontSize: 11, color: "var(--on-danger-bg)", padding: "6px 8px", borderRadius: 8, background: "var(--danger-bg)" }}>
                {co.rejected_reason}
              </div>
            )}

            {co.items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {co.items.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "var(--surface-subtle)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>{LABEL_ITEM_TYPE[it.item_type] ?? it.item_type}</div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{it.description}</div>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: it.amount_delta >= 0 ? "var(--text-primary)" : "var(--danger)",
                        flexShrink: 0,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtDelta(it.amount_delta)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {co.status === "draft" && (
                <>
                  <button
                    type="button"
                    onClick={() => bukaTambahItem(co)}
                    style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-subtle)", color: "var(--text-primary)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={13} aria-hidden="true" /> Tambah Item
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitCo(co)}
                    disabled={co.items.length === 0}
                    style={{
                      minHeight: 36,
                      padding: "0 12px",
                      borderRadius: "var(--portal-radius-pill)",
                      background: co.items.length === 0 ? "var(--surface-subtle)" : "var(--grad-aksen)",
                      color: co.items.length === 0 ? "var(--text-secondary)" : "var(--on-navy)",
                      border: "none",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: co.items.length === 0 ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Send size={13} aria-hidden="true" /> Submit
                  </button>
                </>
              )}
              {/* `change_order:approve` — direktur tak punya (lihat komentar
                  kepala berkas). Reject ikut rantai otoritas yang sama dengan
                  approve (`change-orders.ts` komentar rute reject: "siapa pun
                  yang berhak menyetujui di level mana pun boleh menolak"),
                  jadi KEDUA tombol digerbang izin yang sama — bukan cuma
                  approve. JANGAN hapus/lemahkan gerbang ini. */}
              {co.status === "submitted" && bolehApprove && (
                <>
                  <button
                    type="button"
                    onClick={() => void approveCo(co)}
                    style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--success)", color: "var(--on-navy)", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <CheckCircle2 size={13} aria-hidden="true" /> Setujui
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSheetTolakTerbuka(co); setAlasanTolak(""); setGalatTolak(null); }}
                    style={{ minHeight: 36, padding: "0 12px", borderRadius: "var(--portal-radius-pill)", background: "var(--danger-bg)", color: "var(--on-danger-bg)", border: "1px solid var(--danger-border)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <XCircle size={13} aria-hidden="true" /> Tolak
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {proyekAktif && (
        <button
          type="button"
          onClick={bukaBaru}
          style={{
            minHeight: 48,
            borderRadius: "var(--portal-radius-pill)",
            background: "var(--grad-aksen)",
            color: "var(--on-navy)",
            border: "none",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <Plus size={18} aria-hidden="true" /> CO Baru
        </button>
      )}

      <BottomSheet terbuka={sheetBaruTerbuka} onTutup={() => setSheetBaruTerbuka(false)} judul="Change Order Baru">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Judul</span>
            <input
              value={judulBaru}
              onChange={(e) => setJudulBaru(e.target.value)}
              placeholder="mis. Penambahan struktur lantai 3"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Deskripsi (opsional)</span>
            <textarea
              value={deskripsiBaru}
              onChange={(e) => setDeskripsiBaru(e.target.value)}
              rows={3}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Mode penagihan</span>
            <select
              value={billingBaru}
              onChange={(e) => setBillingBaru(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="">— Belum ditentukan —</option>
              <option value="include_termin">Termasuk termin</option>
              <option value="separate_co">Tagihan CO tersendiri</option>
              <option value="final_account">Final account settlement</option>
            </select>
            <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
              Boleh dikosongkan sekarang, tapi WAJIB dipilih sebelum CO ini bisa disetujui — pilihan ini menentukan apakah nilai kontrak naik.
            </span>
          </label>
          {galatBaru && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatBaru}
            </div>
          )}
          <button
            type="button"
            onClick={buatCo}
            disabled={mengirimBaru}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirimBaru ? "wait" : "pointer" }}
          >
            {mengirimBaru ? "Menyimpan…" : "Buat Change Order"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetItemTerbuka} onTutup={() => setSheetItemTerbuka(false)} judul={`Tambah Item — ${coDipilih?.co_number ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Tipe</span>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
            >
              <option value="kerja_tambah">Kerja Tambah</option>
              <option value="kerja_kurang">Kerja Kurang</option>
              <option value="perubahan_volume">Perubahan Volume</option>
              <option value="perubahan_spec">Perubahan Spesifikasi</option>
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Deskripsi</span>
            <input
              value={itemDeskripsi}
              onChange={(e) => setItemDeskripsi(e.target.value)}
              placeholder="mis. Tambah pondasi pile cap 3x3m"
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Delta biaya (Rp)</span>
            <input
              type="number"
              value={itemDelta}
              onChange={(e) => setItemDelta(e.target.value)}
              placeholder={itemType === "kerja_kurang" ? "mis. -2000000" : "mis. 5000000"}
              style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatItem && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatItem}
            </div>
          )}
          <button
            type="button"
            onClick={tambahItem}
            disabled={mengirimItem}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--grad-aksen)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirimItem ? "wait" : "pointer" }}
          >
            {mengirimItem ? "Menyimpan…" : "Tambah Item"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={!!sheetTolakTerbuka} onTutup={() => setSheetTolakTerbuka(null)} judul={`Tolak — ${sheetTolakTerbuka?.co_number ?? ""}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan penolakan (opsional)</span>
            <textarea
              value={alasanTolak}
              onChange={(e) => setAlasanTolak(e.target.value)}
              rows={3}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatTolak && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatTolak}
            </div>
          )}
          <button
            type="button"
            onClick={konfirmasiTolak}
            disabled={mengirimTolak}
            style={{ minHeight: 48, borderRadius: "var(--portal-radius-pill)", background: "var(--danger)", color: "var(--on-navy)", border: "none", fontSize: 14, fontWeight: 700, cursor: mengirimTolak ? "wait" : "pointer" }}
          >
            {mengirimTolak ? "Menolak…" : "Tolak Change Order"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
