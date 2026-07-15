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
        // Supabase implicit flow: session ada di hash fragment (#access_token=...&refresh_token=...)
        // getSession() otomatis membaca hash dari window.location dan menyimpan session
        const { data, error } = await supabase.auth.getSession();

        if (error || !data.session) {
          router.replace("/login?error=oauth_failed");
          return;
        }

        const { access_token, refresh_token } = data.session;

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
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--surface)" }}>P</span>
      </div>
      <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>Memverifikasi akun...</div>
      <div style={{
        width: 24, height: 24,
        border: "2px solid #E5E7EB",
        borderTop: "2px solid #003366",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
