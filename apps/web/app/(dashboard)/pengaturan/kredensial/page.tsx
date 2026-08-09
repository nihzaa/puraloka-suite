"use client";

/**
 * PENGATURAN → KREDENSIAL
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU ATURAN YANG MEMBENTUK SELURUH HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nilai kredensial TIDAK PERNAH sampai ke browser. Konsekuensinya bukan
 * kosmetik, melainkan menentukan bentuk tiap interaksi:
 *
 *   • Kolom isian selalu MULAI KOSONG. Tak ada "muat nilai sekarang", karena
 *     nilainya memang tak pernah dikirim. Placeholder-lah yang menunjukkan
 *     ada isinya (`••••cdef`), bukan value.
 *   • Yang terlihat cuma 4 karakter terakhir.
 *   • Verifikasi lewat tombol "Uji Koneksi", bukan dengan membaca nilainya.
 *
 * Ini yang membuat aturannya berlaku sungguhan alih-alih disembunyikan di CSS
 * yang bisa diakali lewat inspect element.
 *
 * ── Kenapa SELURUH katalog ditampilkan, termasuk yang belum disetel
 *
 * Kalau halaman ini hanya menampilkan yang sudah ada barisnya, admin tak punya
 * cara tahu kunci apa yang DIBUTUHKAN sistem sampai sesuatu gagal — dan
 * kegagalan integrasi di repo ini terbukti bisa senyap berbulan-bulan.
 *
 * ── Kenapa yang kosong tidak diwarnai peringatan
 *
 * Sebagian besar kunci memang opsional (penyedia AI alternatif, WhatsApp
 * sebelum dipakai). Mewarnai semuanya oranye melatih mata mengabaikan warna
 * peringatan — lalu yang benar-benar penting ikut tak terlihat.
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import { api } from "@/lib/api";
import {
  KeyRound, Trash2, Info, CheckCircle2, XCircle, Loader2, ExternalLink, ShieldAlert,
} from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "var(--naik-1)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "var(--pad-baris)",
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 13,
  outline: "none",
  background: "var(--surface)",
  color: C.text,
  boxSizing: "border-box",
  fontFamily: "inherit",
};

type Sumber = "tenant" | "env" | "tidak-ada";

interface Kredensial {
  kunci: string;
  label: string;
  keterangan: string;
  tautan: string | null;
  grup: string;
  empat_akhir: string | null;
  sumber: Sumber;
  punya_jatuhan_env: boolean;
  catatan: string | null;
  diperbarui_pada: string | null;
}

interface HasilUji {
  memuat?: boolean;
  ok?: boolean;
  pesan?: string;
  yang_diuji?: string;
}

const SUMBER_META: Record<Sumber, { teks: string; warna: string; latar: string }> = {
  tenant: { teks: "Dari UI", warna: "var(--success)", latar: "var(--success-bg)" },
  env: { teks: "Dari server", warna: C.mid, latar: "var(--surface-subtle)" },
  "tidak-ada": { teks: "Belum disetel", warna: C.muted, latar: "var(--surface-subtle)" },
};

function hasPerm(key: string): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch {
    return false;
  }
}

export default function KredensialPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  const bolehKelola = hasPerm("settings:credentials:manage");

  const [daftar, setDaftar] = useState<Kredensial[]>([]);
  const [enkripsiSiap, setEnkripsiSiap] = useState(true);
  const [memuat, setMemuat] = useState(true);
  const [draf, setDraf] = useState<Record<string, string>>({});
  const [uji, setUji] = useState<Record<string, HasilUji>>({});
  const [sedangSimpan, setSedangSimpan] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await api.get<{ data: Kredensial[]; enkripsi_siap: boolean }>(
        "/api/v1/kredensial",
      );
      setDaftar(r.data.data ?? []);
      setEnkripsiSiap(r.data.enkripsi_siap !== false);
    } catch {
      setToast({ tipe: "err", pesan: "Gagal memuat daftar kredensial" });
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    muat();
  }, [muat]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const pesanGalat = (e: unknown, cadangan: string) => {
    const r = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
    return r || cadangan;
  };

  async function simpan(kunci: string) {
    const nilai = (draf[kunci] ?? "").trim();
    if (!nilai) return;
    setSedangSimpan(kunci);
    try {
      await api.put(`/api/v1/kredensial/${kunci}`, { nilai });
      // Kolom dikosongkan kembali — nilainya tidak pernah bertahan di layar.
      setDraf((d) => ({ ...d, [kunci]: "" }));
      setUji((u) => ({ ...u, [kunci]: {} }));
      setToast({ tipe: "ok", pesan: "Kredensial tersimpan" });
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Gagal menyimpan kredensial") });
    } finally {
      setSedangSimpan(null);
    }
  }

  async function hapus(kunci: string, label: string) {
    if (!confirm(`Hapus kredensial "${label}"?\n\nIntegrasi yang memakainya akan berhenti bekerja kecuali server punya nilai cadangan.`)) return;
    try {
      const r = await api.delete<{ jatuh_ke_env: boolean }>(`/api/v1/kredensial/${kunci}`);
      setToast({
        tipe: "ok",
        pesan: r.data.jatuh_ke_env
          ? "Dihapus. Sistem kembali memakai nilai dari server."
          : "Kredensial dihapus.",
      });
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Gagal menghapus kredensial") });
    }
  }

  async function ujiKoneksi(kunci: string) {
    setUji((u) => ({ ...u, [kunci]: { memuat: true } }));
    const diketik = (draf[kunci] ?? "").trim();
    try {
      const r = await api.post<HasilUji>(
        `/api/v1/kredensial/${kunci}/uji`,
        diketik ? { nilai: diketik } : {},
      );
      setUji((u) => ({ ...u, [kunci]: { ...r.data, memuat: false } }));
    } catch (e) {
      setUji((u) => ({
        ...u,
        [kunci]: { memuat: false, ok: false, pesan: pesanGalat(e, "Gagal menghubungi server") },
      }));
    }
  }

  const grup = Array.from(new Set(daftar.map((d) => d.grup)));

  return (
    // `--w-form`, bukan `--w-page`: isinya satu kolom kartu yang tiap barisnya
    // memuat kalimat penjelas. Di `--w-page` (1280) kalimat-kalimat itu
    // memanjang melewati ~75 karakter dan jadi melelahkan dibaca — dan halaman
    // ini justru menuntut dibaca, bukan dipindai.
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-form)",
        margin: "0 auto",
      }}
    >
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 60,
            padding: "var(--pad-kartu)", borderRadius: 8, fontSize: 13,
            background: toast.tipe === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.tipe === "ok" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${toast.tipe === "ok" ? "var(--success)" : "var(--danger)"}`,
          }}
        >
          {toast.pesan}
        </div>
      )}

      <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
          judul="Kredensial"
          keterangan="Kunci API penyedia AI, WhatsApp, dan email. Tersimpan terenkripsi dan tak pernah ditampilkan kembali."
          ikon={<KeyRound size={19} />}
        />
      </div>

      {!enkripsiSiap && (
        <div
          style={{
            ...card, padding: 14, marginBottom: 16, display: "flex", gap: 10,
            borderColor: "var(--danger)", background: "var(--danger-bg)",
          }}
        >
          <ShieldAlert size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            <strong>Penyimpanan kredensial dinonaktifkan.</strong> Kunci enkripsi server
            (<code>CREDENTIAL_ENCRYPTION_KEY</code>) belum disetel. Menyimpan ditolak dengan
            sengaja — lebih baik gagal jelas daripada menyimpan sesuatu yang tak bisa dibuka lagi.
          </div>
        </div>
      )}

      {!bolehKelola && (
        <div style={{ ...card, padding: "var(--pad-kartu)", marginBottom: 16, display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
            Anda bisa melihat kredensial mana yang terpasang, tetapi tidak mengubahnya.
            Butuh kapabilitas <code>settings:credentials:manage</code>.
          </div>
        </div>
      )}

      {memuat ? (
        <div style={{ ...card, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : (
        grup.map((namaGrup) => (
          <section key={namaGrup} style={{ marginBottom: 24 }}>
            <h2
              style={{
                fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                textTransform: "uppercase", color: C.muted, marginBottom: 8,
              }}
            >
              {namaGrup}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {daftar
                .filter((d) => d.grup === namaGrup)
                .map((k) => {
                  const meta = SUMBER_META[k.sumber];
                  const nilaiDraf = draf[k.kunci] ?? "";
                  const hasil = uji[k.kunci];
                  const idInput = `kred-${k.kunci}`;

                  return (
                    <div key={k.kunci} style={{ ...card, padding: "var(--pad-kartu)" }}>
                      <div
                        style={{
                          display: "flex", alignItems: "baseline",
                          justifyContent: "space-between", gap: 12, marginBottom: 4,
                        }}
                      >
                        <label
                          htmlFor={idInput}
                          style={{ fontSize: 14, fontWeight: 600, color: C.text }}
                        >
                          {k.label}
                        </label>
                        <span
                          style={{
                            fontSize: 11, padding: "var(--pad-lencana)", borderRadius: 999,
                            whiteSpace: "nowrap",
                            color: meta.warna, background: meta.latar,
                            border: `1px solid ${meta.warna}`,
                          }}
                        >
                          {meta.teks}
                        </span>
                      </div>

                      <p style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.6, margin: "0 0 10px" }}>
                        {k.keterangan}
                        {k.tautan && (
                          <>
                            {" "}
                            <a
                              href={k.tautan}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: C.aksen, textDecoration: "none",
                                display: "inline-flex", alignItems: "center", gap: 3,
                              }}
                            >
                              Cara memperolehnya
                              <ExternalLink size={11} aria-hidden="true" />
                            </a>
                          </>
                        )}
                      </p>

                      {k.empat_akhir && (
                        <div style={{ fontSize: 12, color: C.mid, marginBottom: 8 }}>
                          Tersimpan:{" "}
                          <span style={{ fontFamily: "var(--font-mono, monospace)", color: C.text }}>
                            ••••{k.empat_akhir}
                          </span>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <input
                          id={idInput}
                          type="password"
                          autoComplete="off"
                          spellCheck={false}
                          disabled={!bolehKelola}
                          value={nilaiDraf}
                          onChange={(e) =>
                            setDraf((d) => ({ ...d, [k.kunci]: e.target.value }))
                          }
                          // Placeholder, BUKAN value: nilainya memang tak pernah
                          // dikirim ke browser.
                          placeholder={
                            k.empat_akhir
                              ? `••••${k.empat_akhir} — tempel nilai baru untuk mengganti`
                              : "Belum disetel"
                          }
                          style={{ ...inputStyle, flex: "1 1 260px" }}
                        />

                        <button
                          type="button"
                          onClick={() => simpan(k.kunci)}
                          disabled={!bolehKelola || !nilaiDraf.trim() || !enkripsiSiap || sedangSimpan === k.kunci}
                          style={{
                            padding: "var(--pad-tombol)", borderRadius: 6, fontSize: 13, fontWeight: 500,
                            border: "none", cursor: "pointer",
                            background: C.aksen, color: "var(--on-aksen)",
                            opacity: !bolehKelola || !nilaiDraf.trim() || !enkripsiSiap ? 0.45 : 1,
                          }}
                        >
                          {sedangSimpan === k.kunci ? "Menyimpan…" : "Simpan"}
                        </button>

                        <button
                          // `type="button"` WAJIB — tanpanya tombol ini ikut
                          // men-submit form terdekat dan malah menyimpan.
                          type="button"
                          onClick={() => ujiKoneksi(k.kunci)}
                          disabled={!bolehKelola || hasil?.memuat || (k.sumber === "tidak-ada" && !nilaiDraf.trim())}
                          style={{
                            padding: "var(--pad-tombol)", borderRadius: 6, fontSize: 13,
                            border: `1px solid ${C.border}`, cursor: "pointer",
                            background: "var(--surface)", color: C.text,
                          }}
                        >
                          {hasil?.memuat ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <Loader2 size={13} className="berputar" aria-hidden="true" />
                              Menguji…
                            </span>
                          ) : (
                            "Uji Koneksi"
                          )}
                        </button>

                        {k.sumber === "tenant" && bolehKelola && (
                          <button
                            type="button"
                            onClick={() => hapus(k.kunci, k.label)}
                            aria-label={`Hapus kredensial ${k.label}`}
                            style={{
                              padding: "var(--pad-tombol-kcl)", borderRadius: 6,
                              border: `1px solid ${C.border}`, cursor: "pointer",
                              background: "var(--surface)", color: "var(--danger)",
                            }}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {/* Menyatakan APA yang akan diuji — nilai yang sedang diketik
                          atau yang tersimpan. Tanpa ini, hasil "valid" ambigu. */}
                      {bolehKelola && (
                        <p style={{ fontSize: 11.5, color: C.muted, margin: "6px 0 0" }}>
                          {nilaiDraf.trim()
                            ? "Uji Koneksi akan menguji nilai yang sedang diketik, tanpa menyimpannya."
                            : k.sumber === "tidak-ada"
                              ? "Tempel nilai lebih dulu untuk mengujinya."
                              : "Uji Koneksi akan menguji nilai yang sedang berlaku."}
                        </p>
                      )}

                      {hasil && !hasil.memuat && hasil.pesan && (
                        <div
                          role="status"
                          style={{
                            marginTop: 8, display: "flex", gap: 6, alignItems: "flex-start",
                            fontSize: 12.5,
                            color: hasil.ok ? "var(--success)" : "var(--danger)",
                          }}
                        >
                          {hasil.ok ? (
                            <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                          ) : (
                            <XCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
                          )}
                          <span>{hasil.pesan}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
