"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Search, FolderKanban, Contact, Receipt, Wallet,
  Users, Target, Loader2, ArrowRight, Command,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  type: string;
  id: string;
  title: string;
  sub: string;
  url: string;
  meta?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
}> = {
  project:   { icon: <FolderKanban size={13} />, label: "Proyek",   color: "var(--navy)", bg: "var(--navy-light)" },
  client:    { icon: <Contact size={13} />,      label: "Klien",    color: "#0F766E", bg: "var(--success-bg)" },
  invoice:   { icon: <Receipt size={13} />,      label: "Invoice",  color: "var(--success)", bg: "var(--success-bg)" },
  kasbon:    { icon: <Wallet size={13} />,        label: "Kasbon",   color: "var(--warning)", bg: "var(--warning-bg)" },
  milestone: { icon: <Target size={13} />,        label: "Milestone",color: "var(--aksen)", bg: "var(--navy-light)" },
  user:      { icon: <Users size={13} />,         label: "User",     color: "var(--text-secondary)", bg: "var(--surface-hover)" },
};

const STATUS_COLOR: Record<string, string> = {
  active: "var(--success)", aktif: "var(--success)",
  completed: "var(--success)", selesai: "var(--success)",
  pending: "var(--warning)",
  approved: "var(--info)",
  rejected: "var(--danger)", ditolak: "var(--danger)",
  on_hold: "var(--warning)",
  cancelled: "var(--text-muted)",
  paid: "var(--success)",
  submitted: "var(--warning)",
};

function metaColor(meta?: string) {
  if (!meta) return "var(--text-muted)";
  const key = meta.toLowerCase().replace(/\s/g, "_");
  return STATUS_COLOR[key] ?? "var(--text-muted)";
}

// ─── Quick actions (always visible, no query needed) ─────────────────────────

const QUICK_ACTIONS = [
  { label: "Buka Dashboard",  url: "/dashboard",    icon: <FolderKanban size={13} /> },
  { label: "Daftar Proyek",   url: "/proyek",        icon: <FolderKanban size={13} /> },
  { label: "Halaman Mandor",  url: "/mandor",        icon: <Wallet size={13} /> },
  { label: "Keuangan",        url: "/keuangan",      icon: <Receipt size={13} /> },
  { label: "Laporan",         url: "/laporan",       icon: <Receipt size={13} /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when palette opens
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await api.get<{ results: SearchResult[] }>(`/api/v1/search?q=${encodeURIComponent(q)}&limit=10`);
      setResults(data.results);
      setSelected(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(() => doSearch(query), 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, doSearch]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const items = query.trim().length >= 2 ? results : QUICK_ACTIONS;
    const count = items.length;

    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => (s + 1) % count); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => (s - 1 + count) % count); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const url = query.trim().length >= 2
          ? results[selected]?.url
          : QUICK_ACTIONS[selected]?.url;
        if (url) { router.push(url); onClose(); }
      } else if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, query, results, selected, router, onClose]);

  function navigate(url: string) {
    router.push(url);
    onClose();
  }

  if (!open) return null;

  const showQuick = query.trim().length < 2;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(3px)",
        zIndex: 9999,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 580,
          background: "var(--surface)",
          borderRadius: 14,
          boxShadow: "var(--naik-3)",
          overflow: "hidden",
          animation: "commandIn 0.15s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Search input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 16px",
          borderBottom: `1px solid var(--border)`,
        }}>
          {loading
            ? <Loader2 size={17} style={{ color: "var(--text-muted)", flexShrink: 0, animation: "spin 0.8s linear infinite" }} />
            : <Search size={17} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cari proyek, klien, invoice, kasbon..."
            style={{
              flex: 1, border: "none", outline: "none", fontSize: 15,
              background: "transparent", color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
            }}
          />
          <kbd style={{
            padding: "2px 6px", borderRadius: 6,
            background: "var(--surface-subtle)", border: "1px solid var(--border)",
            fontSize: 11, color: "var(--text-muted)", flexShrink: 0,
          }}>Esc</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {/* Section label */}
          <div style={{ padding: "8px 16px 4px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {showQuick ? "Navigasi Cepat" : `${results.length} hasil`}
          </div>

          {/* No results */}
          {!showQuick && results.length === 0 && !loading && (
            <div style={{ padding: "24px 16px", textAlign: "center" }}>
              <Search size={24} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Tidak ada hasil untuk "{query}"</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Coba kata kunci lain</div>
            </div>
          )}

          {/* Quick actions */}
          {showQuick && QUICK_ACTIONS.map((item, i) => (
            <button
              key={item.url}
              onClick={() => navigate(item.url)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "8px 16px",
                background: selected === i ? "var(--surface-hover)" : "transparent",
                border: "none", cursor: "pointer", textAlign: "left",
                transition: "background 0.1s",
              }}
              onMouseEnter={() => setSelected(i)}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                background: "var(--surface-subtle)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-secondary)",
              }}>
                {item.icon}
              </div>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{item.label}</span>
              <ArrowRight size={13} style={{ color: "var(--text-muted)", opacity: selected === i ? 1 : 0, transition: "opacity 0.1s" }} />
            </button>
          ))}

          {/* Search results grouped by type */}
          {!showQuick && (() => {
            const grouped: Record<string, SearchResult[]> = {};
            for (const r of results) {
              if (!grouped[r.type]) grouped[r.type] = [];
              grouped[r.type].push(r);
            }
            let globalIdx = 0;
            return Object.entries(grouped).map(([type, items]) => {
              const cfg = TYPE_CONFIG[type] ?? { icon: <Search size={13} />, label: type, color: "var(--text-secondary)", bg: "var(--surface-hover)" };
              return (
                <div key={type}>
                  <div style={{ padding: "6px 16px 2px", fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: cfg.color }}>{cfg.label}</span>
                    <span style={{ opacity: 0.5 }}>·</span>
                    <span>{items.length}</span>
                  </div>
                  {items.map(result => {
                    const idx = globalIdx++;
                    return (
                      <button
                        key={result.id}
                        onClick={() => navigate(result.url)}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          width: "100%", padding: "8px 16px",
                          background: selected === idx ? "var(--surface-hover)" : "transparent",
                          border: "none", cursor: "pointer", textAlign: "left",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={() => setSelected(idx)}
                      >
                        {/* Type badge */}
                        <div style={{
                          width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                          background: cfg.bg, color: cfg.color,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {cfg.icon}
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {result.title}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {result.sub}
                          </div>
                        </div>

                        {/* Meta badge */}
                        {result.meta && (
                          <span style={{
                            flexShrink: 0, fontSize: 10, fontWeight: 600,
                            padding: "2px 6px", borderRadius: 99,
                            color: metaColor(result.meta),
                            background: metaColor(result.meta) + "1A",
                          }}>
                            {result.meta}
                          </span>
                        )}

                        <ArrowRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0, opacity: selected === idx ? 1 : 0, transition: "opacity 0.1s" }} />
                      </button>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>

        {/* Footer */}
        <div style={{
          padding: "8px 16px",
          borderTop: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--surface-subtle)",
        }}>
          {[
            { key: "↑↓", label: "navigasi" },
            { key: "Enter", label: "buka" },
            { key: "Esc", label: "tutup" },
          ].map(({ key, label }) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <kbd style={{ padding: "0px 4px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 10, color: "var(--text-secondary)" }}>{key}</kbd>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
            <Command size={11} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>K untuk buka</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes commandIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>,
    document.body
  );
}
