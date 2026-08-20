"use client";

// ============================================================================
// DAFTAR TUKANG — versi PM, portal mobile (Tahap 1, Task 8).
//
// Sama endpoint `apps/api/src/routes/v1/mandor.ts` (bukan berkas terpisah)
// dengan `mandor-portal/tukang` dan `(dashboard)/mandor/tukang`. Riset
// Task 5 dikonfirmasi ulang membaca kode langsung: list/tambah TANPA gerbang
// permission (cuma `authenticate`); PATCH/DELETE punya ownership check
// LITERAL `user.role === 'mandor'` — dan PM (`role !== 'mandor'`) TIDAK
// KENA check itu sama sekali. PM bisa CRUD tukang siapa pun di tenant, jadi
// halaman ini TIDAK menyembunyikan satu pun tombol (beda dari `mitra` di
// sebelahnya, yang memang menyembunyikan aksi daftar hitam).
//
// Beda dari `mandor-portal/tukang`: halaman itu (mandor melihat tukang
// miliknya sendiri) TIDAK punya tombol Hapus — cukup toggle aktif/nonaktif.
// Di sini Hapus DITAMBAHKAN karena PM mengelola registry lintas-mandor dan
// desktop admin (`(dashboard)/mandor/tukang`) sudah menyediakannya; endpoint
// DELETE sudah menolak (409) kalau tukang masih punya laporan upah aktif,
// jadi konfirmasi di sini cukup satu langkah plus penjelasan tak-bisa-batal.
// ============================================================================

import { useState } from "react";
import { api } from "@/lib/api";
import { useData, invalidasi } from "@/lib/data-cache";
import { Users, Plus, Phone, Edit2, ToggleLeft, ToggleRight, Trash2, Search } from "lucide-react";
import BottomSheet from "@/components/portal/BottomSheet";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import type { Worker, ResponsWorker, GalatApi } from "../../_bersama/tipe";
import { TIPE_WORKER_LABELS, pesanGalat } from "../../_bersama/tipe";

const TIPE_WARNA: Record<string, string> = {
  tukang: "var(--info)", laden: "var(--aksen)", kenek: "var(--info)",
};

function tautanWa(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "62" + digits.slice(1) : digits;
  return `https://wa.me/${normalized}`;
}

