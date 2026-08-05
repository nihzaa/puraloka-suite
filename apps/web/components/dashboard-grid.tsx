"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ResponsiveGridLayout: RGLResponsive, useContainerWidth } = require("react-grid-layout");
// Cast to avoid @types/react-grid-layout v1 vs react-grid-layout v2 prop mismatch
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResponsiveGridLayout = RGLResponsive as React.ComponentType<any>;
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { GripVertical, EyeOff, Eye, LayoutGrid } from "lucide-react";

// Inline layout types — avoids @types/react-grid-layout namespace conflicts
interface Layout  { i: string; x: number; y: number; w: number; h: number; isResizable?: boolean; isDraggable?: boolean }
type Layouts = Record<string, Layout[]>;

// ─── Widget registry ──────────────────────────────────────────────────────────

export const WIDGET_DEFS: Record<string, { label: string; defaultH: number }> = {
  kpi:       { label: "KPI Cards",             defaultH: 2 },
  cashflow:  { label: "Grafik Arus Kas",        defaultH: 5 },
  status:    { label: "Status & Progress",      defaultH: 5 },
  invoice:   { label: "Invoice Belum Lunas",    defaultH: 5 },
  milestone: { label: "Milestone Mendatang",    defaultH: 5 },
  kasbon:    { label: "Kasbon Pending",         defaultH: 4 },
  tax:       { label: "Ringkasan Pajak",        defaultH: 3 },
};

export type WidgetKey = keyof typeof WIDGET_DEFS;

// ─── Default layouts ──────────────────────────────────────────────────────────

const DEFAULT_LAYOUTS: Layouts = {
  lg: [
    { i: "kpi",       x: 0, y: 0,  w: 12, h: 2, isResizable: false },
    // `h: 6`, bukan 5. Dengan 5, isi widget arus kas (grafik 200px +
    // legenda + tiga metrik ringkasan) melebihi wadahnya 46px dan baris
    // "Pemasukan · Pengeluaran est. · Selisih" TERGUNTING — diukur di
    // peramban, bukan ditaksir. Widget status disamakan supaya kedua
    // kolom tetap sejajar; koordinat y di bawahnya ikut digeser.
    { i: "cashflow",  x: 0, y: 2,  w: 7,  h: 6 },
    { i: "status",    x: 7, y: 2,  w: 5,  h: 6 },
    { i: "invoice",   x: 0, y: 8,  w: 7,  h: 5 },
    { i: "milestone", x: 7, y: 8,  w: 5,  h: 5 },
    { i: "kasbon",    x: 0, y: 13, w: 12, h: 4 },
    { i: "tax",       x: 0, y: 17, w: 12, h: 3 },
  ],
  md: [
    { i: "kpi",       x: 0, y: 0,  w: 10, h: 2, isResizable: false },
    { i: "cashflow",  x: 0, y: 2,  w: 6,  h: 6 },
    { i: "status",    x: 6, y: 2,  w: 4,  h: 6 },
    { i: "invoice",   x: 0, y: 8,  w: 6,  h: 5 },
    { i: "milestone", x: 6, y: 8,  w: 4,  h: 5 },
    { i: "kasbon",    x: 0, y: 13, w: 10, h: 4 },
    { i: "tax",       x: 0, y: 17, w: 10, h: 3 },
  ],
  sm: [
    { i: "kpi",       x: 0, y: 0,  w: 6, h: 4, isResizable: false },
    { i: "cashflow",  x: 0, y: 4,  w: 6, h: 6 },
    { i: "status",    x: 0, y: 10, w: 6, h: 5 },
    { i: "invoice",   x: 0, y: 15, w: 6, h: 5 },
    { i: "milestone", x: 0, y: 20, w: 6, h: 5 },
    { i: "kasbon",    x: 0, y: 25, w: 6, h: 4 },
    { i: "tax",       x: 0, y: 29, w: 6, h: 3 },
  ],
};

