"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch {
      setError("Email atau password salah. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="grain-dark"
      style={{
        minHeight: "100vh",
        display: "flex",
        background: `
          radial-gradient(ellipse at 15% 30%, rgba(0,51,102,0.5) 0%, transparent 45%),
          radial-gradient(ellipse at 85% 70%, rgba(0,80,160,0.25) 0%, transparent 45%),
          radial-gradient(ellipse at 50% 100%, rgba(0,30,80,0.3) 0%, transparent 50%),
          #080c14
        `,
        color: "#e8ecf4",
      }}
    >
      {/* ── Left: Brand panel ── */}
      <div
        className="rise"
        style={{
          display: "none",
          flex: "0 0 46%",
          position: "relative",
          overflow: "hidden",
          padding: "56px",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
        // shown on lg via inline media hack — we'll use a class trick below
      >
        {/* Blueprint grid overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(64,160,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(64,160,255,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }} />
        {/* Blue radial glow */}
        <div style={{
          position: "absolute",
          bottom: "-8rem",
          left: "-8rem",
          width: "28rem",
          height: "28rem",
          borderRadius: "50%",
          background: "#003366",
          opacity: 0.4,
          filter: "blur(120px)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "#003366",
              border: "1px solid rgba(64,160,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 20px rgba(64,160,255,0.25)",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "#40a0ff" }}>P</span>
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, color: "#e8ecf4" }}>
              Puraloka Suite
            </span>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.02em", color: "#e8ecf4" }}>
            Manajemen konstruksi,
            <span style={{ color: "#40a0ff" }}> dari lapangan sampai laporan.</span>
          </h1>
          <p style={{ marginTop: 20, color: "rgba(232,236,244,0.5)", fontSize: 15, lineHeight: 1.65 }}>
            Kelola proyek, keuangan, mandor, dan progres dalam satu platform terpadu untuk Puraloka Persada.
          </p>
        </div>

        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 20, fontSize: 13, color: "rgba(232,236,244,0.3)" }}>
          <span>Estimasi RAB</span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(232,236,244,0.2)" }} />
          <span>Monitoring Realtime</span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(232,236,244,0.2)" }} />
          <span>Laporan Keuangan</span>
        </div>
      </div>

      {/* ── Right: Login form ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px", position: "relative", zIndex: 10 }}>
        <div className="rise rise-2" style={{ width: "100%", maxWidth: 360 }}>

          {/* Mobile logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 36 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: "#003366",
              border: "1px solid rgba(64,160,255,0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 16px rgba(64,160,255,0.2)",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, color: "#40a0ff" }}>P</span>
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 15, color: "#e8ecf4" }}>Puraloka Suite</span>
          </div>

          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "#e8ecf4", marginBottom: 6 }}>
            Selamat datang
          </h2>
          <p style={{ fontSize: 13, color: "rgba(232,236,244,0.4)", marginBottom: 32 }}>
            Masuk untuk melanjutkan ke dashboard Anda.
          </p>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 8, color: "rgba(232,236,244,0.5)", letterSpacing: "0.04em" }}>
                EMAIL
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nama@puraloka.id"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e8ecf4",
                  fontSize: 14,
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  backdropFilter: "blur(8px)",
                }}
                onFocus={e => {
                  e.target.style.borderColor = "rgba(64,160,255,0.5)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(64,160,255,0.12)";
                }}
                onBlur={e => {
                  e.target.style.borderColor = "rgba(255,255,255,0.1)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 8, color: "rgba(232,236,244,0.5)", letterSpacing: "0.04em" }}>
                PASSWORD
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e8ecf4",
                  fontSize: 14,
                  outline: "none",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  backdropFilter: "blur(8px)",
                }}
                onFocus={e => {
                  e.target.style.borderColor = "rgba(64,160,255,0.5)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(64,160,255,0.12)";
                }}
                onBlur={e => {
                  e.target.style.borderColor = "rgba(255,255,255,0.1)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 12, color: "#f87171",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 10, padding: "10px 14px",
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: 12,
                border: "none",
                background: loading ? "rgba(0,51,102,0.6)" : "#003366",
                color: "#e8ecf4",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.15s",
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 0 20px rgba(64,160,255,0.15)",
                marginTop: 4,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#0050a0"; }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#003366"; }}
            >
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>

          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
            <span style={{ fontSize: 11, color: "rgba(232,236,244,0.3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>atau</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.07)" }} />
          </div>

          <button
            type="button"
            style={{
              width: "100%",
              padding: "12px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.03)",
              color: "rgba(232,236,244,0.7)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              e.currentTarget.style.borderColor = "rgba(64,160,255,0.2)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Masuk dengan Google
          </button>
        </div>
      </div>
    </div>
  );
}
