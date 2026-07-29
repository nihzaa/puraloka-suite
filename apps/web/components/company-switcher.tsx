"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";

// ============================================================
// T7 — COMPANY SWITCHER.
//
// Menampilkan perusahaan aktif dan memungkinkan berpindah ke perusahaan lain
// yang menjadi hak user. Daftarnya datang dari `GET /api/v1/my/companies` —
// sumbernya keanggotaan user, bukan seluruh isi tabel companies.
//
// Berpindah = menyimpan pilihan lalu MEMUAT ULANG halaman. Terlihat kasar
// dibanding memperbarui state, tapi disengaja: hampir setiap layar sudah
// terlanjur memuat data perusahaan lama, dan memperbaruinya sebagian akan
// menampilkan campuran dua perusahaan di satu layar — bentuk kesalahan paling
// berbahaya di aplikasi multi-tenant, karena tampak wajar.
//
// SENGAJA TIDAK DITAMPILKAN saat user hanya punya satu perusahaan: kontrol yang
// tak punya pilihan lain hanyalah kebisingan di layar.
// ============================================================

interface Company {
  id: string;
  code: string;
  name: string;
  logo_url: string | null;
  is_default: boolean;
  is_active: boolean;
}

export function CompanySwitcher() {
  const [daftar, setDaftar] = useState<Company[]>([]);
  const [aktifId, setAktifId] = useState<string | null>(null);
  const [terbuka, setTerbuka] = useState(false);
  const [posisi, setPosisi] = useState({ top: 0, left: 0 });
  const tombolRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let batal = false;
    api
      .get("/api/v1/my/companies")
      .then((r) => {
        if (batal) return;
        setDaftar(r.data?.data ?? []);
        setAktifId(r.data?.active_company_id ?? null);
      })
      .catch(() => {
        // Gagal memuat daftar bukan alasan merusak topbar — switcher-nya saja
        // yang tidak muncul. Tak ada pesan error: user yang punya satu
        // perusahaan pun tidak melihat kontrol ini, jadi ketiadaannya normal.
      });
    return () => {
      batal = true;
    };
  }, []);

  // Tutup saat klik di luar atau tekan Esc.
  useEffect(() => {
    if (!terbuka) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTerbuka(false);
    const onClick = (e: MouseEvent) => {
      if (!tombolRef.current?.contains(e.target as Node)) setTerbuka(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [terbuka]);

  // Satu perusahaan (atau belum termuat) → tak ada yang bisa dipilih.
  if (daftar.length < 2) return null;

  const aktif = daftar.find((k) => k.id === aktifId) ?? daftar[0];

  function buka() {
    const r = tombolRef.current?.getBoundingClientRect();
    if (r) setPosisi({ top: r.bottom + 6, left: r.left });
    setTerbuka((v) => !v);
  }

  function pindah(id: string) {
    if (id === aktifId) return setTerbuka(false);
    // Disimpan sebelum reload; interceptor api.ts membacanya untuk header
    // x-company-id di setiap request berikutnya.
    localStorage.setItem("puraloka_company_id", id);
    window.location.reload();
  }

  return (
    <>
      <button
        ref={tombolRef}
        onClick={buka}
        aria-haspopup="listbox"
        aria-expanded={terbuka}
        aria-label={`Perusahaan aktif: ${aktif.name}. Klik untuk berpindah.`}
        style={{
          display: "flex", alignItems: "center", gap: 7,
          height: 34, padding: "0 9px 0 10px",
          borderRadius: 8,
          background: terbuka ? "var(--surface-subtle)" : "transparent",
          border: "1px solid var(--border)",
          cursor: "pointer", fontSize: 13, fontWeight: 600,
          color: "var(--text-primary)", transition: "all 0.15s",
          maxWidth: 220,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--navy)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        <Building2 size={14} style={{ flexShrink: 0, color: "var(--navy)" }} />
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {aktif.name}
        </span>
        <ChevronDown
          size={13}
          style={{
            flexShrink: 0, color: "var(--text-muted)",
            transform: terbuka ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {terbuka && typeof document !== "undefined" && createPortal(
        <div
          role="listbox"
          aria-label="Pilih perusahaan"
          style={{
            position: "fixed", top: posisi.top, left: posisi.left, zIndex: 60,
            minWidth: 240, padding: 5,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          <div style={{
            padding: "6px 9px 7px", fontSize: 11, fontWeight: 600,
            color: "var(--text-muted)", textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            Perusahaan
          </div>

          {daftar.map((k) => {
            const ini = k.id === aktifId;
            return (
              <button
                key={k.id}
                role="option"
                aria-selected={ini}
                onClick={() => pindah(k.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  width: "100%", padding: "8px 9px",
                  borderRadius: 7, border: "none",
                  background: ini ? "var(--surface-subtle)" : "transparent",
                  cursor: "pointer", textAlign: "left",
                  fontSize: 13, color: "var(--text-primary)",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!ini) e.currentTarget.style.background = "var(--surface-subtle)";
                }}
                onMouseLeave={(e) => {
                  if (!ini) e.currentTarget.style.background = "transparent";
                }}
              >
                <Building2 size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                <span style={{
                  flex: 1, fontWeight: ini ? 600 : 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {k.name}
                </span>
                {ini && <Check size={14} style={{ flexShrink: 0, color: "var(--navy)" }} />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}
