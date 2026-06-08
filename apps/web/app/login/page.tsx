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
    <div className="grain min-h-screen flex">
      {/* ── Left: Brand panel ── */}
      <div className="hidden lg:flex lg:w-[46%] relative overflow-hidden bg-[var(--color-ink)] text-[var(--color-paper)]">
        {/* Blueprint grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-paper) 1px, transparent 1px), linear-gradient(90deg, var(--color-paper) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Amber glow */}
        <div className="absolute -bottom-32 -left-32 w-[28rem] h-[28rem] rounded-full bg-[var(--color-amber)] opacity-20 blur-[120px]" />

        <div className="relative z-10 flex flex-col justify-between p-14 w-full">
          <div className="rise rise-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[var(--color-amber)] flex items-center justify-center">
                <span className="font-display font-extrabold text-[var(--color-ink)] text-xl">P</span>
              </div>
              <span className="font-display font-semibold text-lg tracking-tight">
                Puraloka Suite
              </span>
            </div>
          </div>

          <div className="rise rise-2 max-w-md">
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight">
              Manajemen konstruksi,
              <span className="text-[var(--color-amber-glow)]"> dari lapangan sampai laporan.</span>
            </h1>
            <p className="mt-6 text-[var(--color-paper)]/60 text-base leading-relaxed">
              Kelola proyek, keuangan, mandor, dan progres dalam satu platform terpadu untuk Puraloka Persada.
            </p>
          </div>

          <div className="rise rise-3 flex items-center gap-6 text-sm text-[var(--color-paper)]/40">
            <span>Estimasi RAB</span>
            <span className="w-1 h-1 rounded-full bg-[var(--color-paper)]/30" />
            <span>Monitoring Realtime</span>
            <span className="w-1 h-1 rounded-full bg-[var(--color-paper)]/30" />
            <span>Laporan Keuangan</span>
          </div>
        </div>
      </div>

      {/* ── Right: Login form ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-sm rise rise-2">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-amber)] flex items-center justify-center">
              <span className="font-display font-extrabold text-[var(--color-ink)] text-xl">P</span>
            </div>
            <span className="font-display font-semibold text-lg">Puraloka Suite</span>
          </div>

          <h2 className="font-display text-3xl font-bold tracking-tight">Selamat datang</h2>
          <p className="mt-2 text-[var(--color-clay)] text-sm">
            Masuk untuk melanjutkan ke dashboard Anda.
          </p>

          <form onSubmit={handleLogin} className="mt-10 space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--color-ink-soft)]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nama@puraloka.id"
                className="w-full px-4 py-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-pure)] text-[var(--color-ink)] placeholder:text-[var(--color-clay)]/50 focus:outline-none focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/15 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--color-ink-soft)]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-pure)] text-[var(--color-ink)] placeholder:text-[var(--color-clay)]/50 focus:outline-none focus:border-[var(--color-amber)] focus:ring-2 focus:ring-[var(--color-amber)]/15 transition"
              />
            </div>

            {error && (
              <div className="text-sm text-[var(--color-danger)] bg-[var(--color-danger)]/8 border border-[var(--color-danger)]/20 rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-[var(--color-ink)] text-[var(--color-paper)] font-semibold hover:bg-[var(--color-ink-soft)] active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Memproses..." : "Masuk"}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-[var(--color-line)]" />
            <span className="text-xs text-[var(--color-clay)] uppercase tracking-wider">atau</span>
            <div className="flex-1 h-px bg-[var(--color-line)]" />
          </div>

          <button
            type="button"
            className="mt-6 w-full py-3.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper-pure)] font-medium hover:border-[var(--color-clay)]/40 active:scale-[0.99] transition flex items-center justify-center gap-3"
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
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