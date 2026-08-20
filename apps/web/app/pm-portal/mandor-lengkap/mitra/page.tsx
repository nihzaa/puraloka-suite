"use client";

// ============================================================================
// MITRA — versi PM, portal mobile (Tahap 1, Task 8).
//
// Satu identitas untuk pihak yang bisa muncul sebagai tukang, pemasok,
// maupun penawar tender — berbentuk orang (mandor borongan) atau badan
// usaha (spesialis ME/lift/waterproofing). Lihat `(dashboard)/mandor/mitra`
// untuk latar belakang lengkap kenapa modul ini ada (R-017, migrasi 461).
//
// ── SoD: PM PUNYA mitra:view + mitra:manage, TIDAK PUNYA mitra:daftar_hitam
//
// Migrasi 462 memisahkan izin ini secara eksplisit (bahkan ada RAISE
// EXCEPTION kalau ada role yang kebetulan dapat izin itu tanpa sengaja).
// Halaman ini karena itu TIDAK punya tombol "masukkan/keluarkan daftar
// hitam" sama sekali — beda dari `(dashboard)/mandor/mitra` yang penuh.
// Status daftar hitam tetap DITAMPILKAN (read-only, sebagai badge + sebab)
// supaya PM tahu kenapa sebuah mitra tak boleh ditetapkan menang tender —
// menyembunyikan informasinya sama sekali akan membuat penolakan sistem
// (gerbang kelayakan) terlihat seperti bug, bukan keputusan yang disengaja
// pihak lain.
// ============================================================================

import { useState } from "react";
import { api } from "@/lib/api";
import { useData, invalidasi } from "@/lib/data-cache";
import { Building2, User, Plus, Edit2, Search, Ban, Phone, Info } from "lucide-react";
import BottomSheet from "@/components/portal/BottomSheet";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";
import SegmentedTab from "@/components/portal/SegmentedTab";
import StatusBadge, { type VarianStatus } from "@/components/portal/StatusBadge";
import type { Mitra, ResponsMitra, GalatApi } from "../../_bersama/tipe";
import { pesanGalat } from "../../_bersama/tipe";

function statusMitra(m: Mitra): { varian: VarianStatus; label: string } {
  // Urutan prioritas SAMA dengan `periksaKelayakan()` server
  // (`apps/api/src/lib/gerbang-kelayakan.ts`): daftar hitam menang atas
  // tak aktif — yang lebih berat yang disebut duluan.
  if (m.daftar_hitam) return { varian: "rejected", label: "Daftar hitam" };
  if (!m.aktif) return { varian: "netral", label: "Nonaktif" };
  return { varian: "approved", label: "Layak" };
}

