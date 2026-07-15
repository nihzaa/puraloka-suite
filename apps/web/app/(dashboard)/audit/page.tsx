"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { api, getStoredUser } from "@/lib/api";
import { useToast } from "@/components/toast";
import {
  ShieldCheck, Search, Filter, ChevronLeft, ChevronRight,
  Clock, User, Database, RefreshCw, AlertCircle, FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user: { id: string; name: string; email: string; role: string } | null;
}

interface Meta { total: number; page: number; limit: number; pages: number }
interface AuditMeta { tables: string[]; actions: string[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

const ACTION_COLORS: Record<string, { bg: string; color: string }> = {
  insert:                   { bg: "#F0FDF4", color: "#15803d" },
  update:                   { bg: "#EFF6FF", color: "#1D4ED8" },
  delete:                   { bg: "#FEF2F2", color: "#B91C1C" },
  change_order_approved:    { bg: "#FFF7ED", color: "#C2410C" },
  change_order_rejected:    { bg: "#FEF2F2", color: "#B91C1C" },
  soft_delete:              { bg: "#FFF7ED", color: "#D97706" },
};

function actionStyle(action: string) {
  return ACTION_COLORS[action] ?? { bg: "#F3F4F6", color: "#374151" };
}

const TABLE_ICON: Record<string, string> = {
  projects:      "📁",
  change_orders: "📋",
  rab_items:     "📊",
  kasbons:       "💰",
  invoices:      "🧾",
  users:         "👤",
  contracts:     "📜",
};

function tableIcon(t: string) {
  return TABLE_ICON[t] ?? "🗄️";
}

function DiffView({ oldVal, newVal }: { oldVal: Record<string, unknown> | null; newVal: Record<string, unknown> | null }) {
  if (!oldVal && !newVal) return <span style={{ color: "#9CA3AF", fontSize: 11 }}>Tidak ada data</span>;

  const allKeys = [...new Set([...Object.keys(oldVal ?? {}), ...Object.keys(newVal ?? {})])];
  const changed = allKeys.filter(k => JSON.stringify((oldVal ?? {})[k]) !== JSON.stringify((newVal ?? {})[k]));

  if (changed.length === 0) {
    return <span style={{ color: "#9CA3AF", fontSize: 11 }}>Tidak ada perubahan nilai</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {changed.slice(0, 8).map(key => (
        <div key={key} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
          <span style={{ fontWeight: 700, color: "#374151", minWidth: 120, flexShrink: 0 }}>{key}</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
            {oldVal && oldVal[key] !== undefined && (
              <span style={{ padding: "1px 6px", borderRadius: 4, background: "#FEE2E2", color: "#991B1B", fontFamily: "monospace" }}>
                {String(oldVal[key]).slice(0, 80)}
              </span>
            )}
            {newVal && newVal[key] !== undefined && (
              <span style={{ padding: "1px 6px", borderRadius: 4, background: "#DCFCE7", color: "#166534", fontFamily: "monospace" }}>
                {String(newVal[key]).slice(0, 80)}
              </span>
            )}
          </div>
        </div>
      ))}
      {changed.length > 8 && (
        <span style={{ fontSize: 10, color: "#9CA3AF" }}>+{changed.length - 8} kolom lainnya</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditPage() {
  const user = getStoredUser();
  const { showToast } = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [meta, setMeta] = useState<Meta>({ total: 0, page: 1, limit: 50, pages: 1 });
  const [auditMeta, setAuditMeta] = useState<AuditMeta>({ tables: [], actions: [] });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMeta = useCallback(async () => {
    try {
      const { data } = await api.get<AuditMeta>("/api/v1/audit/meta");
      setAuditMeta(data);
    } catch { /* non-fatal */ }
  }, []);

  const fetchLogs = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(p));
      params.set("limit", "50");
      if (filterTable)  params.set("table_name", filterTable);
      if (filterAction) params.set("action", filterAction);
      if (filterFrom)   params.set("from", filterFrom);
      if (filterTo)     params.set("to", filterTo);
      const { data } = await api.get<{ logs: AuditLog[]; meta: Meta }>(`/api/v1/audit?${params}`);
      setLogs(data.logs);
      setMeta(data.meta);
    } catch {
      showToast("error", "Gagal memuat audit log");
    } finally {
      setLoading(false);
    }
  }, [filterTable, filterAction, filterFrom, filterTo, page]);

  useEffect(() => { fetchMeta(); }, []);
  useEffect(() => { setPage(1); fetchLogs(1); }, [filterTable, filterAction, filterFrom, filterTo]);
  useEffect(() => { fetchLogs(page); }, [page]);

  const filteredLogs = search
    ? logs.filter(l =>
        l.table_name.includes(search.toLowerCase()) ||
        l.action.includes(search.toLowerCase()) ||
        l.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
        l.record_id.includes(search)
      )
    : logs;

  const card: React.CSSProperties = {
    background: "#fff", border: "1px solid #E5E7EB",
    borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  };

  if (user?.role !== "admin") {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "#B91C1C", marginBottom: 12 }} />
        <p style={{ color: "#374151" }}>Halaman ini hanya untuk Admin.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 36px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12,
            background: "linear-gradient(135deg, #003366, #0066CC)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ShieldCheck size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "#111827", margin: 0 }}>Audit Trail</h1>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>
              {meta.total.toLocaleString("id-ID")} entri total
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchLogs(page)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
        >
          <RefreshCw size={13} style={{ color: "#6B7280" }} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ ...card, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF" }} />
          <input
            type="text" placeholder="Cari nama, action, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Table filter */}
        <select
          value={filterTable}
          onChange={e => setFilterTable(e.target.value)}
          style={{ height: 36, borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, padding: "0 10px", flex: "0 0 auto", minWidth: 150 }}
        >
          <option value="">Semua Tabel</option>
          {auditMeta.tables.map(t => (
            <option key={t} value={t}>{tableIcon(t)} {t}</option>
          ))}
        </select>

        {/* Action filter */}
        <select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          style={{ height: 36, borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, padding: "0 10px", flex: "0 0 auto", minWidth: 160 }}
        >
          <option value="">Semua Action</option>
          {auditMeta.actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Date range */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            style={{ height: 36, borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, padding: "0 8px" }}
          />
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>—</span>
          <input
            type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            style={{ height: 36, borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 12, padding: "0 8px" }}
          />
        </div>

        {/* Clear filters */}
        {(filterTable || filterAction || filterFrom || filterTo || search) && (
          <button
            onClick={() => { setFilterTable(""); setFilterAction(""); setFilterFrom(""); setFilterTo(""); setSearch(""); }}
            style={{ height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", fontSize: 12, cursor: "pointer" }}
          >
            Reset Filter
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: "INSERT", count: logs.filter(l => l.action === "insert").length, color: "#15803d", bg: "#F0FDF4" },
          { label: "UPDATE", count: logs.filter(l => l.action === "update").length, color: "#1D4ED8", bg: "#EFF6FF" },
          { label: "DELETE", count: logs.filter(l => l.action === "delete" || l.action === "soft_delete").length, color: "#B91C1C", bg: "#FEF2F2" },
          { label: "LAINNYA", count: logs.filter(l => !["insert","update","delete","soft_delete"].includes(l.action)).length, color: "#D97706", bg: "#FFFBEB" },
        ].map(chip => chip.count > 0 && (
          <span key={chip.label} style={{ padding: "3px 10px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: chip.bg, color: chip.color }}>
            {chip.label} · {chip.count}
          </span>
        ))}
      </div>

      {/* Log table */}
      <div style={card}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>Memuat...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Database size={28} style={{ color: "#D1D5DB", marginBottom: 8 }} />
            <p style={{ color: "#9CA3AF", fontSize: 13 }}>Tidak ada log yang cocok</p>
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const isExpanded = expanded === log.id;
            const ast = actionStyle(log.action);

            return (
              <div
                key={log.id}
                style={{ borderBottom: i < filteredLogs.length - 1 ? "1px solid #F3F4F6" : "none" }}
              >
                {/* Row summary */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : log.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "13px 20px", cursor: "pointer",
                    background: isExpanded ? "#FAFAFA" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "#FAFAFA"; }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Table icon */}
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{tableIcon(log.table_name)}</span>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                        background: ast.bg, color: ast.color, textTransform: "uppercase",
                      }}>{log.action}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{log.table_name}</span>
                      <span style={{ fontSize: 11, color: "#9CA3AF", fontFamily: "monospace" }}>
                        {log.record_id.slice(0, 8)}…
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
                      {log.new_values ? (
                        Object.keys(log.new_values).slice(0, 4).join(", ") +
                        (Object.keys(log.new_values).length > 4 ? ` +${Object.keys(log.new_values).length - 4} lainnya` : "")
                      ) : ""}
                    </div>
                  </div>

                  {/* User */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", background: "#EBF2FF",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <User size={13} style={{ color: "#003366" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>
                        {log.user?.name ?? "—"}
                      </div>
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>{log.user?.role ?? ""}</div>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, minWidth: 140 }}>
                    <Clock size={11} style={{ color: "#D1D5DB" }} />
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{fmtDate(log.created_at)}</span>
                  </div>

                  {/* Expand indicator */}
                  <span style={{ fontSize: 14, color: "#D1D5DB", flexShrink: 0, transition: "transform 0.15s", transform: isExpanded ? "rotate(180deg)" : "none" }}>▾</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "0 20px 16px 20px", background: "#FAFAFA", borderTop: "1px solid #F3F4F6" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
                      {/* Metadata */}
                      <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Detail</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {[
                            { label: "ID Log", val: log.id },
                            { label: "Record ID", val: log.record_id },
                            { label: "Tabel", val: log.table_name },
                            { label: "Action", val: log.action },
                            { label: "User", val: log.user ? `${log.user.name} (${log.user.email})` : "System" },
                            { label: "Waktu", val: fmtDate(log.created_at) },
                          ].map(({ label, val }) => (
                            <div key={label} style={{ display: "flex", gap: 8 }}>
                              <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 80, flexShrink: 0 }}>{label}</span>
                              <span style={{ fontSize: 11, color: "#374151", fontFamily: label === "ID Log" || label === "Record ID" ? "monospace" : "inherit", wordBreak: "break-all" }}>{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Diff */}
                      <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border: "1px solid #E5E7EB" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                          Perubahan
                          {log.old_values && <span style={{ marginLeft: 8, padding: "1px 5px", borderRadius: 4, background: "#FEE2E2", color: "#991B1B", fontSize: 9 }}>SEBELUM</span>}
                          {log.new_values && <span style={{ marginLeft: 4, padding: "1px 5px", borderRadius: 4, background: "#DCFCE7", color: "#166534", fontSize: 9 }}>SESUDAH</span>}
                        </div>
                        <DiffView oldVal={log.old_values} newVal={log.new_values} />
                      </div>
                    </div>

                    {/* Raw JSON toggle */}
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 11, color: "#6B7280", cursor: "pointer", userSelect: "none" }}>
                        <FileText size={11} style={{ display: "inline", marginRight: 4 }} />
                        Lihat JSON mentah
                      </summary>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>old_values</div>
                          <pre style={{ fontSize: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: 10, overflow: "auto", maxHeight: 200, margin: 0, color: "#374151" }}>
                            {JSON.stringify(log.old_values, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 4 }}>new_values</div>
                          <pre style={{ fontSize: 10, background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 6, padding: 10, overflow: "auto", maxHeight: 200, margin: 0, color: "#374151" }}>
                            {JSON.stringify(log.new_values, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: page <= 1 ? "#F9FAFB" : "#fff", cursor: page <= 1 ? "not-allowed" : "pointer" }}
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(meta.pages, 7) }, (_, i) => {
            const p = meta.pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= meta.pages - 3 ? meta.pages - 6 + i : page - 3 + i;
            return (
              <button
                key={p}
                onClick={() => setPage(p)}
                style={{
                  width: 34, height: 34, borderRadius: 8,
                  border: p === page ? "none" : "1px solid #E5E7EB",
                  background: p === page ? "#003366" : "#fff",
                  color: p === page ? "#fff" : "#374151",
                  fontSize: 13, fontWeight: p === page ? 700 : 400, cursor: "pointer",
                }}
              >
                {p}
              </button>
            );
          })}
          <button
            disabled={page >= meta.pages}
            onClick={() => setPage(p => p + 1)}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: page >= meta.pages ? "#F9FAFB" : "#fff", cursor: page >= meta.pages ? "not-allowed" : "pointer" }}
          >
            <ChevronRight size={14} />
          </button>
          <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: 4 }}>
            Hal. {page} dari {meta.pages} · {meta.total.toLocaleString("id-ID")} entri
          </span>
        </div>
      )}
    </div>
  );
}