const BREAKPOINTS = { lg: 1100, md: 768, sm: 480 };
const COLS = { lg: 12, md: 10, sm: 6 };
/**
 * Kunci BERVERSI, dan versinya dinaikkan saat tata letak bawaan berubah.
 *
 * Tata letak tersimpan di localStorage per-pemakai. Tanpa menaikkan
 * versi, orang yang pernah membuka dashboard akan terus memakai tata
 * letak lamanya — jadi perbaikan tinggi widget arus kas (v2 → v3, di
 * mana `h: 5` menggunting tiga metrik ringkasan) tak akan pernah sampai
 * ke mereka. Yang paling parah justru pemakai LAMA: mereka yang paling
 * sering melihat dashboard.
 *
 * Ongkosnya: penyesuaian tata letak yang dibuat sendiri ikut hilang.
 * Itu sepadan — cacat yang diperbaiki adalah isi yang tergunting, dan
 * mempertahankan tata letak yang menggunting isi bukan pilihan.
 */
const STORAGE_KEY = "puraloka_dashboard_layout_v3";
const HIDDEN_KEY  = "puraloka_dashboard_hidden_v3";

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadLayouts(): Layouts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUTS;
    const parsed = JSON.parse(raw) as Layouts;
    const requiredKeys = Object.keys(WIDGET_DEFS);
    const lgKeys = (parsed.lg ?? []).map((l: Layout) => l.i);
    if (!requiredKeys.every(k => lgKeys.includes(k))) return DEFAULT_LAYOUTS;
    return parsed;
  } catch { return DEFAULT_LAYOUTS; }
}

function saveLayouts(layouts: Layouts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts)); } catch { /* best-effort: tata letak dashboard, bukan data. Gagal simpan = tak diingat lintas sesi, dan itu konsekuensi yang benar. */ }
}

