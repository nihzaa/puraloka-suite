"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Bell, CheckCheck } from "lucide-react";

const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", surface: "var(--surface)",
};

interface Notif {
  id: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  priority: string;
}

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export default function PortalNotifPage() {
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/v1/notifications").then((res) => {
      setNotifs(res.data?.notifications ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const markAllRead = async () => {
    await api.patch("/api/v1/notifications/read-all").catch(() => {});
    setNotifs((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const markRead = async (id: string) => {
    await api.patch(`/api/v1/notifications/${id}/read`).catch(() => {});
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
  };

  const unread = notifs.filter((n) => !n.is_read).length;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Notifikasi</h1>
          {unread > 0 && <div style={{ fontSize: 13, color: C.mid, marginTop: 2 }}>{unread} belum dibaca</div>}
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: 8,
              border: `1px solid ${C.border}`, background: C.surface,
              fontSize: 13, color: C.mid, cursor: "pointer",
            }}
          >
            <CheckCheck size={14} /> Tandai semua
          </button>
        )}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: C.mid }}>Memuat notifikasi...</div>}

      {!loading && notifs.length === 0 && (
        <div style={{
          background: C.surface, borderRadius: 12, padding: 60,
          border: `1px solid ${C.border}`, textAlign: "center",
        }}>
          <Bell size={36} color={C.muted} style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>Tidak ada notifikasi</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notifs.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.is_read && markRead(n.id)}
            style={{
              background: C.surface, borderRadius: 12, padding: 16,
              border: `1px solid ${C.border}`,
              borderLeft: !n.is_read ? `3px solid ${C.navy}` : `1px solid ${C.border}`,
              cursor: !n.is_read ? "pointer" : "default",
              opacity: n.is_read ? 0.75 : 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600, color: C.text }}>{n.title}</div>
                <div style={{ fontSize: 13, color: C.mid, marginTop: 4, lineHeight: 1.5 }}>{n.body}</div>
              </div>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.navy, flexShrink: 0, marginTop: 5 }} />
              )}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>{timeAgo(n.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
