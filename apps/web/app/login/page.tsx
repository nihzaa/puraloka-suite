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
    <div style={{ minHeight: "100vh", display: "flex", background: "#F8F9FA" }}>

      {/* ── Left: Brand panel ── */}
      <div
        className="rise"
        style={{
          display: "flex",
          flex: "0 0 46%",
          position: "relative",
          overflow: "hidden",
          padding: "56px",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#003366",
        }}
      >
        {/* Subtle grid pattern */}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          backgroundImage: "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          pointerEvents: "none",
        }} />
        {/* Bottom-right glow */}
        <div style={{
          position: "absolute",
          bottom: "-6rem",
          right: "-6rem",
          width: "26rem",
          height: "26rem",
          borderRadius: "50%",
          background: "rgba(0,80,160,0.4)",
          filter: "blur(100px)",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "#FFFFFF" }}>P</span>
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 17, color: "#FFFFFF" }}>
              Puraloka Suite
            </span>
          </div>
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 420 }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 700, lineHeight: 1.08, letterSpacing: "-0.02em", color: "#FFFFFF" }}>
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
              }}>
                {label}
              </span>
              {i < 2 && <span style={{ color: "rgba(255,255,255,0.2)", marginLeft: 8 }}>·</span>}
            </span>
          ))}
        </div>
      </div>

      {/* ── Right: Login form ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div className="rise rise-2" style={{ width: "100%", maxWidth: 380 }}>

          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#111827", marginBottom: 6 }}>
            Masuk ke akun Anda
          </h2>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 28 }}>
            Masukkan kredensial untuk melanjutkan ke dashboard.
          </p>

          <div style={{
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            borderRadius: 16,
            padding: "28px 28px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
          }}>
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 6, color: "#374151", letterSpacing: "0.01em" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="nama@puraloka.id"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "#FFFFFF",
                    color: "#111827",
                    fontSize: 14,
                    outline: "none",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = "#003366";
                    e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)";
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = "#E5E7EB";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, marginBottom: 6, color: "#374151", letterSpacing: "0.01em" }}>
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid #E5E7EB",
                    background: "#FFFFFF",
                    color: "#111827",
                    fontSize: 14,
                    outline: "none",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}
                  onFocus={e => {
                    e.target.style.borderColor = "#003366";
                    e.target.style.boxShadow = "0 0 0 3px rgba(0,51,102,0.1)";
                  }}
                  onBlur={e => {
                    e.target.style.borderColor = "#E5E7EB";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>

              {error && (
                <div style={{
                  fontSize: 12, color: "#B91C1C",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8, padding: "10px 14px",
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: 8,
                  border: "none",
                  background: loading ? "#4D7AB5" : "#003366",
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.15s",
                  marginTop: 4,
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "#002244"; }}
                onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "#003366"; }}
              >
                {loading ? "Memproses..." : "Masuk"}
              </button>
            </form>

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
              <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
              <span style={{ fontSize: 11, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.08em" }}>atau</span>
              <div style={{ flex: 1, height: 1, background: "#E5E7EB" }} />
            </div>

            <button
              type="button"
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: "1px solid #E5E7EB",
                background: "#FFFFFF",
                color: "#374151",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                transition: "all 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#D1D5DB"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
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
    </div>
  );
}
