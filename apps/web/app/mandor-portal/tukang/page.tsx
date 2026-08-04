"use client";

import { useEffect, useState } from "react";
import { useTutupEsc } from "@/lib/use-tutup-esc";
import { api } from "@/lib/api";
import { kirimLapangan } from "@/lib/kirim-lapangan";
import { Users, Plus, Phone, Edit2, ToggleLeft, ToggleRight } from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)", surface: "var(--surface)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
};

const TIPE_META: Record<string, { label: string; color: string }> = {
  tukang: { label: "Tukang",  color: "var(--info)" },
  laden:  { label: "Laden",   color: "#7C3AED" },
  kenek:  { label: "Kenek",   color: "#0891B2" },
};

interface Worker {
  id: string; name: string; phone: string | null; tipe: string | null;
  skills: string[]; is_active: boolean; total_laporan: number;
}

export default function DaftarTukangPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  // Modal di portal ini tak punya prop `onClose` — ia dikendalikan state
  // lokal — sehingga penjaga `modal-esc-ratchet` tak menjangkaunya, dan
  // kelima modal portal mandor menjebak pemakai keyboard tanpa terdeteksi.
  // Penjaganya ikut diperluas; ini perbaikan kodenya.
  useTutupEsc(showModal ? () => setShowModal(false) : null);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "aktif" | "nonaktif">("aktif");

  const [form, setForm] = useState({ name: "", tipe: "", phone: "", notes: "", skills: "" });

  useEffect(() => { loadWorkers(); }, []);

  async function loadWorkers() {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/mandor/workers");
      setWorkers(res.data?.workers ?? []);
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setEditWorker(null);
    setForm({ name: "", tipe: "", phone: "", notes: "", skills: "" });
    setShowModal(true);
  }

  function openEdit(w: Worker) {
    setEditWorker(w);
    setForm({ name: w.name, tipe: w.tipe ?? "", phone: w.phone ?? "", notes: "", skills: (w.skills ?? []).join(", ") });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setToast({ msg: "Nama wajib diisi", ok: false }); return; }
    setSubmitting(true);
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

      setToast({ msg: hasil.pesan, ok: hasil.aman });
      if (!hasil.aman) return;
      setShowModal(false);
      if (hasil.terkirim) await loadWorkers();
    } catch (err: any) {
      setToast({ msg: err.response?.data?.error ?? "Gagal menyimpan", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(w: Worker) {
    try {
      await api.patch(`/api/v1/mandor/workers/${w.id}`, { is_active: !w.is_active });
      setWorkers((list) => list.map((item) => item.id === w.id ? { ...item, is_active: !w.is_active } : item));
      setToast({ msg: `${w.name} ${w.is_active ? "dinonaktifkan" : "diaktifkan"}`, ok: true });
    } catch {
      setToast({ msg: "Gagal mengubah status", ok: false });
    }
  }

  const filtered = workers.filter((w) => {
    if (filterStatus === "aktif") return w.is_active;
    if (filterStatus === "nonaktif") return !w.is_active;
    return true;
  });

  const activeCount = workers.filter((w) => w.is_active).length;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {toast && (
        // Toast sebagai TOMBOL, bukan `<div onClick>`: ia memang bisa ditekan
        // (untuk menutup), jadi harus bisa difokus dan menanggapi Enter/Space.
        //
        // `role="alert"` ada di WADAHNYA, bukan di tombolnya. Versi pertama
        // menaruhnya langsung di `<button>` dan lint benar menolaknya: `alert`
        // adalah peran non-interaktif, jadi memasangnya ke tombol justru
        // MENGHAPUS makna "ini bisa ditekan". Memisahkan keduanya membuat
        // pembaca layar mengumumkan pesannya begitu muncul DAN tetap tahu
        // bahwa ia bisa ditutup — tanpa itu, pesan "berhasil"/"gagal" hanya
        // terlihat oleh yang kebetulan menatap sudut kanan atas layar.
        <div role="alert" aria-live="polite">
        <button
          type="button"
          onClick={() => setToast(null)}
          aria-label={`Tutup pesan: ${toast.msg}`}
          style={{
          position: "fixed", top: 72, right: 20, zIndex: 999,
          background: toast.ok ? C.greenBg : C.redBg, border: `1px solid ${toast.ok ? C.green : C.red}`,
          color: toast.ok ? C.green : C.red, padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)", cursor: "pointer",
          textAlign: "left",
        }}>
          {toast.msg}
        </button>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Daftar Tukang</h1>
          <p style={{ fontSize: 13, color: C.mid, margin: "4px 0 0" }}>{activeCount} tukang aktif terdaftar</p>
        </div>
        <button onClick={openAdd} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
          border: "none", background: C.navy, color: "var(--surface)", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          <Plus size={15} /> Tambah Tukang
        </button>
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(["aktif", "nonaktif", "all"] as const).map((f) => (
          <button key={f} onClick={() => setFilterStatus(f)} style={{
            padding: "6px 14px", borderRadius: 20, border: `1px solid ${filterStatus === f ? C.navy : C.border}`,
            background: filterStatus === f ? C.navyLight : "var(--surface)",
            color: filterStatus === f ? C.navy : C.mid,
            fontSize: 12, fontWeight: filterStatus === f ? 600 : 400, cursor: "pointer",
          }}>
            {f === "all" ? "Semua" : f === "aktif" ? "Aktif" : "Nonaktif"}
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: C.mid }}>Memuat...</div>}
      {!loading && filtered.length === 0 && (
        <div style={{ background: C.surface, borderRadius: 12, padding: 40, border: `1px solid ${C.border}`, textAlign: "center" }}>
          <Users size={28} color={C.muted} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, color: C.mid }}>Tidak ada tukang</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.map((w) => {
          const tipeMeta = w.tipe ? TIPE_META[w.tipe] : null;
          const waHref = w.phone ? `https://wa.me/62${w.phone.replace(/^0/, "")}` : null;
          return (
            <div key={w.id} style={{
              background: C.surface, borderRadius: 12, padding: "14px 16px",
              border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              opacity: w.is_active ? 1 : 0.6,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{w.name}</span>
                    {tipeMeta && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: tipeMeta.color, background: `${tipeMeta.color}15` }}>
                        {tipeMeta.label}
                      </span>
                    )}
                    {!w.is_active && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, color: C.muted, background: "var(--surface-hover)" }}>
                        Nonaktif
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: C.mid }}>
                    {waHref ? (
                      <a href={waHref} target="_blank" rel="noreferrer" style={{ color: C.mid, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                        <Phone size={12} /> {w.phone}
                      </a>
                    ) : (
                      <span style={{ color: C.muted }}>Belum ada HP</span>
                    )}
                    {w.total_laporan > 0 && (
                      <span>{w.total_laporan} laporan</span>
                    )}
                  </div>
                  {(w.skills ?? []).length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {(w.skills ?? []).map((s: string) => (
                        <span key={s} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--surface-hover)", color: C.mid }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, marginLeft: 8 }}>
                  <button aria-label={`Ubah data ${w.name}`} onClick={() => openEdit(w)} style={{
                    width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Edit2 size={14} color={C.mid} />
                  </button>
                  <button onClick={() => toggleActive(w)} title={w.is_active ? "Nonaktifkan" : "Aktifkan"} style={{
                    width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`,
                    background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {w.is_active
                      ? <ToggleRight size={18} color={C.green} />
                      : <ToggleLeft size={18} color={C.muted} />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add/Edit */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 20px" }}>
              {editWorker ? "Edit Tukang" : "Tambah Tukang"}
            </h2>
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label htmlFor="name" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Nama *</label>
                <input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Nama lengkap"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label htmlFor="tipe" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Tipe</label>
                  <select id="tipe" aria-label="Tipe pekerja" value={form.tipe} onChange={(e) => setForm((f) => ({ ...f, tipe: e.target.value }))}
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }}>
                    <option value="">Tidak ditentukan</option>
                    <option value="tukang">Tukang</option>
                    <option value="laden">Laden</option>
                    <option value="kenek">Kenek</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="phone" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>No HP</label>
                  <input id="phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0812..."
                    style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
                </div>
              </div>
              <div>
                <label htmlFor="skills" style={{ fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 5 }}>Keahlian (pisah koma)</label>
                <input id="skills" value={form.skills} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} placeholder="Batu, Pasang Keramik, Las"
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{
                  flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${C.border}`,
                  background: "var(--surface)", color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Batal</button>
                <button type="submit" disabled={submitting} style={{
                  flex: 2, padding: "10px", borderRadius: 10, border: "none",
                  background: submitting ? C.mid : C.navy, color: "var(--surface)",
                  fontSize: 13, fontWeight: 600, cursor: submitting ? "wait" : "pointer",
                }}>{submitting ? "Menyimpan..." : editWorker ? "Simpan Perubahan" : "Tambah Tukang"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
