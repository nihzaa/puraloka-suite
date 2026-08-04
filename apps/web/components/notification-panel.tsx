"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bell, X, Check, CheckCheck, Banknote, FileText,
  Flag, TrendingUp, FolderKanban, ClipboardList, ChevronRight,
  BellRing, BellOff,
} from "lucide-react";
import { api } from "@/lib/api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy: "var(--navy)", navyLight: "var(--navy-light)",
  text: "var(--text-primary)", mid: "var(--text-secondary)", muted: "var(--text-muted)",
  border: "var(--border)", bg: "var(--bg)",
  green: "var(--success)", greenBg: "var(--success-bg)",
  red: "var(--danger)", redBg: "var(--danger-bg)",
  yellow: "var(--warning)", yellowBg: "var(--warning-bg)",
  blue: "var(--info)", blueBg: "var(--info-bg)",
  white: "var(--surface)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string | null;
  priority: string;
  is_read: boolean;
  is_actioned: boolean;
  action_url: string | null;
  action_type: string | null;
  action_data: Record<string, unknown> | null;
  sent_at: string;
  project_id: string | null;
}

type FilterTab = "all" | "unread" | "urgent";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return "Baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days === 1) return "Kemarin";
  return `${days} hari lalu`;
}

function typeIcon(type: string | null) {
  switch (type) {
    case "kasbon_pending":
    case "kasbon_approved":
    case "kasbon_rejected":
      return <Banknote size={14} />;
    case "invoice_created":
    case "invoice_due":
    case "invoice_overdue":
    case "invoice_paid":
      return <FileText size={14} />;
    case "milestone_approaching":
    case "milestone_overdue":
    case "milestone_completed":
      return <Flag size={14} />;
    case "progress_submitted":
      return <TrendingUp size={14} />;
    case "project_assigned":
    case "project_status_changed":
      return <FolderKanban size={14} />;
    case "wage_report_submitted":
      return <ClipboardList size={14} />;
    default:
      return <Bell size={14} />;
  }
}

function typeColor(type: string | null): { color: string; bg: string } {
  switch (type) {
    case "kasbon_pending":
    case "kasbon_approved":
    case "kasbon_rejected":
      return { color: C.yellow, bg: C.yellowBg };
    case "invoice_created":
    case "invoice_due":
    case "invoice_overdue":
    case "invoice_paid":
      return { color: C.green, bg: C.greenBg };
    case "milestone_approaching":
    case "milestone_overdue":
    case "milestone_completed":
      return { color: C.blue, bg: C.blueBg };
    case "progress_submitted":
      return { color: C.navy, bg: C.navyLight };
    case "project_assigned":
    case "project_status_changed":
      return { color: C.navy, bg: C.navyLight };
    case "wage_report_submitted":
      return { color: C.mid, bg: C.bg };
    default:
      return { color: C.mid, bg: C.bg };
  }
}

function priorityBadge(priority: string) {
  if (priority === "urgent") {
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "1px 5px",
        borderRadius: 4, background: C.redBg, color: C.red,
        letterSpacing: "0.03em", textTransform: "uppercase",
      }}>URGEN</span>
    );
  }
  if (priority === "high") {
    return (
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "1px 5px",
        borderRadius: 4, background: C.yellowBg, color: C.yellow,
        letterSpacing: "0.03em", textTransform: "uppercase",
      }}>PENTING</span>
    );
  }
  return null;
}

// ─── Action buttons for interactive notifications ─────────────────────────────

function ActionButtons({
  notif,
  onAction,
}: {
  notif: Notification;
  onAction: (id: string, action: "approve" | "reject") => void;
}) {
  const actionable = notif.action_type === "approve_kasbon"
    || notif.action_type === "reject_kasbon"
    || notif.action_type === "approve_wage_report"
    || notif.action_type === "reject_wage_report";

  if (!actionable || notif.is_actioned) return null;

  return (
    <div style={{ display: "flex", gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => onAction(notif.id, "approve")}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.green}`,
          background: C.greenBg, color: C.green,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        <Check size={11} /> Setujui
      </button>
      <button
        onClick={() => onAction(notif.id, "reject")}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.red}`,
          background: C.redBg, color: C.red,
          fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        <X size={11} /> Tolak
      </button>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div style={{ padding: "12px 16px", display: "flex", gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: C.border, flexShrink: 0 }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ height: 12, borderRadius: 4, background: C.border, width: "60%" }} />
        <div style={{ height: 10, borderRadius: 4, background: C.bg, width: "90%" }} />
        <div style={{ height: 10, borderRadius: 4, background: C.bg, width: "70%" }} />
      </div>
    </div>
  );
}

