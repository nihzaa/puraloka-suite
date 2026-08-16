"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Building2, Plus, Users, AlertTriangle, Check, X, ArrowRightLeft, Building } from "lucide-react";

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

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";


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

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask. 403 tetap
    ditangani sebagai keadaan TERSENDIRI (bukan galat generik) — axios
    melampirkan `.response` ke `Error`-nya, jadi bisa dibaca dari `galat`.
  */
  const { data, memuat, galat: galatMuat, muatUlang } = useData<{ data: BadanUsaha[] }>("/api/v1/companies");
  const muat = async () => { await muatUlang(); };
  const daftar = data?.data ?? [];
  const ditolak = (galatMuat as unknown as { response?: { status?: number } } | null)?.response?.status === 403;
  // Galat MUAT generik (BUKAN 403 — yang itu ditangani sebagai `ditolak`)
  // dipisah dari `pesan` (dipakai untuk galat/sukses AKSI membuat badan
  // usaha) — satu state untuk keduanya membuat berhasil membuat menghapus
  // pesan gagal memuat.
  const galatMuatUmum = galatMuat && !ditolak ? "Gagal memuat daftar badan usaha." : null;

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
        <div style={{ ...GAYA_KARTU, padding: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
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

  if (galatMuatUmum) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <div role="alert" style={{ ...GAYA_KARTU, padding: 20, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle size={18} style={{ color: C.red, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: C.mid, margin: 0, lineHeight: 1.6 }}>
            {galatMuatUmum}{" "}
            <button onClick={() => void muat()} style={{ color: C.navy, background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", textDecoration: "underline" }}>
              Coba lagi.
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <KepalaHalaman judul="Badan Usaha" keterangan="PT/CV dalam grup usaha Anda. Setiap badan usaha punya proyek, keuangan,
            dan penomoran dokumen yang terpisah penuh."         ikon={<Building size={19} />}
      />
        </div>
        {!formTerbuka && (
          <button
            onClick={() => setFormTerbuka(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 10, border: "none",
              background: "var(--grad-aksen)", color: C.onNavy, fontSize: 13, fontWeight: 600,
              cursor: "pointer", flexShrink: 0,
            }}
          >
            <Plus size={15} /> Tambah badan usaha
          </button>
        )}
      </div>

      {pesan && (
        <div style={{
          ...GAYA_KARTU,
          padding: "12px 12px", marginBottom: 14,
          display: "flex", alignItems: "center", gap: 8,
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
        <form onSubmit={simpan} style={{ ...GAYA_KARTU, padding: 20, marginBottom: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
            Badan usaha baru
          </h2>
          <p style={{ fontSize: 12, color: C.muted, margin: "0 0 16px", lineHeight: 1.6 }}>
            Badan usaha baru dimulai kosong — tanpa proyek, klien, atau transaksi.
            Katalog AHSP nasional tetap tersedia, jadi estimasi bisa langsung dipakai.
          </p>

          <div style={{ display: "grid", gap: 12 }}>
            <Kolom label="Nama badan usaha" wajib>
              <input className="isian-fokus"
                value={nama} onChange={(e) => namaBerubah(e.target.value)}
                placeholder="Puraloka Karya" required style={GAYA_ISIAN}
              />
            </Kolom>

            <Kolom label="Nama badan hukum" petunjuk="Nama lengkap sesuai akta. Dipakai di kontrak & invoice.">
              <input className="isian-fokus"
                value={namaHukum} onChange={(e) => setNamaHukum(e.target.value)}
                placeholder="PT Puraloka Karya Nusantara" style={GAYA_ISIAN}
              />
            </Kolom>

            <Kolom label="Kode" wajib petunjuk="Huruf kecil, angka, dan tanda hubung. Dipakai internal, tidak tampil di dokumen.">
              <input className="isian-fokus"
                value={kode}
                onChange={(e) => { setKode(e.target.value); setKodeDisentuh(true); }}
                placeholder="puraloka-karya" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
                style={GAYA_ISIAN}
              />
            </Kolom>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Kolom label="Awalan nomor invoice" petunjuk="Contoh: INVK/2026/01/001">
                <input className="isian-fokus" value={prefix} onChange={(e) => setPrefix(e.target.value)} style={GAYA_ISIAN} />
              </Kolom>
              <Kolom label="NPWP">
                <input className="isian-fokus" value={npwp} onChange={(e) => setNpwp(e.target.value)} placeholder="Opsional" style={GAYA_ISIAN} />
              </Kolom>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button type="submit" disabled={menyimpan} style={{
              padding: "8px 16px", borderRadius: 10, border: "none",
              background: "var(--grad-aksen)", color: C.onNavy, fontSize: 13, fontWeight: 600,
              cursor: menyimpan ? "wait" : "pointer", opacity: menyimpan ? 0.7 : 1,
            }}>
              {menyimpan ? "Membuat…" : "Buat badan usaha"}
            </button>
            <button type="button" onClick={() => { setFormTerbuka(false); setPesan(null); }} style={{
              padding: "8px 16px", borderRadius: 10,
              border: `1px solid ${C.border}`, background: "transparent",
              color: C.mid, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Batal
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {daftar.map((b) => (
          <div key={b.id} style={{ ...GAYA_KARTU, padding: "16px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: "var(--surface-subtle)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <Building2 size={17} style={{ color: C.navy }} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{b.name}</span>
                {b.is_akar && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 6,
                    background: "var(--surface-subtle)", color: C.mid,
                  }}>
                    induk
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                {b.legal_name && b.legal_name !== b.name ? `${b.legal_name} · ` : ""}
                {b.code}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, color: C.mid }}>
              <Users size={14} />
              <span style={{ fontSize: 12 }}>{b.jumlah_anggota}</span>
            </div>
          </div>
        ))}
      </div>

      {daftar.length > 1 && (
        <p style={{
          fontSize: 12, color: C.muted, marginTop: 16,
          display: "flex", alignItems: "center", gap: 6, lineHeight: 1.6,
        }}>
          <ArrowRightLeft size={14} style={{ flexShrink: 0 }} />
          Berpindah antar badan usaha lewat pemilih di bagian atas layar.
        </p>
      )}
    </div>
  );
}


function Kolom({
  label, petunjuk, wajib, children,
}: {
  label: string; petunjuk?: string; wajib?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{
        display: "block", fontSize: 12, fontWeight: 600,
        color: C.text, marginBottom: 5,
      }}>
        {label}
        {wajib && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {petunjuk && (
        <p style={{ fontSize: 11, color: C.muted, margin: "5px 0 0", lineHeight: 1.5 }}>
          {petunjuk}
        </p>
      )}
    </div>
  );
}
