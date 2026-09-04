"use client";

// ============================================================================
// RAB — detail versi: header, daftar item, tambah/hapus item, submit/approve/
// reject (Tahap 3, Task 19).
//
// ── `cost_code_id` di item lumpsum — cacat yang DITANDAI di breakdown plan
//
// Draf awal (task-19-brief.md) menulis `simpanItem()` mode lumpsum TANPA
// `cost_code_id`. Backend (`estimate-versions.ts:1120`) menolaknya:
// `400 'cost_code_id wajib untuk item lumpsum'` — divalidasi lagi di
// `:1124-1126` terhadap tabel `cost_codes` lewat `request.db` (tenant-scoped).
// Diperbaiki di sini dengan picker `<select>` sederhana berisi
// `GET /api/v1/cost-codes` (gerbang `cecep:cost_code:view`, PM PUNYA) —
// lihat `CostCodeRingkas` di `_bersama/tipe.ts`.
//
// ── `status !== "rejected"` — cacat kedua yang ditemukan verifikasi ulang
//
// Draf awal juga mengetik union status `"rejected"` dan memetakannya ke
// varian badge merah. Diverifikasi ke DB (CHECK constraint migrasi 110,
// trigger transisi migrasi 111) DAN ke rute `PATCH .../reject` sendiri:
// status yang ditolak kembali menjadi `draft`, BUKAN `rejected` — nilai itu
// bahkan tak ada di CHECK constraint kolomnya. Ditolaknya sebuah versi hanya
// bisa dilihat sesaat, lewat pesan aksi (`galatAksi`/pesan sukses), bukan
// lencana status yang bertahan — karena datanya memang tak bertahan.
//
// Bentuk `RespRabDetail`/`ItemEstimasi` diverifikasi PERSIS ke
// `estimate-versions.ts:423-442` (GET detail) — `assembly`/`cost_code`
// BERSARANG dari PostgREST (FK many-to-one → objek).
// ============================================================================

import { useMemo, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { FileSpreadsheet, Plus, Trash2, Search } from "lucide-react";
import { useData, invalidasi } from "@/lib/data-cache";
import { api, hasPermission } from "@/lib/api";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import BottomSheet from "@/components/portal/BottomSheet";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type {
  RespRabDetail,
  ItemEstimasi,
  RespAssemblyKatalog,
  AssemblyRingkasPicker,
  RespCostCodeRingkas,
  GalatApi,
} from "../../../_bersama/tipe";
import { pesanGalat } from "../../../_bersama/tipe";
import { Pilihan } from "@/components/pilihan";

function fmtRupiah(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}
function fmtVolume(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return String(v);
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
}

const LABEL_STATUS: Record<string, string> = {
  draft: "Masih disusun",
  under_review: "Diajukan",
  approved: "Disetujui",
  frozen: "Dibekukan",
  superseded: "Tergantikan",
};
const VARIAN_STATUS: Record<string, VarianStatus> = {
  draft: "netral",
  under_review: "pending",
  approved: "approved",
  frozen: "info",
  superseded: "netral",
};

// `langganan`: dipakai `useSyncExternalStore` supaya perubahan permission
// (login/switch company) tercermin tanpa reload — pola sama dengan
// `pm-portal/mandor-lengkap/spk/page.tsx` dan `.../penugasan/page.tsx`.
const langganan = (cb: () => void) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); };

