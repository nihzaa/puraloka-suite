"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { type GalatApi, pesanGalat } from "../_bersama/tipe";
import { Users, Plus, Phone, Edit2, ToggleLeft, ToggleRight } from "lucide-react";
import BottomSheet from "@/components/portal/BottomSheet";
import KepalaPortal from "@/components/portal/KepalaPortal";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";

const TIPE_META: Record<string, { label: string; warna: string }> = {
  tukang: { label: "Tukang", warna: "var(--info)" },
  laden: { label: "Laden", warna: "var(--aksen)" },
  kenek: { label: "Kenek", warna: "var(--info)" },
};

interface Worker {
  id: string; name: string; phone: string | null; tipe: string | null;
  skills: string[]; is_active: boolean; total_laporan: number;
}

const FILTER_TAB: Array<{ value: string; label: string }> = [
  { value: "aktif", label: "Aktif" },
  { value: "nonaktif", label: "Nonaktif" },
  { value: "all", label: "Semua" },
];

export default function DaftarTukangPage() {
  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "aktif" | "nonaktif">("aktif");

  const [form, setForm] = useState({ name: "", tipe: "", phone: "", notes: "", skills: "" });

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    TIDAK ada cache offline di jalur BACA halaman ini — `kirimLapangan` di
    `handleSubmit` hanya membungkus jalur TULIS (tambah/ubah tukang).

    `toggleActive` semula melakukan update optimistik lokal (`setWorkers`
    manual). Dengan `useData`, state tak lagi dipegang halaman — diganti
    `muatUlang()` sesudah PATCH berhasil, yang berarti daftar menunggu
    konfirmasi server sebelum toggle terlihat. Nonaktifkan/aktifkan tukang
    bukan aksi yang butuh terasa instan seperti checklist.
  */
  const { data, memuat: loading, galat: galatMuat, muatUlang } =
    useData<{ workers: Worker[] }>("/api/v1/mandor/workers");
  const workers = data?.workers ?? [];

  function openAdd() {
    setEditWorker(null);
    setForm({ name: "", tipe: "", phone: "", notes: "", skills: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  function openEdit(w: Worker) {
    setEditWorker(w);
    setForm({ name: w.name, tipe: w.tipe ?? "", phone: w.phone ?? "", notes: "", skills: (w.skills ?? []).join(", ") });
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
      // F4-3 — lewat antrean offline; sinyal buruk adalah norma di lapangan.
      const hasil = editWorker
        ? await kirimLapangan("PATCH", `/api/v1/mandor/workers/${editWorker.id}`,
            payload, "Data tukang diperbarui", "Gagal menyimpan")
        : await kirimLapangan("POST", "/api/v1/mandor/workers",
            payload, "Tukang berhasil ditambahkan", "Gagal menyimpan");

      if (!hasil.aman) {
        setGalatForm(hasil.pesan);
        return;
      }
      setToast({ msg: hasil.pesan, ok: true });
      setTimeout(() => setToast(null), 3500);
      setSheetTerbuka(false);
      if (hasil.terkirim) await muatUlang();
    } catch (err) {
      setGalatForm(pesanGalat(err, "Gagal menyimpan"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(w: Worker) {
    try {
      await api.patch(`/api/v1/mandor/workers/${w.id}`, { is_active: !w.is_active });
      await muatUlang();
      setToast({ msg: `${w.name} ${w.is_active ? "dinonaktifkan" : "diaktifkan"}`, ok: true });
      setTimeout(() => setToast(null), 3500);
    } catch {
      setToast({ msg: "Gagal mengubah status", ok: false });
      setTimeout(() => setToast(null), 3500);
    }
  }

  const filtered = workers.filter((w) => {
    if (filterStatus === "aktif") return w.is_active;
    if (filterStatus === "nonaktif") return !w.is_active;
    return true;
  });

  const activeCount = workers.filter((w) => w.is_active).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <KepalaPortal judul="Daftar Tukang" />
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>{activeCount} tukang aktif terdaftar</p>
        </div>
        <button
          onClick={openAdd}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            minHeight: 44, padding: "0 16px", borderRadius: "var(--portal-radius-pill)",
            border: "none", background: "var(--grad-merek)", color: "var(--on-navy)",
            fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0,
          }}
        >
          <Plus size={16} aria-hidden="true" /> Tambah
        </button>
      </div>

      <SegmentedTab
        opsi={FILTER_TAB}
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
          judul="Belum ada tukang di daftar ini"
          deskripsi="Tukang yang Anda tambahkan akan muncul di sini, lengkap dengan kontak dan keahliannya."
        />
      )}

      {!loading && !galatMuat && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((w) => {
            const tipeMeta = w.tipe ? TIPE_META[w.tipe] : null;
            const waHref = w.phone ? `https://wa.me/62${w.phone.replace(/^0/, "")}` : null;
            return (
              <div
                key={w.id}
                style={{
                  padding: "var(--pad-kartu-lega)", borderRadius: 16,
                  background: w.is_active ? "var(--surface)" : "var(--surface-subtle)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{w.name}</span>
                      {tipeMeta && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "var(--portal-radius-pill)", color: tipeMeta.warna, background: "var(--surface-hover)" }}>
                          {tipeMeta.label}
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
                      {w.total_laporan > 0 && <span>{w.total_laporan} laporan</span>}
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
            <label htmlFor="name" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Nama *
            </label>
            <input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nama lengkap"
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="tipe" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Tipe
              </label>
              <select
                id="tipe"
                aria-label="Tipe pekerja"
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
              <label htmlFor="phone" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                No HP
              </label>
              <input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="0812..."
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                }}
              />
            </div>
          </div>
          <div>
            <label htmlFor="skills" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Keahlian (pisah koma)
            </label>
            <input
              id="skills"
              value={form.skills}
              onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
              placeholder="Batu, Pasang Keramik, Las"
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
              }}
            />
          </div>

          {galatForm && <div style={{ fontSize: 12, color: "var(--danger)" }}>{galatForm}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={() => setSheetTerbuka(false)}
              style={{
                flex: 1, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text-secondary)", fontSize: 13, fontWeight: 700, cursor: "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                flex: 2, minHeight: 44, padding: "0 12px", borderRadius: "var(--portal-radius-pill)",
                border: "none",
                background: submitting ? "var(--surface-hover)" : "var(--navy)",
                color: submitting ? "var(--text-muted)" : "var(--on-navy)",
                fontSize: 13, fontWeight: 700, cursor: submitting ? "default" : "pointer",
              }}
            >
              {submitting ? "Menyimpan…" : editWorker ? "Simpan Perubahan" : "Tambah Tukang"}
            </button>
          </div>
        </form>
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