// ─── NotificationPanel component ─────────────────────────────────────────────

export interface NotificationPanelProps {
  /** Controlled from Topbar */
  unreadCount: number;
  onCountChange: (count: number) => void;
}

export function NotificationPanel({ unreadCount, onCountChange }: NotificationPanelProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen]               = useState(false);
  /**
   * Status langganan Web Push di perangkat INI.
   *
   * `null` = belum diketahui / browser tak mendukung — tombolnya disembunyikan
   * alih-alih ditampilkan mati, karena tombol yang tak bisa ditekan hanya
   * menimbulkan pertanyaan.
   */
  const [pushAktif, setPushAktif] = useState<boolean | null>(null);
  const [pushProses, setPushProses] = useState(false);
  const [tab, setTab]                 = useState<FilterTab>("all");
  const [notifs, setNotifs]           = useState<Notification[]>([]);
  const [loading, setLoading]         = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  // ── Fetch notifications ────────────────────────────────────────────────────
  const fetchNotifs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "30" };
      if (tab === "unread")  params.is_read  = "false";
      if (tab === "urgent")  params.priority = "urgent";
      const { data } = await api.get<{ notifications: Notification[] }>("/api/v1/notifications", { params });
      setNotifs(data.notifications ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [tab]);

  // ── Poll unread count ──────────────────────────────────────────────────────
  useEffect(() => {
    const tick = async () => {
      try {
        const { data } = await api.get<{ count: number }>("/api/v1/notifications/count");
        onCountChange(data.count ?? 0);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, [onCountChange]);

  // ── Refetch when panel opens or tab changes ────────────────────────────────
  useEffect(() => {
    if (open) fetchNotifs();
  }, [open, tab, fetchNotifs]);

  /**
   * Deteksi status langganan — TIDAK meminta izin.
   *
   * Meminta izin notifikasi tanpa diminta adalah pola yang ditolak browser
   * modern (Chrome memblokir prompt yang tak lahir dari gestur pengguna) dan
   * ditolak penggunanya: orang menekan "Block" pada permintaan yang muncul
   * tiba-tiba, dan sesudah itu izinnya TAK BISA diminta lagi tanpa masuk
   * setelan browser. Jadi status dibaca saja di sini; permintaannya lahir dari
   * tombol yang ditekan sadar.
   */
  useEffect(() => {
    if (!open) return;
    let batal = false;
    void Promise.resolve().then(async () => {
      if (typeof window === "undefined"
        || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!batal) setPushAktif(null);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!batal) setPushAktif(Boolean(sub));
      } catch {
        if (!batal) setPushAktif(null);
      }
    });
    return () => { batal = true; };
  }, [open]);

  const togelPush = useCallback(async () => {
    setPushProses(true);
    try {
      const { subscribeToPush, unsubscribeFromPush } = await import("@/lib/webpush");
      if (pushAktif) {
        await unsubscribeFromPush();
        setPushAktif(false);
      } else {
        const ok = await subscribeToPush();
        setPushAktif(ok);
        // `false` di sini berarti izin DITOLAK atau VAPID tak terkonfigurasi —
        // dua sebab berbeda yang sama-sama tak bisa dipulihkan dari sini.
        // Dikatakan apa adanya, bukan didiamkan.
        if (!ok) {
          // Toast, bukan `alert()`: alert memblokir seluruh halaman dan
          // tampilannya berbeda tiap browser — di aplikasi yang punya sistem
          // toast sendiri, memakainya justru terasa seperti kerusakan.
          showToast(
            "error",
            "Notifikasi perangkat tidak bisa diaktifkan — izin notifikasi " +
            "kemungkinan ditolak. Buka setelan situs ini di browser, izinkan " +
            "Notifications, lalu coba lagi."
          );
        }
      }
    } finally {
      setPushProses(false);
    }
  }, [pushAktif, showToast]);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Mark as read ──────────────────────────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/api/v1/notifications/${id}/read`);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      onCountChange(Math.max(0, unreadCount - 1));
    } catch (err) {
      // best-effort: menandai "sudah dibaca" tak mengubah data bisnis apa pun,
      // dan memunculkan dialog untuk itu justru mengganggu. Tapi tak ditelan —
      // badge yang salah hitung selalu bermula dari sini.
      console.error("gagal menandai notifikasi dibaca", err);
    }
  }, [unreadCount, onCountChange]);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch("/api/v1/notifications/read-all");
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
      onCountChange(0);
    } catch (err) {
      // best-effort — sama alasan dengan `markRead`.
      console.error("gagal menandai semua notifikasi dibaca", err);
    }
  }, [onCountChange]);

  // ── Action handler ─────────────────────────────────────────────────────────
  const handleAction = useCallback(async (id: string, action: "approve" | "reject") => {
    setActioningId(id);
    try {
      await api.post(`/api/v1/notifications/${id}/action`, { action });
      setNotifs(prev => prev.map(n => n.id === id
        ? { ...n, is_actioned: true, is_read: true }
        : n
      ));
      onCountChange(Math.max(0, unreadCount - 1));
    } catch (err: unknown) {
      // Ini approve/reject KASBON — uang. Kegagalan senyap di sini berarti
      // baris notifikasinya tetap berubah jadi "sudah ditindak" sementara
      // kasbonnya tak berubah sama sekali; mandor menunggu pencairan yang
      // tak pernah disetujui, dan yang menyetujui yakin sudah melakukannya.
      alert((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Gagal memproses tindakan");
    }
    setActioningId(null);
  }, [unreadCount, onCountChange]);

  // ── Click on notification row ──────────────────────────────────────────────
  const handleRowClick = useCallback((notif: Notification) => {
    if (!notif.is_read) markRead(notif.id);
    if (notif.action_url) {
      setOpen(false);
      router.push(notif.action_url);
    }
  }, [markRead, router]);

  // ── Position panel below bell button ──────────────────────────────────────
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0 });
  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, [open]);

  const filteredNotifs = notifs; // server already filters by tab

  // ── Bell button (rendered inline, not in portal) ───────────────────────────
  const bellButton = (
    <button aria-label="Notifikasi"
      ref={btnRef}
      onClick={() => setOpen(v => !v)}
      title="Notifikasi"
      style={{
        position: "relative",
        width: 36, height: 36, borderRadius: 8,
        background: open ? C.navyLight : "transparent",
        border: "none", cursor: "pointer",
        color: open ? C.navy : C.mid,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => {
        if (!open) {
          e.currentTarget.style.background = "var(--surface-hover)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={e => {
        if (!open) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = C.mid;
        }
      }}
    >
      <Bell size={15} />
      {unreadCount > 0 && (
        <span style={{
          position: "absolute", top: 5, right: 5,
          minWidth: unreadCount > 9 ? 16 : 14,
          height: unreadCount > 9 ? 16 : 14,
          borderRadius: 9999,
          background: C.navy,
          border: "1.5px solid var(--surface)",
          color: "var(--surface)",
          fontSize: 9, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
          padding: unreadCount > 9 ? "0 3px" : 0,
        }}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );

  // ── Panel (in portal) ──────────────────────────────────────────────────────
  const panel = open && typeof document !== "undefined" ? createPortal(
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: panelPos.top,
        right: panelPos.right,
        width: 380,
        maxHeight: "80vh",
        background: C.white,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column",
        zIndex: 9999,
        overflow: "hidden",
        animation: "notifSlideIn 0.18s ease",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "14px 16px 10px",
        borderBottom: `1px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Notifikasi</span>
          {unreadCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              padding: "1px 7px", borderRadius: 9999,
              background: C.navy, color: "var(--surface)",
            }}>{unreadCount}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {pushAktif !== null && (
            <button
              aria-label={pushAktif
                ? "Matikan notifikasi di perangkat ini"
                : "Aktifkan notifikasi di perangkat ini"}
              title={pushAktif
                ? "Notifikasi perangkat aktif — klik untuk mematikan"
                : "Terima notifikasi walau aplikasi ditutup"}
              onClick={() => void togelPush()}
              disabled={pushProses}
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 6,
                border: `1px solid ${pushAktif ? C.navy : C.border}`,
                background: "transparent",
                fontSize: 11, color: pushAktif ? C.navy : C.mid,
                cursor: pushProses ? "wait" : "pointer",
                opacity: pushProses ? 0.6 : 1,
              }}
            >
              {pushAktif ? <BellRing size={11} /> : <BellOff size={11} />}
              {pushAktif ? "Perangkat aktif" : "Aktifkan di perangkat"}
            </button>
          )}
          {unreadCount > 0 && (
            <button aria-label="Tandai semua dibaca"
              onClick={markAllRead}
              title="Tandai semua dibaca"
              style={{
                display: "flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 6,
                border: `1px solid ${C.border}`, background: "transparent",
                fontSize: 11, color: C.mid, cursor: "pointer",
              }}
            >
              <CheckCheck size={11} /> Tandai Semua Dibaca
            </button>
          )}
          <button aria-label="Tutup panel notifikasi"
            onClick={() => setOpen(false)}
            style={{
              width: 28, height: 28, borderRadius: 6,
              border: "none", background: "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: C.muted,
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: "flex", gap: 0,
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        {(["all", "unread", "urgent"] as FilterTab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "8px 0",
              border: "none", background: "transparent",
              fontSize: 12, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? C.navy : C.mid,
              cursor: "pointer",
              borderBottom: tab === t ? `2px solid ${C.navy}` : "2px solid transparent",
              transition: "all 0.15s",
            }}
          >
            {t === "all" ? "Semua" : t === "unread" ? "Belum Dibaca" : "Urgen"}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading ? (
          <>
            <Skeleton /><Skeleton /><Skeleton />
          </>
        ) : filteredNotifs.length === 0 ? (
          <div style={{
            padding: 40, textAlign: "center",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          }}>
            <Bell size={32} strokeWidth={1.5} color={C.muted} />
            <span style={{ fontSize: 13, color: C.muted }}>
              {tab === "unread" ? "Tidak ada notifikasi yang belum dibaca" :
               tab === "urgent" ? "Tidak ada notifikasi urgen" :
               "Belum ada notifikasi"}
            </span>
          </div>
        ) : (
          filteredNotifs.map(notif => {
            const { color, bg } = typeColor(notif.type);
            const isActioning = actioningId === notif.id;
            return (
              <div
                key={notif.id}
                role="button"
                tabIndex={0}
                onClick={() => handleRowClick(notif)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()   // Spasi jangan menggulir panel
                    handleRowClick(notif)
                  }
                }}
                style={{
                  padding: "12px 16px",
                  borderBottom: `1px solid ${C.border}`,
                  cursor: notif.action_url ? "pointer" : "default",
                  background: notif.is_read ? C.white : "var(--info-bg)",
                  opacity: isActioning ? 0.6 : 1,
                  transition: "background 0.15s",
                  display: "flex", gap: 10, alignItems: "flex-start",
                }}
                onMouseEnter={e => {
                  if (!isActioning) e.currentTarget.style.background = notif.is_read ? C.bg : "var(--navy-light)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = notif.is_read ? C.white : "var(--info-bg)";
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: bg, color: color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {typeIcon(notif.type)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 12, fontWeight: notif.is_read ? 500 : 700,
                      color: C.text, flex: 1,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {notif.title}
                    </span>
                    {priorityBadge(notif.priority)}
                    {!notif.is_read && (
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: C.navy, flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <p style={{
                    margin: 0, fontSize: 11, color: C.mid,
                    display: "-webkit-box",
                    WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: 1.5,
                  }}>
                    {notif.message}
                  </p>
                  <span style={{ fontSize: 10, color: C.muted, marginTop: 4, display: "block" }}>
                    {relativeTime(notif.sent_at)}
                  </span>
                  <ActionButtons notif={notif} onAction={handleAction} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "10px 16px",
        borderTop: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        <button
          onClick={() => { setOpen(false); router.push("/notifications"); }}
          style={{
            width: "100%", padding: "8px 0",
            background: C.bg, border: `1px solid ${C.border}`,
            borderRadius: 8, cursor: "pointer",
            fontSize: 12, fontWeight: 600, color: C.navy,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
          }}
        >
          Lihat Semua Riwayat <ChevronRight size={12} />
        </button>
      </div>

      {/* Animation keyframe injected once */}
      <style>{`
        @keyframes notifSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {bellButton}
      {panel}
    </>
  );
}