export default function PmRabDetailPage() {
  const params = useParams<{ id: string }>();
  const versiId = params.id;

  // `cecep:estimate:approve` HANYA di-seed ke role `admin`
  // (`db/migrations/111_cecep_estimate_approval.sql:27-29`) — PM cuma punya
  // `cecep:estimate:manage` (submit). Tanpa gerbang ini, tombol Setujui/Tolak
  // tampil LIVE untuk PM yang membuka versi under_review, dan pasti 403 saat
  // diklik — pola "409/403 membingungkan" persis yang dihindari brief untuk
  // tombol tambah/hapus item di halaman yang sama. Tombolnya TIDAK DIRENDER
  // sama sekali (bukan disabled) saat izin tak ada, konsisten pola
  // `bolehKelola` di spk/page.tsx.
  const bolehApprove = useSyncExternalStore(
    langganan, () => hasPermission("cecep:estimate:approve"), () => false);

  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [modeTambah, setModeTambah] = useState<"lumpsum" | "assembly">("lumpsum");
  const [cariAssembly, setCariAssembly] = useState("");
  const [assemblyDipilih, setAssemblyDipilih] = useState<AssemblyRingkasPicker | null>(null);
  const [qty, setQty] = useState("");
  const [lumpsumNama, setLumpsumNama] = useState("");
  const [lumpsumJumlah, setLumpsumJumlah] = useState("");
  const [lumpsumCostCodeId, setLumpsumCostCodeId] = useState("");
  const [mengirim, setMengirim] = useState(false);
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [pesanAksi, setPesanAksi] = useState<string | null>(null);
  const [alasanTolak, setAlasanTolak] = useState("");
  const [sheetTolakTerbuka, setSheetTolakTerbuka] = useState(false);

  const url = `/api/v1/estimate-versions/${versiId}`;
  const { data, memuat, galat: galatMuat } = useData<RespRabDetail>(url);
  const v = data?.data;
  const galat = galatMuat ? pesanGalat(galatMuat as GalatApi, "RAB tidak ditemukan.") : null;

  const { data: dataCari } = useData<RespAssemblyKatalog>(
    modeTambah === "assembly" && cariAssembly.trim().length >= 2
      ? `/api/v1/cecep/assemblies?limit=20&q=${encodeURIComponent(cariAssembly.trim())}`
      : null
  );

  // Picker cost code — hanya dibutuhkan mode lumpsum, tapi dimuat begitu
  // sheet terbuka supaya tak ada jeda tambahan saat pemakai memilih.
  const { data: dataCostCode } = useData<RespCostCodeRingkas>(
    sheetTerbuka ? "/api/v1/cost-codes" : null
  );
  const daftarCostCode = useMemo(() => dataCostCode?.data ?? [], [dataCostCode]);

  function bukaTambah() {
    setModeTambah("lumpsum");
    setCariAssembly("");
    setAssemblyDipilih(null);
    setQty("");
    setLumpsumNama("");
    setLumpsumJumlah("");
    setLumpsumCostCodeId("");
    setGalatAksi(null);
    setSheetTerbuka(true);
  }

  async function simpanItem() {
    if (!v) return;
    setMengirim(true);
    setGalatAksi(null);
    try {
      if (modeTambah === "lumpsum") {
        if (lumpsumNama.trim().length === 0 || !lumpsumJumlah || Number(lumpsumJumlah) <= 0) {
          setGalatAksi("Nama dan jumlah (Rp) wajib diisi.");
          setMengirim(false);
          return;
        }
        if (!lumpsumCostCodeId) {
          setGalatAksi("Kode biaya (cost code) wajib dipilih untuk item lumpsum.");
          setMengirim(false);
          return;
        }
        await api.post(`/api/v1/estimate-versions/${versiId}/items`, {
          item_type: "lumpsum",
          cost_code_id: lumpsumCostCodeId,
          amount: Number(lumpsumJumlah),
          notes: lumpsumNama.trim(),
        });
      } else {
        if (!assemblyDipilih || !qty || Number(qty) <= 0) {
          setGalatAksi("Pilih analisa dan isi volume.");
          setMengirim(false);
          return;
        }
        await api.post(`/api/v1/estimate-versions/${versiId}/items`, {
          item_type: "assembly",
          assembly_id: assemblyDipilih.id,
          quantity: Number(qty),
          buk_fraction: 0,
          rounding: { mode: "none", step: 1 },
        });
      }
      setSheetTerbuka(false);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menambah item"));
    } finally {
      setMengirim(false);
    }
  }

  async function hapusItem(itemId: string, labelItem: string) {
    setGalatAksi(null);
    try {
      await api.delete(`/api/v1/estimate-versions/${versiId}/items/${itemId}`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, `Gagal menghapus item ${labelItem}`));
    }
  }

  async function submitVersi() {
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/estimate-versions/${versiId}/submit`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal mengajukan RAB"));
    }
  }

  async function approveVersi() {
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/estimate-versions/${versiId}/approve`);
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menyetujui RAB"));
    }
  }

  async function tolakVersi() {
    if (alasanTolak.trim().length < 10) {
      setGalatAksi("Alasan penolakan minimal 10 karakter.");
      return;
    }
    setGalatAksi(null);
    try {
      await api.patch(`/api/v1/estimate-versions/${versiId}/reject`, { reason: alasanTolak.trim() });
      setSheetTolakTerbuka(false);
      setAlasanTolak("");
      // Status kembali ke `draft` (bukan "rejected" — nilai itu tak pernah
      // tersimpan, lihat komentar berkas). Pesan sesaat ini satu-satunya
      // jejak yang pemakai lihat bahwa aksinya benar-benar tercatat.
      setPesanAksi("RAB ditolak dan dikembalikan ke draf untuk direvisi.");
      invalidasi(url);
    } catch (e) {
      setGalatAksi(pesanGalat(e as GalatApi, "Gagal menolak RAB"));
    }
  }

  if (memuat) return <SkeletonCard tinggi={200} />;
  if (galat || !v) {
    return <EmptyState icon={FileSpreadsheet} judul="Gagal memuat" deskripsi={galat ?? "RAB tidak ditemukan."} />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
          Revisi {v.version_number}
        </h1>
        <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
          {v.edition?.code ?? "edisi belum dipilih"}
        </div>
      </div>

      <div
        style={{
          padding: "var(--pad-kartu)",
          borderRadius: "var(--portal-radius-card)",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Status</span>
          <StatusBadge status={VARIAN_STATUS[v.status] ?? "netral"} label={LABEL_STATUS[v.status] ?? v.status} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(v.total_amount)}</div>
        <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)" }}>{v.items.length} item</div>
      </div>

      {pesanAksi && !galatAksi && (
        <div
          role="status"
          style={{ padding: 10, borderRadius: 10, background: "var(--info-bg)", color: "var(--on-info-bg)", fontSize: 12 }}
        >
          {pesanAksi}
        </div>
      )}
      {galatAksi && (
        <div
          role="alert"
          style={{ padding: 10, borderRadius: 10, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 12 }}
        >
          {galatAksi}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {v.status === "draft" && (
          <>
            <button
              type="button"
              onClick={bukaTambah}
              style={{
                minHeight: 44,
                padding: "0 16px",
                borderRadius: "var(--portal-radius-pill)",
                background: "var(--grad-aksen)",
                color: "var(--on-navy)",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Plus size={16} aria-hidden="true" /> Item
            </button>
            <button
              type="button"
              onClick={submitVersi}
              disabled={v.items.length === 0}
              style={{
                minHeight: 44,
                padding: "0 16px",
                borderRadius: "var(--portal-radius-pill)",
                background: "var(--surface-subtle)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                fontSize: 13,
                fontWeight: 700,
                cursor: v.items.length === 0 ? "not-allowed" : "pointer",
                opacity: v.items.length === 0 ? 0.5 : 1,
              }}
            >
              Ajukan
            </button>
          </>
        )}
        {v.status === "under_review" && bolehApprove && (
          <>
            <button
              type="button"
              onClick={approveVersi}
              style={{
                minHeight: 44,
                padding: "0 16px",
                borderRadius: "var(--portal-radius-pill)",
                background: "var(--grad-aksen)",
                color: "var(--on-navy)",
                border: "none",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Setujui
            </button>
            <button
              type="button"
              onClick={() => setSheetTolakTerbuka(true)}
              style={{
                minHeight: 44,
                padding: "0 16px",
                borderRadius: "var(--portal-radius-pill)",
                background: "var(--surface-subtle)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Tolak
            </button>
          </>
        )}
      </div>

      {v.items.length === 0 && (
        <EmptyState icon={FileSpreadsheet} judul="Belum ada item" deskripsi="Tambahkan item dari analisa AHSP atau lumpsum." />
      )}

      {v.items.map((it: ItemEstimasi) => {
        const labelItem = it.assembly ? `${it.assembly.code} · ${it.assembly.name}` : (it.notes ?? "Item lumpsum");
        return (
          <div
            key={it.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
              padding: "var(--pad-kartu)",
              borderRadius: "var(--portal-radius-card)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{labelItem}</div>
              <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)", marginTop: 2 }}>
                {it.assembly ? `${fmtVolume(it.quantity)} ${it.assembly.output_unit_code ?? ""}` : "Lumpsum"} · {it.cost_code?.name ?? "—"}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--navy)" }}>{fmtRupiah(it.amount)}</div>
              {v.status === "draft" && (
                <button
                  type="button"
                  onClick={() => hapusItem(it.id, labelItem)}
                  aria-label={`Hapus item ${labelItem}`}
                  style={{
                    minHeight: 32,
                    minWidth: 32,
                    borderRadius: 8,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Trash2 size={14} color="var(--danger)" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })}

      <BottomSheet terbuka={sheetTerbuka} onTutup={() => setSheetTerbuka(false)} judul="Tambah Item">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <SegmentedTab
            opsi={[
              { value: "lumpsum", label: "Lumpsum" },
              { value: "assembly", label: "Cari Analisa" },
            ]}
            aktif={modeTambah}
            onUbah={(m) => setModeTambah(m as "lumpsum" | "assembly")}
          />

          {modeTambah === "lumpsum" ? (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Nama pekerjaan</span>
                <input
                  value={lumpsumNama}
                  onChange={(e) => setLumpsumNama(e.target.value)}
                  style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Jumlah (Rp)</span>
                <input
                  type="number"
                  value={lumpsumJumlah}
                  onChange={(e) => setLumpsumJumlah(e.target.value)}
                  style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Kode biaya (cost code)</span>
                <Pilihan
                  value={lumpsumCostCodeId}
                  onChange={(e) => setLumpsumCostCodeId(e.target.value)}
                  style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14, background: "var(--surface)", color: "var(--text-primary)" }}
                >
                  <option value="">— Pilih kode biaya —</option>
                  {daftarCostCode.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} · {cc.name}
                    </option>
                  ))}
                </Pilihan>
              </label>
            </>
          ) : (
            <>
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  color="var(--text-secondary)"
                  aria-hidden="true"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
                />
                <input
                  type="search"
                  value={cariAssembly}
                  onChange={(e) => {
                    setCariAssembly(e.target.value);
                    setAssemblyDipilih(null);
                  }}
                  placeholder="Ketik minimal 2 huruf…"
                  aria-label="Cari analisa AHSP"
                  style={{ width: "100%", minHeight: 44, padding: "0 12px 0 36px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
                />
              </div>
              {!assemblyDipilih &&
                (dataCari?.data ?? []).slice(0, 8).map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAssemblyDipilih({ id: a.id, code: a.code, name: a.name, output_unit_code: a.output_unit_code })}
                    style={{ textAlign: "left", padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--navy)" }}>{a.code}</div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)" }}>{a.name}</div>
                  </button>
                ))}
              {assemblyDipilih && (
                <div style={{ padding: 10, borderRadius: 10, background: "var(--info-bg)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--on-info-bg)" }}>
                    {assemblyDipilih.code} · {assemblyDipilih.name}
                  </div>
                </div>
              )}
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>
                  Volume ({assemblyDipilih?.output_unit_code ?? "satuan"})
                </span>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  style={{ minHeight: 44, padding: "0 12px", borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
                />
              </label>
            </>
          )}

          {galatAksi && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatAksi}
            </div>
          )}

          <button
            type="button"
            onClick={simpanItem}
            disabled={mengirim}
            style={{
              minHeight: 48,
              borderRadius: "var(--portal-radius-pill)",
              background: "var(--grad-aksen)",
              color: "var(--on-navy)",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: mengirim ? "wait" : "pointer",
            }}
          >
            {mengirim ? "Menyimpan…" : "Simpan Item"}
          </button>
        </div>
      </BottomSheet>

      <BottomSheet terbuka={sheetTolakTerbuka} onTutup={() => setSheetTolakTerbuka(false)} judul="Tolak RAB">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Alasan (minimal 10 karakter)</span>
            <textarea
              value={alasanTolak}
              onChange={(e) => setAlasanTolak(e.target.value)}
              rows={4}
              style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", fontSize: 14 }}
            />
          </label>
          {galatAksi && (
            <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
              {galatAksi}
            </div>
          )}
          <button
            type="button"
            onClick={tolakVersi}
            style={{
              minHeight: 48,
              borderRadius: "var(--portal-radius-pill)",
              background: "var(--danger)",
              color: "var(--on-navy)",
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Tolak RAB
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
