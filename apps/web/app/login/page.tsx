"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { login } from "@/lib/api";
import { supabase } from "@/lib/supabase";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const errParam = searchParams.get("error");
  const initialError =
    errParam === "not_registered"
      ? "Akun Google Anda belum terdaftar di sistem. Hubungi admin untuk mendapatkan akses."
      : errParam === "oauth_failed"
      ? "Login Google gagal. Coba lagi."
      : "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function handleGoogleLogin() {
    setOauthLoading(true);
    setError("");
    try {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
    } catch {
      setError("Login Google gagal. Coba lagi.");
      setOauthLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { homePortal } = await login(email, password);
      router.push(`/${homePortal}`);
    } catch {
      setError("Email atau password salah. Coba lagi.");
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
          background: #003366;
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
          color: #fff;
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

          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "#fff" }}>P</span>
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

          <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            {["Estimasi RAB", "Monitoring Realtime", "Laporan Keuangan"].map((label, i) => (
              <span key={label}>
                <span style={{
                  padding: "4px 12px", borderRadius: 99, fontSize: 12,
                  background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.75)",
                }}>{label}</span>
                {i < 2 && <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 8 }}>·</span>}
              </span>
            ))}
          </div>
        </div>

        {/* Right: Login form */}
        <div className="login-form-col">
          <div className="rise rise-2" style={{ width: "100%", maxWidth: 380 }}>

            {/* Mobile-only logo */}
            <div style={{ display: "none" }} className="mobile-logo">
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, background: "var(--navy)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: "var(--surface)" }}>P</span>
                </div>
                <span style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)" }}>Puraloka Suite</span>
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
                  <label className="login-label">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="nama@email.com"
                    className="login-input"
                  />
                </div>

                <div>
                  <label className="login-label">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="login-input"
                  />
                </div>

                {error && (
                  <div style={{
                    fontSize: 12, color: "var(--danger)", background: "var(--danger-bg)",
                    border: "1px solid var(--danger-border)", borderRadius: 8, padding: "10px 14px",
                  }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading} className="login-submit">
                  {loading ? "Memproses..." : "Masuk"}
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
