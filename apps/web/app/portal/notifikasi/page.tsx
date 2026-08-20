"use client";

// ============================================================================
// Notifikasi — versi Klien, Task 12 Step 4. Restyle dari `lib/warna-ui`
// (C.*) ke token portal. Logika (mark-read optimistik, mark-all) TIDAK
// diubah.
//
// Pembeda "sudah dibaca" SEBELUMNYA `opacity: 0.75` pada kartu (termasuk
// teksnya) — diganti warna teks solid (`--text-secondary` vs
// `--text-primary`) karena opacity pada teks mencampur warna dengan latar,
// menurunkan kontras di bawah yang terhitung statis (penjaga
// uji-opacity-teks.mjs, meski kartu ber-opacity utuh belum tertangkap
// polanya — diperbaiki di sini karena memang menyentuh teks).
// ============================================================================

import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Bell, CheckCheck } from "lucide-react";
import EmptyState from "@/components/portal/EmptyState";
import SkeletonCard from "@/components/portal/SkeletonCard";

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
  const { data, memuat: loading } = useData<{ notifications: Notif[] }>("/api/v1/notifications");
  const [tandaLokal, setTandaLokal] = useState<Set<string>>(new Set());
  const [semuaTertanda, setSemuaTertanda] = useState(false);

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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Notifikasi</h1>
          {unread > 0 && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>{unread} belum dibaca</div>}
        </div>
        {unread > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: "var(--portal-radius-pill)",
              border: "1px solid var(--border)", background: "var(--surface)",
              fontSize: 13, color: "var(--text-secondary)", cursor: "pointer", fontWeight: 600,
            }}
          >
            <CheckCheck size={14} aria-hidden="true" /> Tandai semua
          </button>
        )}
      </div>

      {loading && <SkeletonCard tinggi={80} />}

      {!loading && notifs.length === 0 && (
        <EmptyState icon={Bell} judul="Tidak ada notifikasi" deskripsi="Pemberitahuan proyek Anda akan muncul di sini." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {notifs.map((n) => (
          <div
            key={n.id}
            role="button"
            tabIndex={0}
            onClick={() => !n.is_read && markRead(n.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!n.is_read) markRead(n.id);
              }
            }}
            style={{
              background: "var(--surface)", borderRadius: 14, padding: 16,
              border: "1px solid var(--border)",
              borderLeft: !n.is_read ? "3px solid var(--navy)" : "1px solid var(--border)",
              cursor: !n.is_read ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: n.is_read ? "var(--text-secondary)" : "var(--text-primary)" }}>{n.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4, lineHeight: 1.5 }}>{n.body}</div>
              </div>
              {!n.is_read && (
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--navy)", flexShrink: 0, marginTop: 5 }} />
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>{timeAgo(n.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