function loadHidden(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveHidden(hidden: Set<string>) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch { /* best-effort: tata letak dashboard, bukan data. Gagal simpan = tak diingat lintas sesi, dan itu konsekuensi yang benar. */ }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DashboardGridProps {
  widgets: Partial<Record<WidgetKey, React.ReactNode>>;
}

// ─── Drag handle ──────────────────────────────────────────────────────────────

function WidgetShell({
  title,
  children,
  hidden,
  onToggleHide,
}: {
  title: string;
  children: React.ReactNode;
  hidden: boolean;
  onToggleHide: () => void;
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "var(--naik-1)",
        overflow: "hidden",
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
      }}
    >
      {/* Drag handle bar */}
      <div
        className="drag-handle"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-subtle)",
          cursor: "grab",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <GripVertical size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
          {title}
        </span>
        <button aria-label="Sembunyikan widget"
          onClick={e => { e.stopPropagation(); onToggleHide(); }}
          title="Sembunyikan widget"
          style={{
            display: "flex", alignItems: "center",
            padding: "2px 4px", borderRadius: 6,
            border: "none", background: "none",
            cursor: "pointer", color: "var(--text-muted)",
          }}
        >
          <EyeOff size={12} />
        </button>
      </div>

      {/* Widget content.
          `tabIndex={0}` bukan hiasan: area yang bisa di-scroll TAPI tak bisa
          difokus keyboard membuat isinya tak terjangkau sama sekali bagi orang
          yang tak memakai tetikus — konten yang berada di bawah lipatan widget
          praktis tidak ada. Terdeteksi axe (`scrollable-region-focusable`).
          `role="group"` + nama dari judul widget supaya pembaca layar
          menyebutnya sebagai sesuatu, bukan "grup" kosong. */}
      {/* `role="region"`, BUKAN `"group"`: keduanya memberi nama, tapi hanya
          `region` yang diakui `jsx-a11y/no-noninteractive-tabindex` sebagai
          alasan sah untuk `tabIndex`. Dengan `group`, dua aturan saling
          bertabrakan — axe menuntut area scroll bisa difokus, eslint melarang
          tabIndex di elemen non-interaktif. `region` memenuhi keduanya, dan
          secara semantik memang lebih tepat: ini bagian halaman yang berdiri
          sendiri dan punya judul. */}
      {/* DUA ATURAN BERTABRAKAN DI SATU ELEMEN, dan ini pilihan sadar:
          · axe (`scrollable-region-focusable`) MENUNTUT area yang bisa di-scroll
            juga bisa difokus keyboard — kalau tidak, isi yang berada di bawah
            lipatan widget tak terjangkau sama sekali tanpa tetikus.
          · rule ini MELARANG `tabIndex` di elemen non-interaktif, karena
            biasanya itu memang menambah perhentian tab yang tak berguna.
          Di sini larangan itu tidak berlaku: perhentian tab-nya JUSTRU yang
          membuat kontennya terbaca. axe mencerminkan dampak ke pengguna nyata,
          jadi ia yang dimenangkan — dimatikan satu baris, bukan rule-nya. */}
      <div
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={title}
        style={{ flex: 1, overflow: "auto", minHeight: 0 }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardGrid({ widgets }: DashboardGridProps) {
  const [mounted, setMounted] = useState(false);
  const [layouts, setLayouts] = useState<Layouts>(DEFAULT_LAYOUTS);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showCustomizer, setShowCustomizer] = useState(false);
  const customizerRef = useRef<HTMLDivElement>(null);
  const { containerRef, width } = useContainerWidth();

  useEffect(() => {
    setLayouts(loadLayouts());
    setHidden(loadHidden());
    setMounted(true);
  }, []);

  // Close customizer on outside click
  useEffect(() => {
    if (!showCustomizer) return;
    function handler(e: MouseEvent) {
      if (customizerRef.current && !customizerRef.current.contains(e.target as Node)) {
        setShowCustomizer(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showCustomizer]);

  const onLayoutChange = useCallback(
    (_: Layout[], allLayouts: Layouts) => {
      setLayouts(allLayouts);
      saveLayouts(allLayouts);
    },
    []
  );

  function toggleHide(key: string) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveHidden(next);
      return next;
    });
  }

  function resetLayout() {
    setLayouts(DEFAULT_LAYOUTS);
    setHidden(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(HIDDEN_KEY);
    } catch { /* noop */ }
  }

  if (!mounted) return null;

  const visibleWidgets = Object.entries(widgets).filter(
    ([key]) => !hidden.has(key)
  ) as [WidgetKey, React.ReactNode][];

  const filteredLayouts: Layouts = Object.fromEntries(
    Object.entries(layouts).map(([bp, items]) => [
      bp,
      (items as Layout[]).filter(l => !hidden.has(l.i)),
    ])
  );

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Customizer trigger */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <div style={{ position: "relative" }} ref={customizerRef}>
          <button
            onClick={() => setShowCustomizer(p => !p)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "4px 12px", borderRadius: 6,
              border: "1px solid var(--border)", background: "var(--surface)",
              fontSize: 11, color: "var(--text-secondary)", cursor: "pointer",
              fontWeight: 500,
            }}
          >
            <LayoutGrid size={13} /> Sesuaikan
            {hidden.size > 0 && (
              <span style={{
                marginLeft: 2, padding: "0px 4px", borderRadius: 99,
                background: "var(--navy)", color: "#fff", fontSize: 10, fontWeight: 700,
              }}>
                {hidden.size}
              </span>
            )}
          </button>

          {showCustomizer && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", right: 0,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "var(--naik-2)",
              padding: 12, zIndex: 100, minWidth: 220,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Widget
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {Object.entries(WIDGET_DEFS).map(([key, def]) => {
                  const isHidden = hidden.has(key);
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleHide(key)}
                      onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()   // Spasi jangan menggulir dashboard
                          toggleHide(key)
                        }
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 8px", borderRadius: 6, cursor: "pointer",
                        background: isHidden ? "var(--surface-subtle)" : "transparent",
                        border: "1px solid var(--border)",
                        opacity: isHidden ? 0.6 : 1,
                        transition: "all 0.1s",
                      }}
                    >
                      <span style={{ color: isHidden ? "var(--text-muted)" : "var(--navy)" }}>
                        {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                      </span>
                      <span style={{ flex: 1, fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>
                        {def.label}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  onClick={resetLayout}
                  style={{
                    width: "100%", padding: "6px 0", borderRadius: 6,
                    border: "1px solid var(--border)", background: "var(--surface-subtle)",
                    fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
                  }}
                >
                  Reset ke Default
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid */}
      <ResponsiveGridLayout
        className="layout"
        width={width ?? 1200}
        layouts={filteredLayouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={60}
        draggableHandle=".drag-handle"
        onLayoutChange={onLayoutChange}
        margin={[14, 14]}
        containerPadding={[0, 0]}
        useCSSTransforms
        isResizable
        isDraggable
      >
        {visibleWidgets.map(([key, node]) => (
          <div key={key}>
            <WidgetShell
              title={WIDGET_DEFS[key]?.label ?? key}
              hidden={hidden.has(key)}
              onToggleHide={() => toggleHide(key)}
            >
              {node}
            </WidgetShell>
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
