"use client";

/**
 * PENGATURAN → KANAL WHATSAPP
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA VERIFIKASI JADI PUSAT HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Nomor yang terdaftar tanpa diverifikasi TIDAK bisa dipakai — dan itu bukan
 * detail teknis yang bisa disembunyikan. Siapa pun bisa mengetik nomor orang
 * lain; tanpa verifikasi, mendaftarkan nomor atasan sudah cukup untuk membaca
 * data yang jadi wewenangnya.
 *
 * Jadi status verifikasi adalah hal PERTAMA yang terlihat di tiap baris, bukan
 * lencana kecil di ujung. Admin yang melihat "menunggu verifikasi" tahu
 * nomornya belum berfungsi, alih-alih menunggu notifikasi yang tak akan datang.
 *
 * ── Kenapa kesiapan kanal dinyatakan di atas
 *
 * Tombol "Kirim kode" yang gagal setelah diklik memberi tahu terlambat. Kalau
 * kredensial Evolution belum dipasang, itu dinyatakan di kartu paling atas
 * lengkap dengan tautan ke halaman Kredensial — sebelum orang mengetik apa pun.
 *
 * ── Warna
 *
 * `ARAH-VISUAL-2026.md` §3d: satu aksen per layar. Navy hanya untuk tombol
 * aksi utama (Kirim kode). Hijau/oranye hanya untuk status verifikasi yang
 * memang perlu dibedakan sekilas.
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import { api } from "@/lib/api";
import {
  AlertTriangle, CheckCircle2, Info, Loader2, MessageCircle, Plus, ShieldAlert,
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

interface Nomor {
  id: string;
  user_id: string;
  nomor: string;
  terverifikasi_pada: string | null;
  aktif: boolean;
  percobaan_gagal: number;
  dibuat_pada: string;
}

interface Muatan {
  data: Nomor[];
  kanal_siap: boolean;
}

function hasPerm(key: string): boolean {
  try {
    const raw = localStorage.getItem("puraloka_permissions");
    return raw ? (JSON.parse(raw) as string[]).includes(key) : false;
  } catch {
    return false;
  }
}

/** `628123456789` → `+62 812-3456-789` — dibaca manusia, disimpan mesin. */
function tampilNomor(n: string): string {
  if (n.length < 8) return n;
  return `+${n.slice(0, 2)} ${n.slice(2, 5)}-${n.slice(5, 9)}-${n.slice(9)}`;
}