export default function PmTukangPage() {
  const [cari, setCari] = useState("");
  const [filterStatus, setFilterStatus] = useState<"aktif" | "nonaktif" | "all">("aktif");

  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [hapusTarget, setHapusTarget] = useState<Worker | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [menghapus, setMenghapus] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [galatHapus, setGalatHapus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [form, setForm] = useState({ name: "", tipe: "", phone: "", notes: "", skills: "" });

  const { data, memuat: loading, galat: galatMuat, muatUlang } =
    useData<ResponsWorker>("/api/v1/mandor/workers");
  const workers = data?.workers ?? [];

  function tampilkanToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function openAdd() {
    setEditWorker(null);
    setForm({ name: "", tipe: "", phone: "", notes: "", skills: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  function openEdit(w: Worker) {
    setEditWorker(w);
    setForm({ name: w.name, tipe: w.tipe ?? "", phone: w.phone ?? "", notes: w.notes ?? "", skills: (w.skills ?? []).join(", ") });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setGalatForm("Nama wajib diisi"); return; }
    setSubmitting(true);
    setGalatForm(null);
    try {
      const payload = {
        name: form.name.trim(),
        tipe: form.tipe || undefined,
        phone: form.phone.trim() || undefined,
        notes: form.notes.trim() || undefined,
        skills: form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };
      if (editWorker) {
        await api.patch(`/api/v1/mandor/workers/${editWorker.id}`, payload);
      } else {
        await api.post("/api/v1/mandor/workers", payload);
      }
      invalidasi("/api/v1/mandor/workers");
      tampilkanToast(editWorker ? "Data tukang diperbarui" : "Tukang berhasil ditambahkan", true);
      setSheetTerbuka(false);
      await muatUlang();
    } catch (err) {
      setGalatForm(pesanGalat(err as GalatApi, "Gagal menyimpan"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(w: Worker) {
    try {
      await api.patch(`/api/v1/mandor/workers/${w.id}`, { is_active: !w.is_active });
      invalidasi("/api/v1/mandor/workers");
      await muatUlang();
      tampilkanToast(`${w.name} ${w.is_active ? "dinonaktifkan" : "diaktifkan"}`, true);
    } catch {
      tampilkanToast("Gagal mengubah status", false);
    }
  }

  async function konfirmasiHapus() {
    if (!hapusTarget) return;
    setMenghapus(true);
    setGalatHapus(null);
    try {
      await api.delete(`/api/v1/mandor/workers/${hapusTarget.id}`);
      invalidasi("/api/v1/mandor/workers");
      tampilkanToast(`${hapusTarget.name} dihapus dari daftar`, true);
      setHapusTarget(null);
      await muatUlang();
    } catch (err) {
      // Kemungkinan besar 409: masih punya laporan upah aktif. Pesan servernya
      // sudah bisa ditindak — dipulangkan apa adanya di dialog, dialognya
      // TIDAK ditutup, supaya pemakai tahu kenapa dan bisa membatalkan sadar.
      setGalatHapus(pesanGalat(err as GalatApi, "Gagal menghapus tukang"));
    } finally {
      setMenghapus(false);
    }
  }

  const filtered = workers.filter((w) => {
    if (filterStatus === "aktif" && !w.is_active) return false;
    if (filterStatus === "nonaktif" && w.is_active) return false;
    if (cari && !w.name.toLowerCase().includes(cari.toLowerCase())) return false;
    return true;
  });

  const activeCount = workers.filter((w) => w.is_active).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Tukang</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            {activeCount} tukang aktif · registry lintas mandor
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)",
            border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)",
            fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={16} aria-hidden="true" /> Tambah
        </button>
      </div>

      <label style={{ position: "relative", display: "block" }}>
        <span className="sr-only">Cari nama tukang</span>
        <Search size={15} aria-hidden="true" style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-muted)", pointerEvents: "none",
        }} />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama tukang…"
          style={{
            width: "100%", minHeight: 44, padding: "0 12px 0 36px", borderRadius: 12,
            border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
            background: "var(--surface)", color: "var(--text-primary)",
          }}
        />
      </label>

      <SegmentedTab
        opsi={[
          { value: "aktif", label: "Aktif" },
          { value: "nonaktif", label: "Nonaktif" },
          { value: "all", label: "Semua" },
        ]}
        aktif={filterStatus}
        onUbah={(v) => setFilterStatus(v as typeof filterStatus)}
      />

      {loading && (
        <>
          <SkeletonCard tinggi={80} />
          <SkeletonCard tinggi={80} />
        </>
      )}

      {!loading && galatMuat && (
        <EmptyState
          icon={Users}
          judul="Gagal memuat daftar tukang"
          deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {!loading && !galatMuat && filtered.length === 0 && (
        <EmptyState
          icon={Users}
          judul="Belum ada tukang yang cocok"
          deskripsi="Laporan upah mingguan disusun per tukang. Selama registry kosong, mandor tak bisa mengajukan upah lewat sistem."
        />
      )}

      {!loading && !galatMuat && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((w) => {
            const tipeLabel = w.tipe ? TIPE_WORKER_LABELS[w.tipe] : null;
            const waHref = w.phone ? tautanWa(w.phone) : null;
            return (
              <div
                key={w.id}
                style={{
                  padding: 16, borderRadius: 16,
                  background: w.is_active ? "var(--surface)" : "var(--surface-subtle)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{w.name}</span>
                      {tipeLabel && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--portal-radius-pill)", color: TIPE_WARNA[w.tipe!], background: "var(--surface-hover)" }}>
                          {tipeLabel}
                        </span>
                      )}
                      {!w.is_active && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--portal-radius-pill)", color: "var(--text-muted)", background: "var(--surface-hover)" }}>
                          Nonaktif
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                      {waHref ? (
                        <a href={waHref} target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                          <Phone size={12} aria-hidden="true" /> {w.phone}
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Belum ada HP</span>
                      )}
                      {w.mandor?.name && <span>mandor: {w.mandor.name}</span>}
                    </div>
                    {(w.skills ?? []).length > 0 && (
                      <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(w.skills ?? []).map((s) => (
                          <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: "var(--portal-radius-pill)", background: "var(--surface-hover)", color: "var(--text-secondary)" }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      aria-label={`Ubah data ${w.name}`}
                      onClick={() => openEdit(w)}
                      style={{
                        width: 44, height: 44, borderRadius: 12, border: "1px solid var(--border)",
                        background: "var(--surface)", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Edit2 size={16} color="var(--text-secondary)" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(w)}
                      aria-label={w.is_active ? `Nonaktifkan ${w.name}` : `Aktifkan ${w.name}`}
                      title={w.is_active ? "Nonaktifkan" : "Aktifkan"}
                      style={{
                        width: 44, height: 44, borderRadius: 12, border: "1px solid var(--border)",
                        background: "var(--surface)", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {w.is_active
                        ? <ToggleRight size={20} color="var(--on-success-bg)" aria-hidden="true" />
                        : <ToggleLeft size={20} color="var(--text-muted)" aria-hidden="true" />}
                    </button>
                    <button
                      type="button"
                      aria-label={`Hapus ${w.name}`}
                      onClick={() => { setGalatHapus(null); setHapusTarget(w); }}
                      style={{
                        width: 44, height: 44, borderRadius: 12, border: "1px solid var(--danger-border)",
                        background: "var(--danger-bg)", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      <Trash2 size={16} color="var(--danger)" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BottomSheet
        terbuka={sheetTerbuka}
        onTutup={() => setSheetTerbuka(false)}
        judul={editWorker ? "Edit Tukang" : "Tambah Tukang"}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="pm-tukang-nama" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Nama *
            </label>
            <input
              id="pm-tukang-nama"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nama lengkap"
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                background: "var(--surface)", color: "var(--text-primary)",
              }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="pm-tukang-tipe" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Tipe
              </label>
              <select
                id="pm-tukang-tipe"
                value={form.tipe}
                onChange={(e) => setForm((f) => ({ ...f, tipe: e.target.value }))}
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                  background: "var(--surface)", boxSizing: "border-box",
                }}
              >
                <option value="">Tidak ditentukan</option>
                <option value="tukang">Tukang</option>
                <option value="laden">Laden</option>
                <option value="kenek">Kenek</option>
              </select>
            </div>
            <div>
              <label htmlFor="pm-tukang-hp" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                No HP
              </label>
              <input
                id="pm-tukang-hp"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0812..."
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                  background: "var(--surface)", color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
          <div>
            <label htmlFor="pm-tukang-skills" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Keahlian (pisah koma)
            </label>
            <input
              id="pm-tukang-skills"
              value={form.skills}
              onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
              placeholder="Batu, Pasang Keramik, Las"
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                background: "var(--surface)", color: "var(--text-primary)",
              }}
            />
          </div>

          {galatForm && <div role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setSheetTerbuka(false)}
              disabled={submitting}
              style={{
                flex: 1, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text-secondary)", fontSize: 13, fontWeight: 700, cursor: submitting ? "default" : "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={submitting ? {
                flex: 2, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                border: "none", background: "var(--surface-hover)", color: "var(--text-muted)",
                fontSize: 13, fontWeight: 700, cursor: "default",
              } : {
                flex: 2, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                border: "none", background: "var(--grad-aksen)", color: "var(--on-navy)",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              {submitting ? "Menyimpan…" : editWorker ? "Simpan Perubahan" : "Tambah Tukang"}
            </button>
          </div>
        </form>
      </BottomSheet>

      <BottomSheet
        terbuka={!!hapusTarget}
        onTutup={() => (menghapus ? undefined : setHapusTarget(null))}
        judul="Hapus tukang?"
      >
        {hapusTarget && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
              Hapus <strong style={{ color: "var(--text-primary)" }}>{hapusTarget.name}</strong> dari
              registry tukang? Data ini tidak bisa dikembalikan. Kalau tukang ini masih punya
              laporan upah yang berjalan, penghapusan akan ditolak.
            </p>

            {galatHapus && (
              <div role="alert" style={{ fontSize: 12, color: "var(--on-danger-bg)", padding: 10, borderRadius: 10, background: "var(--danger-bg)", border: "1px solid var(--danger-border)" }}>
                {galatHapus}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => setHapusTarget(null)}
                disabled={menghapus}
                style={{
                  flex: 1, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                  border: "1px solid var(--border)", background: "var(--surface)",
                  color: "var(--text-secondary)", fontSize: 13, fontWeight: 700, cursor: menghapus ? "default" : "pointer",
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={konfirmasiHapus}
                disabled={menghapus}
                style={menghapus ? {
                  flex: 1, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                  border: "none", background: "var(--surface-hover)", color: "var(--text-muted)",
                  fontSize: 13, fontWeight: 700, cursor: "default",
                } : {
                  flex: 1, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                  border: "none", background: "var(--danger)", color: "var(--on-aksen)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                {menghapus ? "Menghapus…" : "Hapus"}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 10000,
            padding: "12px 20px", borderRadius: 10,
            background: toast.ok ? "var(--success)" : "var(--danger)",
            color: toast.ok ? "var(--on-success-bg)" : "var(--on-danger-bg)",
            fontSize: 13, fontWeight: 600, boxShadow: "var(--naik-2)", whiteSpace: "nowrap",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
