"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AxiosError } from "axios";
import { login } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { LogoPuraloka } from "@/components/logo-puraloka";

/** Batas minimal password yang divalidasi server (auth.ts). Disamakan di sini
 *  supaya user dapat umpan balik sebelum request terkirim. */
const PASSWORD_MIN = 8;

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errParam = searchParams.get("error");
  // Alasan sebenarnya dari penyedia OAuth, bila ada — jauh lebih berguna daripada
  // "Login Google gagal" yang tidak memberi tahu apa pun.
  const errDetail = searchParams.get("detail");
  const initialError =
    errParam === "not_registered"
      ? "Akun Google Anda belum terdaftar di sistem. Hubungi admin untuk mendapatkan akses."
      : errParam === "oauth_failed"
      ? errDetail
        ? `Login Google gagal: ${errDetail}`
        : "Login Google gagal. Coba lagi, atau masuk memakai email dan password."
      : "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState(initialError);
  /** Detik tersisa sebelum boleh mencoba lagi (rate limit 429). 0 = tidak diblokir. */
  const [cooldown, setCooldown] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);

  // Hitung mundur cooldown supaya user tahu KAPAN boleh coba lagi, bukan sekadar
  // "terlalu banyak percobaan" tanpa akhir yang jelas.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Pindahkan fokus pembaca layar ke pesan galat begitu muncul.
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleGoogleLogin() {
    setOauthLoading(true);
    setError("");
    try {
      // signInWithOAuth mengembalikan { error } alih-alih melempar. Tanpa
      // memeriksanya, kegagalan (mis. provider mati) hanya membuat tombol
      // berputar selamanya tanpa pesan apa pun.
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (oauthErr) {
        setError(`Login Google gagal: ${oauthErr.message}`);
        setOauthLoading(false);
      }
    } catch {
      setError("Login Google gagal. Coba lagi, atau masuk memakai email dan password.");
      setOauthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (cooldown > 0) return;

    // Validasi lokal: server menolak password <8 karakter dengan 400, yang dulu
    // ikut tampil sebagai "Email atau password salah" — menyesatkan, karena
    // kredensialnya belum pernah diperiksa.
    if (password.length < PASSWORD_MIN) {
      setError(`Password minimal ${PASSWORD_MIN} karakter.`);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const { homePortal } = await login(email, password);
      router.push(`/${homePortal}`);
    } catch (err) {
      const ax = err as AxiosError<{ error?: string }>;
      const status = ax.response?.status;
      const serverMsg = ax.response?.data?.error;

      if (!ax.response) {
        // Tidak ada respons sama sekali → server mati / URL API salah / jaringan
        // putus. Dulu ini tampil sebagai "password salah" sehingga user mengira
        // kredensialnya bermasalah padahal backend tidak terjangkau.
        setError("Tidak dapat terhubung ke server. Periksa koneksi Anda, lalu coba lagi.");
      } else if (status === 429) {
        const detik = 60;
        setCooldown(detik);
        setError(serverMsg ?? "Terlalu banyak percobaan login. Tunggu sebentar sebelum mencoba lagi.");
      } else if (status === 401) {
        // Server sengaja tidak memberi tahu MANA yang salah (email atau password)
        // — itu praktik keamanan standar agar penyerang tidak bisa menebak email
        // mana yang terdaftar. Yang kita perbaiki: beri tahu user cara memulihkan.
        setError("Email atau password salah. Pastikan huruf besar/kecil sudah benar, atau hubungi admin bila lupa password.");
      } else if (status === 403) {
        setError(serverMsg ?? "Akun Anda belum terdaftar di sistem. Hubungi admin untuk mendapatkan akses.");
      } else if (status === 400) {
        setError(serverMsg ?? "Email dan password wajib diisi.");
      } else {
        setError(serverMsg ?? "Terjadi gangguan pada server. Coba beberapa saat lagi.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <style>{`
        .login-wrap {
          min-height: 100vh;
          display: flex;
          background: var(--bg);
        }
        .login-brand {
          flex: 0 0 46%;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 56px;
          /* Gradasi navy, bukan navy rata — arah gelap→terang yang sama
             dengan seluruh aplikasi. Halaman masuk adalah layar PERTAMA yang
             dilihat orang; kalau ia tak memakai bahasa visual produknya
             sendiri, sisanya terasa seperti aplikasi yang berbeda.

             ⚠️ Perhentiannya DITULIS di sini, tidak memakai --grad-aksen.
             Alasannya terlihat begitu mode gelap dipotret: di sana
             --grad-aksen berbalik jadi biru menyala (dirancang untuk kartu
             KPI kecil di latar gelap), dan bidang setengah layar dengan
             gradasi itu membuat merek seolah BERGANTI WARNA antar-mode.

             Panel ini adalah permukaan merek, bukan permukaan data — ia
             harus navy pekat yang sama di kedua mode, persis seperti kop
             surat perusahaan tak berubah warna karena lampu ruangan.

             Token --grad-merek sengaja TIDAK didefinisikan ulang di blok
             .dark globals.css; itu bukan kelalaian, itu perilakunya.
             (Tanpa backtick: blok CSS ini hidup di dalam template literal,
             jadi backtick di komentar akan menutup string lebih awal.) */
          background: var(--grad-merek);
          position: relative;
          overflow: hidden;
        }
        .login-form-col {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
        }
        .login-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 28px;
          box-shadow: var(--shadow-sm);
        }
        .login-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-primary);
          font-size: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .login-input:focus {
          border-color: var(--navy);
          box-shadow: 0 0 0 3px var(--navy-glow);
        }
        .login-input::placeholder { color: var(--text-muted); }
        .login-password-wrap { position: relative; display: flex; align-items: center; }
        /* Ruang kanan supaya teks password tidak tertimpa tombol mata. */
        .login-input-password { padding-right: 44px; }
        .login-eye {
          position: absolute;
          right: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 7px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.15s, background 0.15s;
        }
        .login-eye:hover { color: var(--text-secondary); background: var(--surface-hover); }
        .login-eye:focus-visible {
          outline: 2px solid var(--navy);
          outline-offset: 1px;
          color: var(--text-secondary);
        }
        /* Fokus keyboard yang terlihat jelas — WCAG 2.4.7. */
        .login-submit:focus-visible,
        .login-google:focus-visible {
          outline: 2px solid var(--navy);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .login-input, .login-submit, .login-google, .login-eye { transition: none; }
        }
        .login-label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          margin-bottom: 6px;
          color: var(--text-secondary);
        }
        .login-submit {
          width: 100%;
          padding: 11px;
          border-radius: 8px;
          border: none;
          background: var(--navy);
          /* Bukan #fff mati: --navy berbalik jadi biru TERANG di mode gelap,
           * dan putih di atasnya cuma 2,72:1 (syarat 4,5:1) — terukur axe-core.
           * --on-navy ikut berbalik bersama latarnya. */
          color: var(--on-navy);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
          margin-top: 4px;
        }
        .login-submit:hover:not(:disabled) { opacity: 0.88; }
        .login-submit:disabled { opacity: 0.55; cursor: not-allowed; }
        .login-google {
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-secondary);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          transition: background 0.15s, border-color 0.15s;
        }
        .login-google:hover:not(:disabled) {
          background: var(--surface-hover);
          border-color: var(--border-strong);
        }
        .login-google:disabled { opacity: 0.55; cursor: not-allowed; }
        .login-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0;
        }
        .login-divider-line { flex: 1; height: 1px; background: var(--border); }
        @media (max-width: 639px) {
          .login-brand { display: none; }
          .login-form-col {
            padding: 32px 20px;
            align-items: flex-start;
            padding-top: 48px;
          }
        }
      `}</style>

      <div className="login-wrap">
        {/* Left: Brand panel (hidden on mobile) */}
        <div className="login-brand">
          <div style={{
            position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none",
            backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }} />
          <div style={{
            position: "absolute", bottom: "-6rem", right: "-6rem",
            width: "26rem", height: "26rem", borderRadius: "50%",
            background: "rgba(0,80,160,0.4)", filter: "blur(100px)", pointerEvents: "none",
          }} />

          {/* Lambang raksasa sebagai TEKSTUR, bukan hiasan tempelan.
              Dipotong tepi kanan supaya terbaca sebagai bagian dari bidang,
              bukan stiker yang ditaruh di atasnya. Opasitasnya sangat rendah:
              ia harus terasa, bukan terbaca — begitu ia menarik perhatian, ia
              bersaing dengan judul yang justru harus dibaca. */}
          <div aria-hidden="true" style={{
            position: "absolute", top: "50%", right: "-14%",
            transform: "translateY(-50%)", opacity: 0.055,
            color: "#fff", pointerEvents: "none", lineHeight: 0,
          }}>
            <LogoPuraloka size={520} title="" />
          </div>

          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff",
            }}>
              <LogoPuraloka size={20} title="" />
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, color: "#fff" }}>
              Puraloka Suite
            </span>
          </div>

          <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
            <h1 style={{
              fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 700,
              lineHeight: 1.08, letterSpacing: "-0.02em", color: "#fff",
            }}>
              Manajemen konstruksi,
              <span style={{ color: "rgba(255,255,255,0.6)" }}> dari lapangan sampai laporan.</span>
            </h1>
            <p style={{ marginTop: 20, color: "rgba(255,255,255,0.55)", fontSize: 15, lineHeight: 1.65 }}>
              Kelola proyek, keuangan, mandor, dan progres dalam satu platform terpadu untuk Puraloka Persada.
            </p>
          </div>

          {/* Tiga kemampuan, bukan tiga pil.
              Versi sebelumnya memakai pil "Estimasi RAB · Monitoring Realtime ·
              Laporan Keuangan" — kata benda tanpa isi, pola yang muncul di
              setiap halaman masuk SaaS. Diganti dengan yang benar-benar
              membedakan produk ini: satuan pekerjaan yang dipakai orang
              lapangan, dan hal-hal yang biasanya tercecer di WhatsApp. */}
          <div style={{
            position: "relative", zIndex: 1, display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 28,
            paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.14)",
            maxWidth: 460,
          }}>
            {[
              { angka: "AHSP", ket: "Harga satuan mengikuti SNI, bukan tebakan" },
              { angka: "Kasbon", ket: "Diajukan mandor dari lapangan, disetujui di sini" },
              { angka: "Kurva S", ket: "Rencana vs kenyataan, per minggu" },
            ].map((k) => (
              <div key={k.angka}>
                <div style={{
                  fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700,
                  color: "#fff", letterSpacing: "-0.01em",
                }}>{k.angka}</div>
                <div style={{
                  marginTop: 5, fontSize: 12, lineHeight: 1.5,
                  color: "rgba(255,255,255,0.55)",
                }}>{k.ket}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Login form */}
        <div className="login-form-col">
          <div className="rise rise-2" style={{ width: "100%", maxWidth: 380 }}>

            {/* Mobile-only logo */}
            <div style={{ display: "none" }} className="mobile-logo">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 32 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, background: "var(--grad-aksen)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--on-aksen)",
                }}>
                  <LogoPuraloka size={18} title="" />
                </div>
                <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>Puraloka Suite</span>
              </div>
            </div>

            <h2 style={{
              fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700,
              letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: 6,
            }}>
              Masuk ke akun Anda
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 28 }}>
              Masukkan kredensial untuk melanjutkan ke dashboard.
            </p>

            <div className="login-card">
              <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label className="login-label" htmlFor="login-email">Email</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="nama@email.com"
                    className="login-input"
                  />
                </div>

                <div>
                  <label className="login-label" htmlFor="login-password">Password</label>
                  <div className="login-password-wrap">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="login-input login-input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="login-eye"
                      aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                      aria-pressed={showPassword}
                      title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                      tabIndex={0}
                    >
                      {showPassword ? (
                        // mata tercoret = sedang terlihat, klik untuk menyembunyikan
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.15 18.15 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="2" y1="2" x2="22" y2="22" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    ref={errorRef}
                    role="alert"
                    aria-live="assertive"
                    tabIndex={-1}
                    style={{
                      fontSize: 12, color: "var(--danger)", background: "var(--danger-bg)",
                      border: "1px solid var(--danger-border)", borderRadius: 6, padding: "8px 12px",
                      display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5, outline: "none",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2" strokeLinecap="round" aria-hidden="true"
                      style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>
                      {error}
                      {cooldown > 0 && (
                        <> Coba lagi dalam <strong>{cooldown} detik</strong>.</>
                      )}
                    </span>
                  </div>
                )}

                <button type="submit" disabled={loading || cooldown > 0} className="login-submit">
                  {loading
                    ? "Memproses..."
                    : cooldown > 0
                    ? `Tunggu ${cooldown} detik`
                    : "Masuk"}
                </button>
              </form>

              <div className="login-divider">
                <div className="login-divider-line" />
                <span style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>atau</span>
                <div className="login-divider-line" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={oauthLoading}
                className="login-google"
                style={{ opacity: oauthLoading ? 0.6 : 1 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {oauthLoading ? "Mengarahkan..." : "Masuk dengan Google"}
              </button>
            </div>

            {/* Catatan kaki — mengisi ruang kosong di bawah kartu DAN menjawab
                dua pertanyaan yang benar-benar muncul di layar masuk:
                "kenapa saya tak punya akun?" dan "apa ini aman?".

                Tak ada tautan "Daftar": aplikasi ini tidak menerima pendaftaran
                mandiri — akun dibuat administrator perusahaan. Tombol daftar
                yang berujung penolakan lebih buruk daripada tak ada tombol. */}
            <div style={{
              marginTop: 24, paddingTop: 20,
              borderTop: "1px solid var(--border)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
                Belum punya akses? Akun dibuat oleh administrator perusahaan Anda,
                bukan lewat pendaftaran mandiri.
              </p>
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11, color: "var(--text-muted)",
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                  style={{ flexShrink: 0 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Sesi terenkripsi · setiap tindakan tercatat di jejak audit
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 639px) {
          .mobile-logo { display: block !important; }
        }
      `}</style>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