export default function PmMitraPage() {
  const [cari, setCari] = useState("");
  const [bentukFilter, setBentukFilter] = useState<"all" | "orang" | "badan_usaha">("all");

  const [sheetTerbuka, setSheetTerbuka] = useState(false);
  const [editMitra, setEditMitra] = useState<Mitra | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [galatForm, setGalatForm] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [form, setForm] = useState({
    bentuk: "orang" as "orang" | "badan_usaha",
    nama: "", bentuk_badan: "", npwp: "", telepon: "", email: "", alamat: "", catatan: "",
  });

  const { data, memuat: loading, galat: galatMuat, muatUlang } =
    useData<ResponsMitra>("/api/v1/mitra");
  const daftar = data?.mitra ?? [];
  const r = data?.ringkasan;

  function tampilkanToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  function openAdd() {
    setEditMitra(null);
    setForm({ bentuk: "orang", nama: "", bentuk_badan: "", npwp: "", telepon: "", email: "", alamat: "", catatan: "" });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  function openEdit(m: Mitra) {
    setEditMitra(m);
    setForm({
      bentuk: m.bentuk, nama: m.nama, bentuk_badan: m.bentuk_badan ?? "",
      npwp: m.npwp ?? "", telepon: m.telepon ?? "", email: m.email ?? "",
      alamat: m.alamat ?? "", catatan: m.catatan ?? "",
    });
    setGalatForm(null);
    setSheetTerbuka(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nama.trim()) { setGalatForm("Nama wajib diisi"); return; }
    if (form.bentuk === "badan_usaha" && !form.bentuk_badan.trim()) {
      setGalatForm("Badan usaha wajib menyebut bentuknya (PT / CV / UD / Firma)");
      return;
    }
    setSubmitting(true);
    setGalatForm(null);
    try {
      const payload = {
        bentuk: form.bentuk,
        nama: form.nama.trim(),
        bentuk_badan: form.bentuk === "badan_usaha" ? form.bentuk_badan.trim() : null,
        npwp: form.npwp.trim() || null,
        telepon: form.telepon.trim() || null,
        email: form.email.trim() || null,
        alamat: form.alamat.trim() || null,
        catatan: form.catatan.trim() || null,
      };
      if (editMitra) {
        // Bentuk tak dikirim saat edit — kontrak yang sudah terbit menyebut
        // bentuk lama, dan API sendiri tak menerima perubahan `bentuk` lewat
        // PATCH (kolom itu tak ada di daftar tambalan yang diterima server).
        const { bentuk: _bentuk, ...tambalan } = payload;
        void _bentuk;
        await api.patch(`/api/v1/mitra/${editMitra.id}`, tambalan);
      } else {
        await api.post("/api/v1/mitra", payload);
      }
      invalidasi("/api/v1/mitra");
      tampilkanToast(editMitra ? "Data mitra diperbarui" : "Mitra baru ditambahkan", true);
      setSheetTerbuka(false);
      await muatUlang();
    } catch (err) {
      setGalatForm(pesanGalat(err as GalatApi, "Gagal menyimpan"));
    } finally {
      setSubmitting(false);
    }
  }

  const filtered = daftar.filter((m) => {
    if (bentukFilter !== "all" && m.bentuk !== bentukFilter) return false;
    if (cari && !m.nama.toLowerCase().includes(cari.toLowerCase())) return false;
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Mitra</h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
            {r ? `${r.total} mitra · ${r.orang} orang · ${r.badan_usaha} badan usaha` : "Tukang, pemasok, dan penawar tender"}
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
          <Plus size={16} aria-hidden="true" /> Mitra baru
        </button>
      </div>

      {/* Kenapa layar ini ada, dinyatakan di layar — bukan cuma di kode. */}
      <div style={{
        display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
        background: "var(--info-bg)", border: "1px solid var(--info-border)",
        borderRadius: 12, fontSize: 12.5, color: "var(--on-info-bg)", lineHeight: 1.55,
      }}>
        <Info size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Satu identitas untuk pihak yang bisa muncul sebagai tukang, pemasok, maupun
          penawar tender. Status daftar hitam hanya bisa diubah lewat Master Data (bukan di sini).
        </span>
      </div>

      <label style={{ position: "relative", display: "block" }}>
        <span className="sr-only">Cari nama mitra</span>
        <Search size={15} aria-hidden="true" style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-muted)", pointerEvents: "none",
        }} />
        <input
          value={cari}
          onChange={(e) => setCari(e.target.value)}
          placeholder="Cari nama mitra…"
          style={{
            width: "100%", minHeight: 44, padding: "0 12px 0 36px", borderRadius: 12,
            border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
            background: "var(--surface)", color: "var(--text-primary)",
          }}
        />
      </label>

      <SegmentedTab
        opsi={[
          { value: "all", label: "Semua" },
          { value: "orang", label: "Orang" },
          { value: "badan_usaha", label: "Badan usaha" },
        ]}
        aktif={bentukFilter}
        onUbah={(v) => setBentukFilter(v as typeof bentukFilter)}
      />

      {loading && (
        <>
          <SkeletonCard tinggi={90} />
          <SkeletonCard tinggi={90} />
        </>
      )}

      {!loading && galatMuat && (
        <EmptyState
          icon={Building2}
          judul="Gagal memuat daftar mitra"
          deskripsi={pesanGalat(galatMuat as GalatApi, "Coba muat ulang halaman ini.")}
        />
      )}

      {!loading && !galatMuat && filtered.length === 0 && (
        <EmptyState
          icon={Building2}
          judul="Belum ada mitra yang cocok"
          deskripsi="Saringan di atas mungkin terlalu sempit, atau memang belum ada mitra terdaftar untuk bentuk ini."
        />
      )}

      {!loading && !galatMuat && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((m) => {
            const status = statusMitra(m);
            return (
              <div
                key={m.id}
                style={{
                  padding: 16, borderRadius: 16,
                  background: m.daftar_hitam ? "var(--danger-bg)" : "var(--surface)",
                  border: `1px solid ${m.daftar_hitam ? "var(--danger-border)" : "var(--border)"}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                      {m.bentuk === "badan_usaha"
                        ? <Building2 size={13} aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                        : <User size={13} aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }} />}
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                        {m.bentuk === "badan_usaha" && m.bentuk_badan ? `${m.bentuk_badan} ` : ""}{m.nama}
                      </span>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <StatusBadge status={status.varian} label={status.label} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                      {m.telepon ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <Phone size={12} aria-hidden="true" /> {m.telepon}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Belum ada kontak</span>
                      )}
                    </div>
                    {m.daftar_hitam && m.alasan_daftar_hitam && (
                      <div style={{ marginTop: 6, display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: "var(--danger)" }}>
                        <Ban size={12} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>{m.alasan_daftar_hitam}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Ubah data ${m.nama}`}
                    onClick={() => openEdit(m)}
                    style={{
                      width: 44, height: 44, borderRadius: 12, border: "1px solid var(--border)",
                      background: "var(--surface)", cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}
                  >
                    <Edit2 size={16} color="var(--text-secondary)" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BottomSheet
        terbuka={sheetTerbuka}
        onTutup={() => setSheetTerbuka(false)}
        judul={editMitra ? "Edit Mitra" : "Mitra Baru"}
      >
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label htmlFor="pm-mitra-bentuk" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Bentuk
            </label>
            <select
              id="pm-mitra-bentuk"
              value={form.bentuk}
              // Bentuk TIDAK bisa diubah sesudah tersimpan — kontrak yang sudah
              // terbit menyebut bentuk lama. Server sendiri menolak field ini
              // di PATCH.
              disabled={!!editMitra}
              onChange={(e) => setForm((f) => ({ ...f, bentuk: e.target.value as "orang" | "badan_usaha" }))}
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, color: "var(--text-primary)",
                background: "var(--surface)", boxSizing: "border-box",
                opacity: editMitra ? 0.6 : 1,
              }}
            >
              <option value="orang">Orang — mandor borongan, tukang</option>
              <option value="badan_usaha">Badan usaha — PT / CV / UD</option>
            </select>
            {editMitra && (
              <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                Bentuk tak bisa diubah — kontrak yang sudah terbit menyebutnya.
              </span>
            )}
          </div>

          <div>
            <label htmlFor="pm-mitra-nama" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Nama *
            </label>
            <input
              id="pm-mitra-nama"
              value={form.nama}
              onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
              placeholder="Nama lengkap / nama perusahaan"
              style={{
                width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                background: "var(--surface)", color: "var(--text-primary)",
              }}
            />
          </div>

          {form.bentuk === "badan_usaha" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label htmlFor="pm-mitra-badan" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                  Bentuk badan *
                </label>
                <input
                  id="pm-mitra-badan"
                  value={form.bentuk_badan}
                  onChange={(e) => setForm((f) => ({ ...f, bentuk_badan: e.target.value }))}
                  placeholder="PT / CV / UD"
                  style={{
                    width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                    border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                    background: "var(--surface)", color: "var(--text-primary)",
                  }}
                />
              </div>
              <div>
                <label htmlFor="pm-mitra-npwp" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                  NPWP
                </label>
                <input
                  id="pm-mitra-npwp"
                  value={form.npwp}
                  onChange={(e) => setForm((f) => ({ ...f, npwp: e.target.value }))}
                  style={{
                    width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                    border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                    background: "var(--surface)", color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <label htmlFor="pm-mitra-telepon" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Telepon
              </label>
              <input
                id="pm-mitra-telepon"
                value={form.telepon}
                onChange={(e) => setForm((f) => ({ ...f, telepon: e.target.value }))}
                placeholder="0812..."
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                  background: "var(--surface)", color: "var(--text-primary)",
                }}
              />
            </div>
            <div>
              <label htmlFor="pm-mitra-email" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                id="pm-mitra-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={{
                  width: "100%", minHeight: 44, padding: "0 12px", borderRadius: 12,
                  border: "1px solid var(--border)", fontSize: 14, boxSizing: "border-box",
                  background: "var(--surface)", color: "var(--text-primary)",
                }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="pm-mitra-alamat" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Alamat
            </label>
            <textarea
              id="pm-mitra-alamat"
              value={form.alamat}
              onChange={(e) => setForm((f) => ({ ...f, alamat: e.target.value }))}
              rows={2}
              style={{
                width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--border)",
                fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical",
                background: "var(--surface)", color: "var(--text-primary)",
              }}
            />
          </div>

          <div>
            <label htmlFor="pm-mitra-catatan" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
              Catatan (opsional)
            </label>
            <textarea
              id="pm-mitra-catatan"
              value={form.catatan}
              onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
              rows={2}
              style={{
                width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--border)",
                fontSize: 14, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical",
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
              {submitting ? "Menyimpan…" : editMitra ? "Simpan Perubahan" : "Tambah Mitra"}
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
