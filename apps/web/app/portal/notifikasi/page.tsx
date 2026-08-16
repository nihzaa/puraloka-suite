"use client";

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Bell, CheckCheck } from "lucide-react";

import { C } from "@/lib/warna-ui";

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
  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useEffect+useState. Tandai-dibaca TETAP menulis
    langsung ke `api.patch` lalu memutakhirkan tampilan secara optimistik —
    itu perilaku lama yang dipertahankan, bukan diganti `muatUlang()`, karena
    menandai satu notifikasi dibaca tak perlu mengambil ulang seluruh daftar
    dari server.
  */
  const { data, memuat: loading } = useData<{ notifications: Notif[] }>("/api/v1/notifications");
  const [tandaLokal, setTandaLokal] = useState<Set<string>>(new Set());
  const [semuaTertanda, setSemuaTertanda] = useState(false);

  // Diturunkan dari jawaban server + penanda lokal, bukan disalin ke state
  // terpisah — satu sumber kebenaran untuk daftarnya.
  const notifs = (data?.notifications ?? []).map((n) =>
    (semuaTertanda || tandaLokal.has(n.id)) && !n.is_read ? { ...n, is_read: true } : n);

  const markAllRead = useCallback(async () => {
    setSemuaTertanda(true);
    await api.patch("/api/v1/notifications/read-all").catch(() => {});
  }, []);

  const markRead = useCallback(async (id: string) => {
    setTandaLokal((s) => new Set(s).add(id));
    await api.patch(`/api/v1/notifications/${id}/read`).catch(() => {});
  }, []);

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
              padding: "6px 12px", borderRadius: 6,
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
          background: C.surface, borderRadius: 10, padding: 60,
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
            role="button"
            tabIndex={0}
            onClick={() => !n.is_read && markRead(n.id)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()   // Spasi jangan menggulir daftar notifikasi
                if (!n.is_read) markRead(n.id)
              }
            }}
            style={{
              background: C.surface, borderRadius: 10, padding: 16,
              border: `1px solid ${C.border}`,
              borderLeft: !n.is_read ? `3px solid ${C.navy}` : `1px solid ${C.border}`,
              cursor: !n.is_read ? "pointer" : "default",
              opacity: n.is_read ? 0.75 : 1,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: n.is_read ? 400 : 600, color: C.text }}>{n.title}</div>
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
