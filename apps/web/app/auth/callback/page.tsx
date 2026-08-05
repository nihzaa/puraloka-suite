"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      try {
        const url = new URL(window.location.href);

        // Google/Supabase bisa mengembalikan galat eksplisit di query ATAU hash
        // (mis. user menekan "Batal" di layar consent). Tangani lebih dulu supaya
        // tidak tersamar jadi "oauth_failed" yang generik.
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        const oauthError = url.searchParams.get("error") ?? hashParams.get("error");
        if (oauthError) {
          const desc = url.searchParams.get("error_description") ?? hashParams.get("error_description");
          router.replace(
            `/login?error=oauth_failed${desc ? `&detail=${encodeURIComponent(desc)}` : ""}`
          );
          return;
        }

        // Klien ini berjalan pada flow `implicit` (session datang sebagai hash
        // `#access_token=...`), sehingga getSession() sudah memadai. Cabang PKCE
        // `?code=...` tetap disediakan supaya callback tidak diam-diam rusak bila
        // suatu saat flowType diubah ke 'pkce' — pada PKCE, getSession() hanya
        // membaca hash dan akan selalu mengembalikan null.
        const code = url.searchParams.get("code");
        let session = null;

        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error || !data.session) {
            router.replace("/login?error=oauth_failed");
            return;
          }
          session = data.session;
        } else {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session) {
            router.replace("/login?error=oauth_failed");
            return;
          }
          session = data.session;
        }

        const { access_token, refresh_token } = session;

        // Kirim token ke API kita — API akan verifikasi whitelist dan set HttpOnly cookie
        const res = await api.post("/api/v1/auth/google-callback", {
          access_token,
          refresh_token,
        });

        // Simpan user + permissions ke localStorage (sama seperti login email/password)
        if (typeof window !== "undefined") {
          localStorage.setItem("puraloka_user", JSON.stringify(res.data.user));
          localStorage.setItem("puraloka_permissions", JSON.stringify(res.data.permissions ?? []));
          document.cookie = `puraloka_role=${res.data.user.role};path=/;max-age=604800;SameSite=Lax`;
        }

        const homePortal: string = res.data.homePortal ?? "dashboard";
        router.replace(`/${homePortal}`);
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          router.replace("/login?error=not_registered");
        } else {
          router.replace("/login?error=oauth_failed");
        }
      }
    }

    handleCallback();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--bg)",
      flexDirection: "column",
      gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: "var(--navy)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, color: "var(--surface)" }}>P</span>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Memverifikasi akun...</div>
      <div style={{
        width: 24, height: 24,
        border: "2px solid var(--border)",
        borderTop: "2px solid var(--navy)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
