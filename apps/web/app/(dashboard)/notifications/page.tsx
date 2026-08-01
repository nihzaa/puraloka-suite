"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Check, X, CheckCheck, Trash2, 
  Banknote, FileText, Flag, TrendingUp, FolderKanban, ClipboardList,
  Search,
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

const card: React.CSSProperties = {
  background: C.white,
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
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

const TYPE_LABELS: Record<string, string> = {
  kasbon_pending:         "Kasbon",
  kasbon_approved:        "Kasbon",
  kasbon_rejected:        "Kasbon",
  invoice_created:        "Invoice",
  invoice_due:            "Invoice",
  invoice_overdue:        "Invoice",
  invoice_paid:           "Invoice",
  milestone_approaching:  "Milestone",
  milestone_overdue:      "Milestone",
  milestone_completed:    "Milestone",
  progress_submitted:     "Progress",
  project_assigned:       "Proyek",
  project_status_changed: "Proyek",
  wage_report_submitted:  "Upah",
};

type TypeFilter = "all" | "kasbon" | "invoice" | "milestone" | "progress" | "proyek" | "upah";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function fmtTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function groupByDay(notifs: Notification[]): Array<{ label: string; items: Notification[] }> {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const week      = new Date(Date.now() - 7 * 86400000);

  const groups = new Map<string, Notification[]>();

  for (const n of notifs) {
    const d = new Date(n.sent_at);
    let key: string;
    if (d.toDateString() === today)     key = "Hari ini";
    else if (d.toDateString() === yesterday) key = "Kemarin";
    else if (d >= week)                 key = "7 Hari Terakhir";
    else key = fmtDate(n.sent_at);

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(n);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function typeIcon(type: string | null, size = 15) {
  switch (TYPE_LABELS[type ?? ""] ?? "") {
    case "Kasbon":    return <Banknote size={size} />;
    case "Invoice":   return <FileText size={size} />;
    case "Milestone": return <Flag size={size} />;
    case "Progress":  return <TrendingUp size={size} />;
    case "Proyek":    return <FolderKanban size={size} />;
    case "Upah":      return <ClipboardList size={size} />;
    default:          return <Bell size={size} />;
  }
}

function typeColors(type: string | null): { color: string; bg: string } {
  switch (TYPE_LABELS[type ?? ""] ?? "") {
    case "Kasbon":    return { color: C.yellow, bg: C.yellowBg };
    case "Invoice":   return { color: C.green,  bg: C.greenBg  };
    case "Milestone": return { color: C.blue,   bg: C.blueBg   };
    case "Progress":  return { color: C.navy,   bg: C.navyLight };
    case "Proyek":    return { color: C.navy,   bg: C.navyLight };
    case "Upah":      return { color: C.mid,    bg: C.bg       };
    default:          return { color: C.mid,    bg: C.bg       };
  }
}

function isActionable(notif: Notification): boolean {
  return (
    !notif.is_actioned &&
    (notif.action_type === "approve_kasbon" ||
     notif.action_type === "reject_kasbon"  ||
     notif.action_type === "approve_wage_report" ||
     notif.action_type === "reject_wage_report")
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();

  const [notifs, setNotifs]           = useState<Notification[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(true);
  const [offset, setOffset]           = useState(0);
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState<TypeFilter>("all");
  const [readFilter, setReadFilter]   = useState<"all" | "unread">("all");
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [actioningId, setActioningId] = useState<string | null>(null);

  const LIMIT = 20;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchNotifs = useCallback(async (reset = false) => {
    const off = reset ? 0 : offset;
    if (reset) setLoading(true); else setLoadingMore(true);

    try {
      const params: Record<string, string> = {
        limit: String(LIMIT),
        offset: String(off),
      };
      if (readFilter === "unread") params.is_read = "false";

      const { data } = await api.get<{ notifications: Notification[] }>(
        "/api/v1/notifications", { params }
      );
      const fetched = data.notifications ?? [];
      if (reset) setNotifs(fetched);
      else setNotifs(prev => [...prev, ...fetched]);
      setOffset(off + fetched.length);
      setHasMore(fetched.length === LIMIT);
    } catch { /* ignore */ }

    if (reset) setLoading(false); else setLoadingMore(false);
  }, [offset, readFilter]);

  useEffect(() => {
    fetchNotifs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readFilter]);

  // ── Client-side filter by search + type ───────────────────────────────────
  const filtered = notifs.filter(n => {
    const matchSearch = !search ||
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.message.toLowerCase().includes(search.toLowerCase());

    const matchType = typeFilter === "all" ||
      (TYPE_LABELS[n.type ?? ""] ?? "").toLowerCase() === typeFilter.toLowerCase() ||
      (typeFilter === "kasbon"    && (n.type ?? "").startsWith("kasbon")) ||
      (typeFilter === "invoice"   && (n.type ?? "").startsWith("invoice")) ||
      (typeFilter === "milestone" && (n.type ?? "").startsWith("milestone")) ||
      (typeFilter === "progress"  && n.type === "progress_submitted") ||
      (typeFilter === "proyek"    && (n.type ?? "").startsWith("project")) ||
      (typeFilter === "upah"      && n.type === "wage_report_submitted");

    return matchSearch && matchType;
  });

  const groups = groupByDay(filtered);

  // ── Actions ────────────────────────────────────────────────────────────────
  const markRead = useCallback(async (id: string) => {
    try {
      await api.patch(`/api/v1/notifications/${id}/read`);
      setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* ignore */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await api.patch("/api/v1/notifications/read-all");
      setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* ignore */ }
  }, []);

  const deleteNotif = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/v1/notifications/${id}`);
      setNotifs(prev => prev.filter(n => n.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    } catch { /* ignore */ }
  }, []);

  const handleAction = useCallback(async (id: string, action: "approve" | "reject") => {
    setActioningId(id);
    try {
      await api.post(`/api/v1/notifications/${id}/action`, { action });
      setNotifs(prev => prev.map(n => n.id === id
        ? { ...n, is_actioned: true, is_read: true }
        : n
      ));
    } catch { /* ignore */ }
    setActioningId(null);
  }, []);

  const handleRowClick = useCallback((notif: Notification) => {
    if (!notif.is_read) markRead(notif.id);
    if (notif.action_url) router.push(notif.action_url);
  }, [markRead, router]);

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const bulkMarkRead = async () => {
    for (const id of selected) await markRead(id);
    setSelected(new Set());
  };

  const bulkDelete = async () => {
    for (const id of selected) await deleteNotif(id);
    setSelected(new Set());
  };

  const unreadCount = notifs.filter(n => !n.is_read).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", minHeight: "100vh", background: C.bg, width: "100%", maxWidth: "var(--w-form)", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text }}>Notifikasi</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: C.mid }}>
            Riwayat semua notifikasi sistem
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8,
                border: `1px solid ${C.border}`, background: C.white,
                fontSize: 13, fontWeight: 500, color: C.mid, cursor: "pointer",
              }}
            >
              <CheckCheck size={14} /> Tandai Semua Dibaca
            </button>
          )}
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.muted }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari notifikasi..."
            style={{
              width: "100%", padding: "8px 12px 8px 32px",
              border: `1px solid ${C.border}`, borderRadius: 8,
              background: C.white, fontSize: 13, color: C.text,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Read filter */}
        <select
          aria-label="Saring status baca"
          value={readFilter}
          onChange={e => setReadFilter(e.target.value as "all" | "unread")}
          style={{
            padding: "8px 12px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.white,
            fontSize: 13, color: C.text, cursor: "pointer",
          }}
        >
          <option value="all">Semua</option>
          <option value="unread">Belum Dibaca</option>
        </select>

        {/* Type filter */}
        <select
          aria-label="Saring jenis notifikasi"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as TypeFilter)}
          style={{
            padding: "8px 12px", borderRadius: 8,
            border: `1px solid ${C.border}`, background: C.white,
            fontSize: 13, color: C.text, cursor: "pointer",
          }}
        >
          <option value="all">Semua Jenis</option>
          <option value="kasbon">Kasbon</option>
          <option value="invoice">Invoice</option>
          <option value="milestone">Milestone</option>
          <option value="progress">Progress</option>
          <option value="proyek">Proyek</option>
          <option value="upah">Upah</option>
        </select>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div style={{
          ...card,
          padding: "10px 16px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 12,
          borderColor: C.navy,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>
            {selected.size} dipilih
          </span>
          <button
            onClick={bulkMarkRead}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 12px", borderRadius: 6,
              border: `1px solid ${C.border}`, background: C.white,
              fontSize: 12, fontWeight: 500, color: C.mid, cursor: "pointer",
            }}
          >
            <Check size={12} /> Tandai Dibaca
          </button>
          <button
            onClick={bulkDelete}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 12px", borderRadius: 6,
              border: `1px solid ${C.red}`, background: C.redBg,
              fontSize: 12, fontWeight: 500, color: C.red, cursor: "pointer",
            }}
          >
            <Trash2 size={12} /> Hapus
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{
              marginLeft: "auto", padding: "5px 8px", borderRadius: 6,
              border: "none", background: "transparent",
              fontSize: 12, color: C.muted, cursor: "pointer",
            }}
          >
            Batal
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>
          Memuat notifikasi...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          ...card, padding: 60,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        }}>
          <Bell size={40} strokeWidth={1.5} color={C.muted} />
          <span style={{ fontSize: 14, color: C.muted }}>Tidak ada notifikasi ditemukan</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {groups.map(group => (
            <div key={group.label}>
              {/* Day label */}
              <div style={{
                fontSize: 11, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: "0.06em",
                marginBottom: 8,
              }}>
                {group.label}
              </div>

              <div style={card}>
                {group.items.map((notif, idx) => {
                  const { color, bg } = typeColors(notif.type);
                  const isLast   = idx === group.items.length - 1;
                  const isActioning = actioningId === notif.id;
                  const canAction = isActionable(notif);
                  const isSelected = selected.has(notif.id);

                  return (
                    <div
                      key={notif.id}
                      style={{
                        display: "flex", gap: 12, padding: "14px 16px",
                        borderBottom: isLast ? "none" : `1px solid ${C.border}`,
                        background: isSelected ? "var(--navy-light)" : notif.is_read ? C.white : "#F0F5FF",
                        transition: "background 0.15s",
                        opacity: isActioning ? 0.6 : 1,
                      }}
                    >
                      {/* Checkbox */}
                      <div
                        onClick={() => toggleSelect(notif.id)}
                        style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 2,
                          border: `2px solid ${isSelected ? C.navy : C.border}`,
                          background: isSelected ? C.navy : C.white,
                          cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {isSelected && <Check size={10} color="var(--surface)" />}
                      </div>

                      {/* Icon */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: bg, color,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {typeIcon(notif.type)}
                      </div>

                      {/* Content */}
                      <div
                        style={{ flex: 1, minWidth: 0, cursor: notif.action_url ? "pointer" : "default" }}
                        onClick={() => handleRowClick(notif)}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{
                            fontSize: 13, fontWeight: notif.is_read ? 500 : 700,
                            color: C.text, flex: 1,
                          }}>
                            {notif.title}
                          </span>
                          {notif.priority === "urgent" && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "1px 5px",
                              borderRadius: 4, background: C.redBg, color: C.red,
                              textTransform: "uppercase",
                            }}>URGEN</span>
                          )}
                          {notif.priority === "high" && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "1px 5px",
                              borderRadius: 4, background: C.yellowBg, color: C.yellow,
                              textTransform: "uppercase",
                            }}>PENTING</span>
                          )}
                          {notif.is_actioned && (
                            <span style={{
                              fontSize: 10, fontWeight: 600, padding: "1px 5px",
                              borderRadius: 4, background: C.greenBg, color: C.green,
                            }}>Sudah Diproses</span>
                          )}
                          {!notif.is_read && (
                            <span style={{
                              width: 7, height: 7, borderRadius: "50%",
                              background: C.navy, flexShrink: 0,
                            }} />
                          )}
                        </div>

                        <p style={{ margin: "0 0 4px", fontSize: 12, color: C.mid, lineHeight: 1.5 }}>
                          {notif.message}
                        </p>
                        <span style={{ fontSize: 11, color: C.muted }}>
                          {fmtDate(notif.sent_at)} · {fmtTime(notif.sent_at)}
                        </span>

                        {/* Inline action buttons */}
                        {canAction && (
                          <div
                            style={{ display: "flex", gap: 8, marginTop: 10 }}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleAction(notif.id, "approve")}
                              disabled={isActioning}
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "6px 14px", borderRadius: 7,
                                border: `1px solid ${C.green}`, background: C.greenBg,
                                color: C.green, fontSize: 12, fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              <Check size={12} /> Setujui
                            </button>
                            <button
                              onClick={() => handleAction(notif.id, "reject")}
                              disabled={isActioning}
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "6px 14px", borderRadius: 7,
                                border: `1px solid ${C.red}`, background: C.redBg,
                                color: C.red, fontSize: 12, fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              <X size={12} /> Tolak
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Row actions */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                        {!notif.is_read && (
                          <button aria-label="Tandai dibaca"
                            onClick={e => { e.stopPropagation(); markRead(notif.id); }}
                            title="Tandai dibaca"
                            style={{
                              width: 28, height: 28, borderRadius: 6, border: "none",
                              background: "transparent", cursor: "pointer", color: C.muted,
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >
                            <Check size={13} />
                          </button>
                        )}
                        <button aria-label="Hapus notifikasi"
                          onClick={e => { e.stopPropagation(); deleteNotif(notif.id); }}
                          title="Hapus notifikasi"
                          style={{
                            width: 28, height: 28, borderRadius: 6, border: "none",
                            background: "transparent", cursor: "pointer", color: C.muted,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Load more */}
          {hasMore && (
            <button
              onClick={() => fetchNotifs(false)}
              disabled={loadingMore}
              style={{
                padding: "10px 0", borderRadius: 10,
                border: `1px solid ${C.border}`, background: C.white,
                fontSize: 13, fontWeight: 500, color: C.mid, cursor: "pointer",
              }}
            >
              {loadingMore ? "Memuat..." : "Muat Lebih Banyak"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
