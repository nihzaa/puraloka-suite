"use client";

/**
 * PENGATURAN → KEAMANAN AKUN
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI TIDAK MENIRU TJS PERSIS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * TJS membangun TOTP-nya sendiri: rahasia di tabel aplikasi, kode cadangan
 * di-hash sendiri, verifikasi dihitung sendiri. Masuk akal di sana — auth-nya
 * memang milik sendiri.
 *
 * Di sini tidak. Diukur 2026-08-11, Supabase sudah menyediakan seluruh
 * infrastrukturnya (`auth.mfa_factors`, `mfa_challenges`, `mfa_amr_claims`).
 * Menulis ulang kripto TOTP di atas basis yang SUDAH punya tabelnya bukan
 * kemandirian, melainkan permukaan serangan kedua yang harus dijaga sendiri.
 *
 * Yang ditiru: bentuk alurnya (QR → verifikasi → aktif), karena itu yang
 * membuat halaman TJS enak dipakai. Yang tidak: kriptonya.
 *
 * ── Dua hal yang TIDAK ada di TJS, dan ada di sini
 *
 * Sesi aktif dan riwayat masuk. Keduanya hidup di skema `auth` yang tidak
 * diekspos PostgREST, jadi dibaca lewat fungsi SECURITY DEFINER (migrasi 277).
 *
 * ── Riwayat masuk sengaja MENYATAKAN kalau ia kosong
 *
 * `auth.audit_log_entries` nol baris di proyek ini — Supabase mencatat audit
 * hanya bila fiturnya dinyalakan. Daftar kosong tanpa penjelasan tak bisa
 * dibedakan dari fitur rusak, dan orang akan melaporkannya sebagai bug.
 *
 * ── Kode cadangan: TIDAK ditampilkan, dan itu bukan kelalaian
 *
 * TJS memberi sepuluh kode cadangan saat pendaftaran. Supabase tidak
 * menyediakannya untuk TOTP — jalan pulihnya adalah admin mencabut faktor
 * lewat dashboard. Menampilkan kotak "kode cadangan" yang isinya karangan
 * sendiri jauh lebih berbahaya daripada tidak menampilkannya: orang akan
 * menyimpannya, lalu menemukan kodenya tak berlaku justru saat perangkatnya
 * hilang. Halaman ini menyebutkan jalan pulih yang SEBENARNYA.
 */

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { KeyRound, Loader2, Monitor, ShieldCheck, ShieldOff, History } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU, Kosong } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { formatTanggalJam } from "@/lib/format";

interface Faktor {
  id: string;
  nama: string | null;
  status: string;
  dibuat: string;
}
interface Sesi {
  id: string;
  dibuat: string;
  terakhir: string;
  perangkat: string | null;
  ip: string | null;
}
interface Riwayat {
  id: string;
  aksi: string;
  waktu: string;
  ip: string | null;
}
interface Status {
  mfa: { aktif: boolean; faktor: Faktor[] };
  sesi: Sesi[];
  riwayat: Riwayat[];
  riwayat_tersedia: boolean;
}

/** `Mozilla/5.0 (Windows NT 10.0…) …Chrome/…` → `Chrome · Windows`. */
function ringkasPerangkat(ua: string | null): string {
  if (!ua) return "Perangkat tak dikenal";
  const peramban =
    /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const sistem =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : null;
  if (!peramban && !sistem) return "Perangkat tak dikenal";
  return [peramban, sistem].filter(Boolean).join(" · ");
}

