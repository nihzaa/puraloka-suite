"use client";

import { useRouter } from "next/navigation";
import { getStoredUser, logout } from "@/lib/api";
import { User, Mail, Phone, LogOut } from "lucide-react";

import { C } from "@/lib/warna-ui";

export default function PortalProfilPage() {
  const router = useRouter();
  const user = getStoredUser();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 20 }}>Profil</h1>

      <div style={{
        background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`,
        overflow: "hidden", marginBottom: 16,
      }}>
        {/* Avatar */}
        <div style={{ background: C.navy, padding: 32, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(255,255,255,0.2)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <User size={28} color="var(--surface)" />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--surface)" }}>{user.name}</div>
            <div style={{ fontSize: 13, color: "color-mix(in srgb, var(--on-navy) 80%, transparent)", marginTop: 2 }}>Klien</div>
          </div>
        </div>

        {/* Info */}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 0 }}>
          {[
            { icon: <Mail size={16} />, label: "Email", value: user.email },
            { icon: <Phone size={16} />, label: "Telepon", value: user.phone ?? "—" },
          ].map((item, i) => (
            <div key={item.label} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 0",
              borderBottom: i === 0 ? `1px solid ${C.border}` : "none",
            }}>
              <span style={{ color: C.mid }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 11, color: C.mid, fontWeight: 500 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: C.text, marginTop: 1 }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleLogout}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "12px 20px", borderRadius: 10,
          border: `1px solid ${C.border}`, background: C.surface,
          fontSize: 13, fontWeight: 500, color: C.red, cursor: "pointer",
        }}
      >
        <LogOut size={16} /> Keluar
      </button>
    </div>
  );
}
