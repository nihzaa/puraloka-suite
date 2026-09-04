"use client";

// ============================================================================
// Profil — versi Klien, Task 12 Step 4. Restyle dari `lib/warna-ui` (C.*)
// ke token portal + `--grad-merek` (kartu avatar navy, konsisten dengan
// header PortalShell). Logika (logout) TIDAK diubah.
// ============================================================================

import { useRouter } from "next/navigation";
import { getStoredUser, logout } from "@/lib/api";
import { User, Mail, Phone, LogOut } from "lucide-react";

export default function PortalProfilPage() {
  const router = useRouter();
  const user = getStoredUser();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!user) return null;

  const info = [
    { icon: <Mail size={16} aria-hidden="true" />, label: "Email", value: user.email },
    { icon: <Phone size={16} aria-hidden="true" />, label: "Telepon", value: user.phone ?? "—" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
        Profil
      </h1>

      <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ background: "var(--grad-merek)", padding: 24, display: "flex", alignItems: "center", gap: "var(--gap-bagian)" }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(255,255,255,0.2)", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <User size={28} color="var(--on-navy)" aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--on-navy)" }}>{user.name}</div>
            <div style={{ fontSize: 13, color: "var(--on-merek-lembut)", marginTop: 2 }}>Klien</div>
          </div>
        </div>

        <div style={{ padding: "var(--pad-kartu-lega)", display: "flex", flexDirection: "column" }}>
          {info.map((item, i) => (
            <div
              key={item.label}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "14px 0",
                borderBottom: i === 0 ? "1px solid var(--border)" : "none",
              }}
            >
              <span style={{ color: "var(--text-secondary)" }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: "var(--t-kecil)", color: "var(--text-secondary)", fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: "var(--text-primary)", marginTop: 1 }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={handleLogout}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px 20px", borderRadius: "var(--portal-radius-pill)",
          border: "1px solid var(--danger-border)", background: "var(--surface)",
          fontSize: 13, fontWeight: 600, color: "var(--danger)", cursor: "pointer", minHeight: 44,
        }}
      >
        <LogOut size={16} aria-hidden="true" /> Keluar
      </button>
    </div>
  );
}