export default function KeamananPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  // Alur pendaftaran: idle → qr (memindai) → selesai
  const [tahap, setTahap] = useState<"idle" | "qr">("idle");
  const [faktorId, setFaktorId] = useState("");
  const [rahasia, setRahasia] = useState("");
  const [qrGambar, setQrGambar] = useState("");
  const [kode, setKode] = useState("");
  const [sedang, setSedang] = useState(false);
  const [pesan, setPesan] = useState<{ tipe: "ok" | "salah"; teks: string } | null>(null);

  const ambil = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const r = await api.get<Status>("/api/v1/keamanan/status");
      setStatus(r.data);
    } catch {
      setGalat("Status keamanan tidak bisa dimuat.");
    } finally {
      setMemuat(false);
    }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: `ambil()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  useEffect(() => { queueMicrotask(() => { void ambil(); }); }, [ambil]);

  async function mulaiDaftar() {
    setSedang(true);
    setPesan(null);
    try {
      const r = await api.post<{ faktor_id: string; rahasia: string; uri: string }>(
        "/api/v1/keamanan/mfa/daftar",
      );
      setFaktorId(r.data.faktor_id);
      setRahasia(r.data.rahasia);
      // QR digambar DI PERAMBAN. Mengirimkannya dari server berarti rahasianya
      // melewati satu lapisan lagi tanpa alasan.
      setQrGambar(await QRCode.toDataURL(r.data.uri, { margin: 1, width: 220 }));
      setTahap("qr");
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPesan({ tipe: "salah", teks: p ?? "Pendaftaran gagal dimulai" });
    } finally {
      setSedang(false);
    }
  }

  async function verifikasi() {
    setSedang(true);
    setPesan(null);
    try {
      await api.post("/api/v1/keamanan/mfa/verifikasi", { faktor_id: faktorId, kode });
      setTahap("idle");
      setKode("");
      setRahasia("");
      setQrGambar("");
      await ambil();
      setPesan({ tipe: "ok", teks: "Verifikasi dua langkah aktif" });
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPesan({ tipe: "salah", teks: p ?? "Kode tidak cocok" });
    } finally {
      setSedang(false);
    }
  }

  async function matikan(id: string) {
    setSedang(true);
    setPesan(null);
    try {
      await api.delete(`/api/v1/keamanan/mfa/${id}`);
      await ambil();
      setPesan({ tipe: "ok", teks: "Verifikasi dua langkah dimatikan" });
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPesan({ tipe: "salah", teks: p ?? "Gagal menonaktifkan" });
    } finally {
      setSedang(false);
    }
  }

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      <KepalaHalaman
        judul="Keamanan Akun"
        keterangan="Verifikasi dua langkah, perangkat yang sedang masuk, dan riwayatnya."
        ikon={<ShieldCheck size={19} />}
      />

      {pesan && (
        <div
          role="status"
          style={{
            ...GAYA_KARTU,
            padding: "var(--pad-kartu)",
            marginBottom: "var(--gap-bagian)",
            borderColor: pesan.tipe === "ok" ? "var(--success)" : "var(--danger)",
            fontSize: 13,
            color: C.text,
          }}
        >
          {pesan.teks}
        </div>
      )}

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : galat || !status ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", color: C.danger, fontSize: 13 }}>
          {galat}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          {/* ── Verifikasi dua langkah ── */}
          <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <KeyRound size={16} style={{ color: C.mid }} />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
                Verifikasi dua langkah
              </h2>
            </div>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: "0 0 14px" }}>
              Sandi saja bisa dicuri lewat email atau dipakai ulang dari situs lain. Dengan
              verifikasi dua langkah, masuk juga menuntut kode dari ponsel Anda.
            </p>

            {status.mfa.aktif ? (
              <>
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "var(--pad-kartu)", borderRadius: "var(--radius-sm)",
                    background: "var(--success-bg)", border: "1px solid var(--success)",
                    fontSize: 12.5, color: C.text, marginBottom: 12,
                  }}
                >
                  <ShieldCheck size={15} style={{ color: C.green, flexShrink: 0 }} />
                  Aktif sejak {formatTanggalJam(status.mfa.faktor[0]?.dibuat)}
                </div>

                {/*
                  Jalan pulih disebutkan TERANG-TERANGAN. Supabase tidak
                  menyediakan kode cadangan untuk TOTP, dan orang yang
                  kehilangan ponselnya perlu tahu ke mana harus pergi SEBELUM
                  itu terjadi — bukan menemukannya saat sudah terkunci.
                */}
                <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, margin: "0 0 12px" }}>
                  Kehilangan ponsel? Tidak ada kode cadangan — administrator harus mencabut
                  faktor ini dari dashboard Supabase. Simpan juga rahasianya di pengelola
                  sandi kalau Anda ingin bisa memulihkannya sendiri.
                </p>

                {status.mfa.faktor
                  .filter((f) => f.status === "verified")
                  .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => matikan(f.id)}
                      disabled={sedang}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "8px 14px", borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--danger)", background: "var(--surface)",
                        color: C.danger, fontSize: 13, fontWeight: 600,
                        cursor: sedang ? "not-allowed" : "pointer", fontFamily: "inherit",
                      }}
                    >
                      {sedang ? <Loader2 size={14} className="berputar" /> : <ShieldOff size={14} />}
                      Matikan verifikasi dua langkah
                    </button>
                  ))}
              </>
            ) : tahap === "qr" ? (
              <div style={{ display: "grid", gap: 14 }}>
                <p style={{ fontSize: 12.5, color: C.text, lineHeight: 1.6, margin: 0 }}>
                  Pindai kode ini dengan Google Authenticator, Authy, atau pengelola sandi
                  Anda — lalu masukkan enam angka yang muncul.
                </p>

                {qrGambar && (
                  /* eslint-disable-next-line @next/next/no-img-element --
                     data: URI yang dibuat di peramban; `next/image` menuntut
                     domain terdaftar dan tak memberi keuntungan apa pun di sini. */
                  <img
                    src={qrGambar}
                    alt="Kode QR untuk aplikasi autentikator"
                    width={220}
                    height={220}
                    style={{ borderRadius: "var(--radius-sm)", border: `1px solid ${C.border}` }}
                  />
                )}

                {/*
                  Rahasia teks ditampilkan berdampingan, bukan disembunyikan:
                  ponsel tanpa kamera dan pengelola sandi di desktop memerlukan
                  ini, dan menyembunyikannya memaksa orang mencari cara lain.
                */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 550, color: C.mid, margin: "0 0 5px" }}>
                    Tak bisa memindai? Masukkan kunci ini
                  </p>
                  <code
                    style={{
                      display: "block", padding: "8px 10px", fontSize: 12.5,
                      background: "var(--surface-subtle)", borderRadius: "var(--radius-sm)",
                      wordBreak: "break-all", color: C.text,
                    }}
                  >
                    {rahasia}
                  </code>
                </div>

                <div style={{ maxWidth: 200 }}>
                  <label htmlFor="kode" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                    Kode enam angka
                  </label>
                  <input
                    className="isian-fokus"
                    id="kode"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    value={kode}
                    onChange={(e) => setKode(e.target.value.replace(/\D/g, ""))}
                    style={{ ...GAYA_ISIAN, letterSpacing: "0.2em", textAlign: "center" }}
                  />
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={verifikasi}
                    disabled={sedang || kode.length !== 6}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "8px 14px", borderRadius: "var(--radius-sm)", border: "none",
                      background: kode.length === 6 ? C.navy : "var(--surface-subtle)",
                      // `C.onNavy`, BUKAN "#fff" dipaku — lihat catatan di
                      // tombol "Aktifkan verifikasi dua langkah" di bawah.
                      color: kode.length === 6 ? C.onNavy : C.muted,
                      fontSize: 13, fontWeight: 600,
                      cursor: kode.length === 6 && !sedang ? "pointer" : "not-allowed",
                      fontFamily: "inherit",
                    }}
                  >
                    {sedang ? <Loader2 size={14} className="berputar" /> : <ShieldCheck size={14} />}
                    Aktifkan
                  </button>
                  <button
                    type="button"
                    onClick={() => { setTahap("idle"); setKode(""); }}
                    disabled={sedang}
                    style={{
                      padding: "8px 14px", borderRadius: "var(--radius-sm)",
                      border: `1px solid ${C.border}`, background: "var(--surface)",
                      color: C.mid, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={mulaiDaftar}
                disabled={sedang}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: "var(--radius-sm)", border: "none",
                  // ── `C.onNavy`, BUKAN "#fff" dipaku
                  //
                  // `--navy` BERBEDA per mode: #003366 di terang, #4D9FFF di
                  // gelap. Putih di atas #4D9FFF terukur 2,72 : 1 — jauh di
                  // bawah AA 4,5. Cacat ini tak terlihat sama sekali di mode
                  // terang (12,61 : 1) dan hanya tertangkap saat audit runtime
                  // dijalankan dengan `--gelap`.
                  //
                  // `--on-navy` sudah ada di globals.css justru untuk ini:
                  // #FFFFFF di terang, #0F1117 di gelap → 6,94 : 1. Repo sudah
                  // menyediakan jawabannya; yang salah hanya saya memakukan
                  // warna alih-alih tokennya.
                  background: C.navy, color: C.onNavy, fontSize: 13, fontWeight: 600,
                  cursor: sedang ? "not-allowed" : "pointer", fontFamily: "inherit",
                }}
              >
                {sedang ? <Loader2 size={14} className="berputar" /> : <KeyRound size={14} />}
                Aktifkan verifikasi dua langkah
              </button>
            )}
          </section>

          {/* ── Perangkat yang sedang masuk ── */}
          <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Monitor size={16} style={{ color: C.mid }} />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
                Perangkat yang sedang masuk
              </h2>
            </div>
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, margin: "0 0 12px" }}>
              Sesi yang masih hidup untuk akun Anda. Perangkat yang tak Anda kenali berarti
              sandi Anda dipakai orang lain — segera ganti sandinya.
            </p>

            {status.sesi.length === 0 ? (
              <Kosong
                ikon={<Monitor size={18} />}
                judul="Tak ada sesi aktif"
                sebab="Sesi tercatat begitu Anda masuk. Kalau daftar ini kosong sementara Anda sedang membuka halaman ini, sesinya kemungkinan sudah kedaluwarsa dan akan muncul lagi setelah masuk ulang."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {status.sesi.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "baseline",
                      gap: 12, padding: "var(--pad-baris)",
                      borderBottom: `1px solid ${C.border}`, fontSize: 12.5,
                    }}
                  >
                    <span style={{ color: C.text }}>
                      {ringkasPerangkat(s.perangkat)}
                      {s.ip && (
                        <span style={{ color: C.muted, marginInlineStart: 8, fontSize: 11.5 }}>
                          {s.ip}
                        </span>
                      )}
                    </span>
                    <span style={{ color: C.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>
                      {formatTanggalJam(s.terakhir)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Riwayat masuk ── */}
          <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <History size={16} style={{ color: C.mid }} />
              <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>
                Riwayat masuk
              </h2>
            </div>

            {status.riwayat_tersedia ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {status.riwayat.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex", justifyContent: "space-between", gap: 12,
                      padding: "var(--pad-baris)", borderBottom: `1px solid ${C.border}`,
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ color: C.text }}>{r.aksi}</span>
                    <span style={{ color: C.muted, fontSize: 11.5, whiteSpace: "nowrap" }}>
                      {formatTanggalJam(r.waktu)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              /*
                Kekosongan yang punya SEBAB harus menyebutkan sebabnya. Daftar
                kosong tanpa penjelasan tak bisa dibedakan dari fitur rusak,
                dan orang akan melaporkannya sebagai bug.
              */
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: "8px 0 0" }}>
                Pencatatan riwayat masuk <strong>belum dinyalakan</strong> di proyek Supabase
                ini, jadi tak ada yang bisa ditampilkan — bukan berarti Anda belum pernah
                masuk. Sesi yang sedang hidup tetap terlihat di kartu di atas.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
