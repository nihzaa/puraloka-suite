"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Building2, Plus, Users, AlertTriangle, Check, X, ArrowRightLeft } from "lucide-react";

// ============================================================
// T9 — KELOLA BADAN USAHA (L2 penuh dari UI).
//
// Sebelum halaman ini, mendirikan PT/CV kedua butuh INSERT manual ke database.
//
// Halaman ini hanya bisa dibuka PEMILIK GRUP (keputusan founder, ADR-011-T9
// §3 Opsi B) — bukan pemegang permission tertentu. Kalau bukan pemilik, API
// membalas 403 dan halaman menampilkan penjelasan, bukan layar kosong yang
// membingungkan.
// ============================================================

const C = {
  navy: "var(--navy)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)", redBorder: "var(--danger-border)",
  amber: "var(--warning)", amberBg: "var(--warning-bg)", amberBorder: "var(--warning-border)",
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

interface BadanUsaha {
  id: string;
  code: string;
  name: string;
  legal_name: string | null;
  invoice_prefix: string | null;
  parent_company_id: string | null;
  is_active: boolean;
  jumlah_anggota: number;
  is_akar: boolean;
}

export default function PerusahaanPage() {
  const [daftar, setDaftar] = useState<BadanUsaha[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [ditolak, setDitolak] = useState(false);
  const [formTerbuka, setFormTerbuka] = useState(false);
  const [pesan, setPesan] = useState<{ tipe: "ok" | "salah"; teks: string } | null>(null);

  const [nama, setNama] = useState("");
  const [namaHukum, setNamaHukum] = useState("");
  const [kode, setKode] = useState("");
  const [prefix, setPrefix] = useState("INV");
  const [npwp, setNpwp] = useState("");
  const [menyimpan, setMenyimpan] = useState(false);
  // Kode berhenti mengikuti nama begitu pengguna mengetiknya sendiri —
  // supaya ketikannya tak tertimpa tiap kali nama disunting.
  const [kodeDisentuh, setKodeDisentuh] = useState(false);

  async function muat() {
    setMemuat(true);
    try {
      const r = await api.get<{ data: BadanUsaha[] }>("/api/v1/companies");
      setDaftar(r.data.data ?? []);
      setDitolak(false);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) setDitolak(true);
      else setPesan({ tipe: "salah", teks: "Gagal memuat daftar badan usaha" });
    } finally {
      setMemuat(false);
    }
  }

  useEffect(() => { muat(); }, []);

  // Kode disarankan dari nama, tapi tetap bisa diubah: yang mengetik nama
  // "PT Puraloka Karya Nusantara" tak perlu memikirkan slug-nya sendiri.
  function namaBerubah(v: string) {
    setNama(v);
    if (!kodeDisentuh) {
      setKode(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40));
    }
  }

  async function simpan(e: React.FormEvent) {
    e.preventDefault();
    setMenyimpan(true);
    setPesan(null);
    try {
      await api.post("/api/v1/companies", {
        name: nama.trim(),
        legal_name: namaHukum.trim() || undefined,
        code: kode.trim(),
        invoice_prefix: prefix.trim() || "INV",
        npwp: npwp.trim() || undefined,
      });
      setPesan({ tipe: "ok", teks: `Badan usaha "${nama}" berhasil dibuat` });
      setNama(""); setNamaHukum(""); setKode(""); setPrefix("INV"); setNpwp("");
      setKodeDisentuh(false); setFormTerbuka(false);
      await muat();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setPesan({
        tipe: "salah",
        teks: err?.response?.data?.error ?? "Gagal membuat badan usaha",
      });
    } finally {
      setMenyimpan(false);
    }
  }

  if (memuat) {
    return <div style={{ padding: 24, color: C.muted }}>Memuat…</div>;
  }

  if (ditolak) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <div style={{ ...card, padding: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle size={18} style={{ color: C.amber, flexShrink: 0, marginTop: 2 }} />
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 6px" }}>
              Halaman ini khusus pemilik grup usaha
            </h2>
            <p style={{ fontSize: 13, color: C.mid, margin: 0, lineHeight: 1.6 }}>
              Mendirikan badan usaha baru adalah tindakan di atas semua perusahaan,
              jadi wewenangnya tidak mengikuti peran di satu perusahaan. Hubungi
              pemilik grup usaha bila Anda perlu menambah badan usaha.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
            Badan Usaha
          </h1>
          <p style={{ fontSize: 13, color: C.mid, margin: 0 }}>
            PT/CV dalam grup usaha Anda. Setiap badan usaha punya proyek, keuangan,
            dan penomoran dokumen yang terpisah penuh.
          </p>
        </div>
        {!formTerbuka && (
          <button
            onClick={() => setFormTerbuka(true)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 14px", borderRadius: 9, border: "none",
              background: C.navy, color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <Plus size={15} /> Tambah badan usaha
          </button>
        )}
      </div>

      {pesan && (
        <div style={{
          ...card,
          padding: "11px 14px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 9,
          background: pesan.tipe === "ok" ? C.greenBg : C.redBg,
          borderColor: pesan.tipe === "ok" ? C.green : C.redBorder,
        }}>
          {pesan.tipe === "ok"
            ? <Check size={15} style={{ color: C.green, flexShrink: 0 }} />
            : <X size={15} style={{ color: C.red, flexShrink: 0 }} />}
          <span style={{ fontSize: 13, color: C.text }}>{pesan.teks}</span>
        </div>
      )}

      {formTerbuka && (
        <form onSubmit={simpan} style={{ ...card, padding: 20, marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
            Badan usaha baru
          </h2>
          <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 16px", lineHeight: 1.6 }}>
            Badan usaha baru dimulai kosong — tanpa proyek, klien, atau transaksi.
            Katalog AHSP nasional tetap tersedia, jadi estimasi bisa langsung dipakai.
          </p>

          <div style={{ display: "grid", gap: 14 }}>
            <Kolom label="Nama badan usaha" wajib>
              <input
                value={nama} onChange={(e) => namaBerubah(e.target.value)}
                placeholder="Puraloka Karya" required style={inputStyle}
              />
            </Kolom>

            <Kolom label="Nama badan hukum" petunjuk="Nama lengkap sesuai akta. Dipakai di kontrak & invoice.">
              <input
                value={namaHukum} onChange={(e) => setNamaHukum(e.target.value)}
                placeholder="PT Puraloka Karya Nusantara" style={inputStyle}
              />
            </Kolom>

            <Kolom label="Kode" wajib petunjuk="Huruf kecil, angka, dan tanda hubung. Dipakai internal, tidak tampil di dokumen.">
              <input
                value={kode}
                onChange={(e) => { setKode(e.target.value); setKodeDisentuh(true); }}
                placeholder="puraloka-karya" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
                style={inputStyle}
              />
            </Kolom>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <Kolom label="Awalan nomor invoice" petunjuk="Contoh: INVK/2026/01/001">
                <input value={prefix} onChange={(e) => setPrefix(e.target.value)} style={inputStyle} />
              </Kolom>
              <Kolom label="NPWP">
                <input value={npwp} onChange={(e) => setNpwp(e.target.value)} placeholder="Opsional" style={inputStyle} />
              </Kolom>
            </div>
          </div>

          <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
            <button type="submit" disabled={menyimpan} style={{
              padding: "9px 16px", borderRadius: 9, border: "none",
              background: C.navy, color: "#fff", fontSize: 13, fontWeight: 600,
              cursor: menyimpan ? "wait" : "pointer", opacity: menyimpan ? 0.7 : 1,
            }}>
              {menyimpan ? "Membuat…" : "Buat badan usaha"}
            </button>
            <button type="button" onClick={() => { setFormTerbuka(false); setPesan(null); }} style={{
              padding: "9px 16px", borderRadius: 9,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Batal
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {daftar.map((b) => (
          <div key={b.id} style={{ ...card, padding: "15px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: "var(--surface-subtle)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <Building2 size={17} style={{ color: C.navy }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{b.name}</span>
                {b.is_akar && (
                  <span style={{
                    fontSize: 10.5, fontWeight: 600, padding: "2px 7px", borderRadius: 5,
                    background: "var(--surface-subtle)", color: C.mid,
                  }}>
                    induk
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
                {b.legal_name && b.legal_name !== b.name ? `${b.legal_name} · ` : ""}
                {b.code}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, color: C.mid }}>
              <Users size={14} />
              <span style={{ fontSize: 12.5 }}>{b.jumlah_anggota}</span>
            </div>
          </div>
        ))}
      </div>

      {daftar.length > 1 && (
        <p style={{
          fontSize: 12.5, color: C.muted, marginTop: 16,
          display: "flex", alignItems: "center", gap: 7, lineHeight: 1.6,
        }}>
          <ArrowRightLeft size={14} style={{ flexShrink: 0 }} />
          Berpindah antar badan usaha lewat pemilih di bagian atas layar.
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 11px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: "var(--surface)",
  fontSize: 13, color: C.text, boxSizing: "border-box",
};

function Kolom({
  label, petunjuk, wajib, children,
}: {
  label: string; petunjuk?: string; wajib?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{
        display: "block", fontSize: 12.5, fontWeight: 600,
        color: C.text, marginBottom: 5,
      }}>
        {label}
        {wajib && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {petunjuk && (
        <p style={{ fontSize: 11.5, color: C.muted, margin: "5px 0 0", lineHeight: 1.5 }}>
          {petunjuk}
        </p>
      )}
    </div>
  );
}