export default function WhatsAppPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  const bolehKelola = hasPerm("settings:wa:manage");

  const [muatan, setMuatan] = useState<Muatan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [nomorBaru, setNomorBaru] = useState("");
  const [sedang, setSedang] = useState<string | null>(null);
  const [kode, setKode] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await api.get<Muatan>("/api/v1/wa/nomor");
      setMuatan(r.data);
    } catch {
      setToast({ tipe: "err", pesan: "Gagal memuat daftar nomor" });
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  function pesanGalat(e: unknown, bawaan: string): string {
    return (
      (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? bawaan
    );
  }

  async function daftarkan() {
    const n = nomorBaru.trim();
    if (!n) return;
    setSedang("__daftar__");
    try {
      await api.post("/api/v1/wa/nomor", { nomor: n });
      setToast({ tipe: "ok", pesan: `Kode verifikasi dikirim ke ${n}. Berlaku 10 menit.` });
      setNomorBaru("");
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Gagal mendaftarkan nomor") });
      // Daftar tetap dimuat ulang: nomornya mungkin TERSIMPAN meski kodenya
      // gagal terkirim (503 dari rute), dan menyembunyikannya membuat orang
      // mendaftar ulang nomor yang sudah ada.
      await muat();
    } finally {
      setSedang(null);
    }
  }

  async function verifikasi(n: Nomor) {
    const k = (kode[n.id] ?? "").trim();
    if (!/^\d{6}$/.test(k)) {
      setToast({ tipe: "err", pesan: "Kode harus 6 digit" });
      return;
    }
    setSedang(n.id);
    try {
      await api.post(`/api/v1/wa/nomor/${n.id}/verifikasi`, { kode: k });
      setToast({ tipe: "ok", pesan: `${tampilNomor(n.nomor)} terverifikasi` });
      setKode((s) => ({ ...s, [n.id]: "" }));
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Kode salah") });
      await muat();
    } finally {
      setSedang(null);
    }
  }

  async function ubahAktif(n: Nomor) {
    setSedang(n.id);
    try {
      await api.patch(`/api/v1/wa/nomor/${n.id}`, { aktif: !n.aktif });
      await muat();
    } catch (e) {
      setToast({ tipe: "err", pesan: pesanGalat(e, "Gagal mengubah status") });
    } finally {
      setSedang(null);
    }
  }

  const daftar = muatan?.data ?? [];

  return (
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
            position: "fixed", top: 16, right: 16, zIndex: 60, maxWidth: 380,
            padding: "var(--pad-kartu)", borderRadius: 8, fontSize: 13, lineHeight: 1.55,
            background: toast.tipe === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.tipe === "ok" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${toast.tipe === "ok" ? "var(--success)" : "var(--danger)"}`,
          }}
        >
          {toast.pesan}
        </div>
      )}

      <div style={{ marginBottom: "var(--gap-bagian)", display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
          judul="Kanal WhatsApp"
          keterangan="Nomor yang boleh bertanya ke asisten dan menerima notifikasi."
          ikon={<MessageCircle size={19} />}
        />
      </div>

      {/* ── Kesiapan kanal — dinyatakan SEBELUM orang mengetik ── */}
      {!memuat && muatan && !muatan.kanal_siap && (
        <div
          style={{
            ...card, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)",
            display: "flex", gap: 10,
            borderColor: "var(--warning)", background: "var(--warning-bg)",
          }}
        >
          <ShieldAlert size={18} style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            <strong>Kanal belum terhubung.</strong> Nomor bisa didaftarkan, tetapi kode
            verifikasi tak akan terkirim sampai <code>WA_BASE_URL</code>, <code>WA_API_KEY</code>,
            dan <code>WA_INSTANCE</code> diisi di{" "}
            <a href="/pengaturan/kredensial" style={{ color: C.aksen, textDecoration: "none", fontWeight: 600 }}>
              halaman Kredensial
            </a>
            .
          </div>
        </div>
      )}

      {!bolehKelola && (
        <div style={{ ...card, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
            Anda bisa melihat nomor terdaftar, tetapi tidak mengubahnya.
            Butuh kapabilitas <code>settings:wa:manage</code>.
          </div>
        </div>
      )}

      {/* ── Daftarkan nomor ── */}
      <section style={{ ...card, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: "0 0 10px" }}>
          Daftarkan nomor
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="nomor-baru" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              Nomor WhatsApp
            </label>
            <input
              id="nomor-baru"
              value={nomorBaru}
              onChange={(e) => setNomorBaru(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") daftarkan(); }}
              placeholder="08123456789 atau +628123456789"
              disabled={!bolehKelola || sedang === "__daftar__"}
              style={inputStyle}
            />
            <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
              Kode 6 digit dikirim ke nomor itu. Nomor baru berfungsi setelah kodenya
              dimasukkan — mengetik nomor saja tidak cukup.
            </p>
          </div>
          <button
            type="button"
            onClick={daftarkan}
            disabled={!bolehKelola || !nomorBaru.trim() || sedang === "__daftar__"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "var(--pad-tombol)", borderRadius: 7, fontSize: 13,
              fontWeight: 550, border: "1px solid transparent", whiteSpace: "nowrap",
              background: bolehKelola && nomorBaru.trim() ? C.aksen : "var(--surface-subtle)",
              color: bolehKelola && nomorBaru.trim() ? "#fff" : C.muted,
              cursor: bolehKelola && nomorBaru.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}
          >
            {sedang === "__daftar__" ? <Loader2 size={14} className="berputar" /> : <Plus size={14} />}
            Kirim kode
          </button>
        </div>
      </section>

      {/* ── Daftar nomor ── */}
      {memuat ? (
        <div style={{ ...card, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : daftar.length === 0 ? (
        <div style={{ ...card, padding: "var(--pad-kartu-lega)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.65 }}>
            Belum ada nomor terdaftar. Selama daftarnya kosong, asisten hanya bisa diakses
            lewat aplikasi — dan tak ada notifikasi WhatsApp yang terkirim.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {daftar.map((n) => {
            const sudah = Boolean(n.terverifikasi_pada);
            const idKode = `kode-${n.id}`;
            return (
              <section key={n.id} style={{ ...card, padding: "var(--pad-kartu-lega)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: sudah ? 0 : 12 }}>
                  {/* Status verifikasi PERTAMA, bukan lencana di ujung: nomor
                      yang belum terverifikasi tak berfungsi, dan itu harus
                      terbaca sebelum apa pun yang lain. */}
                  {sudah ? (
                    <CheckCircle2
                      size={16}
                      style={{ color: n.aktif ? "var(--success)" : C.muted, flexShrink: 0 }}
                    />
                  ) : (
                    <AlertTriangle
                      size={16}
                      style={{ color: n.aktif ? "var(--warning)" : C.muted, flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      fontSize: 14, fontWeight: 600, color: C.text,
                      fontFamily: "var(--font-mono, monospace)",
                      opacity: n.aktif ? 1 : 0.5,
                    }}
                  >
                    {tampilNomor(n.nomor)}
                  </span>
                  {/*
                    Lencana MENYATU dengan status aktif, bukan dua penanda
                    terpisah. Tangkapan layar pertama menyingkapnya: nomor
                    nonaktif tampil hijau "Terverifikasi" di sebelah tombol
                    "Aktifkan" — dua tanda yang sekilas saling membantah.

                    Yang menentukan bisa-tidaknya nomor dipakai adalah KEDUANYA:
                    terverifikasi DAN aktif. Jadi lencananya menyatakan hasil
                    akhirnya, bukan salah satu syaratnya.
                  */}
                  <span
                    style={{
                      fontSize: 11, padding: "var(--pad-lencana)", borderRadius: 999,
                      whiteSpace: "nowrap",
                      color: !n.aktif ? C.muted : sudah ? "var(--success)" : "var(--warning)",
                      background: !n.aktif
                        ? "var(--surface-subtle)"
                        : sudah ? "var(--success-bg)" : "var(--warning-bg)",
                      border: `1px solid ${
                        !n.aktif ? C.border : sudah ? "var(--success)" : "var(--warning)"
                      }`,
                    }}
                  >
                    {!n.aktif
                      ? sudah ? "Nonaktif (terverifikasi)" : "Nonaktif"
                      : sudah ? "Terverifikasi" : "Menunggu verifikasi"}
                  </span>

                  <div style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => ubahAktif(n)}
                    disabled={!bolehKelola || sedang === n.id}
                    style={{
                      padding: "var(--pad-lencana)", borderRadius: 6,
                      border: `1px solid ${C.border}`, background: "var(--surface-subtle)",
                      color: C.mid, fontSize: 11.5, fontFamily: "inherit",
                      cursor: bolehKelola ? "pointer" : "not-allowed", whiteSpace: "nowrap",
                    }}
                  >
                    {n.aktif ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>

                {!sudah && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{ width: 140 }}>
                      <label htmlFor={idKode} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
                        Kode verifikasi untuk {tampilNomor(n.nomor)}
                      </label>
                      <input
                        id={idKode}
                        value={kode[n.id] ?? ""}
                        onChange={(e) => setKode((s) => ({ ...s, [n.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") verifikasi(n); }}
                        placeholder="6 digit"
                        inputMode="numeric"
                        maxLength={6}
                        disabled={!bolehKelola || sedang === n.id}
                        style={{ ...inputStyle, letterSpacing: "0.15em", textAlign: "center" }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => verifikasi(n)}
                      disabled={!bolehKelola || sedang === n.id}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "var(--pad-tombol)", borderRadius: 7, fontSize: 13,
                        fontWeight: 550, border: `1px solid ${C.border}`,
                        background: "var(--surface-subtle)", color: C.text,
                        cursor: bolehKelola ? "pointer" : "not-allowed", fontFamily: "inherit",
                      }}
                    >
                      {sedang === n.id ? <Loader2 size={14} className="berputar" /> : null}
                      Verifikasi
                    </button>

                    {n.percobaan_gagal > 0 && (
                      <span style={{ fontSize: 11.5, color: "var(--warning)", alignSelf: "center", lineHeight: 1.5 }}>
                        {n.percobaan_gagal} percobaan gagal
                        {n.percobaan_gagal >= 5 ? " — daftarkan ulang untuk kode baru" : ""}
                      </span>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: "14px 2px 0" }}>
        Nomor terikat ke akun pengguna, bukan sekadar daftar putih. Mencabut keanggotaan
        seseorang di perusahaan ini langsung menutup akses WhatsApp-nya — tanpa perlu
        menghapus nomornya di sini.
      </p>
    </div>
  );
}
