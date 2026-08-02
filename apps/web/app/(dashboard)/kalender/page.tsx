"use client";

import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import {
  ChevronLeft, ChevronRight, Calendar,
  Target, Clock, TrendingUp, RefreshCw, FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  date: string;         // YYYY-MM-DD
  title: string;
  sub: string;          // project name / context
  type: "milestone" | "termin" | "progress" | "project_end" | "project_start";
  status?: string;
  color: string;
  bg: string;
  url?: string;
}

interface Project {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  progress_pct: number;
  milestones?: { id: string; title: string; target_date: string; status: string }[];
  termin_schedules?: { id: string; termin_number: number; amount: number; trigger_type: string; due_date?: string; status: string }[];
  progress_logs?: { id: string; logged_at: string; pct_overall?: number; mode: string }[];
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  milestone:     { color: "#7C3AED", bg: "#F5F3FF", icon: <Target size={10} /> },
  termin:        { color: "#15803D", bg: "#F0FDF4", icon: <FileText size={10} /> },
  progress:      { color: "#0066CC", bg: "#EFF6FF", icon: <TrendingUp size={10} /> },
  project_end:   { color: "#B91C1C", bg: "#FEF2F2", icon: <Clock size={10} /> },
  project_start: { color: "#B45309", bg: "#FFFBEB", icon: <Calendar size={10} /> },
};

const STATUS_FADED: Record<string, boolean> = {
  completed: true, paid: true, selesai: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(d: string) { return d.slice(0, 10); }

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}
function fmtMonthYear(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function KalenderPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await api.get<{ projects: Project[] }>("/api/v1/projects");
        setProjects(data.projects ?? []);
      } catch { /* non-fatal */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  // Build events from all projects
  const events = useMemo<CalEvent[]>(() => {
    const ev: CalEvent[] = [];
    for (const p of projects) {
      if (p.status === "cancelled") continue;

      // Project start & end
      ev.push({ id: `ps-${p.id}`, date: toDateKey(p.start_date), title: `Mulai: ${p.name}`, sub: p.name, type: "project_start", color: TYPE_STYLE.project_start.color, bg: TYPE_STYLE.project_start.bg, url: `/proyek/${p.id}` });
      ev.push({ id: `pe-${p.id}`, date: toDateKey(p.end_date),   title: `Selesai: ${p.name}`, sub: p.name, type: "project_end",   color: TYPE_STYLE.project_end.color,   bg: TYPE_STYLE.project_end.bg,   url: `/proyek/${p.id}` });

      // Milestones
      for (const m of p.milestones ?? []) {
        ev.push({
          id: `ms-${m.id}`, date: toDateKey(m.target_date),
          title: m.title, sub: p.name, type: "milestone", status: m.status,
          color: TYPE_STYLE.milestone.color, bg: TYPE_STYLE.milestone.bg,
          url: `/proyek/${p.id}#sec-milestone`,
        });
      }

      // Termin due dates (hanya yang ada due_date atau on_sign)
      for (const t of p.termin_schedules ?? []) {
        const date = t.due_date ? toDateKey(t.due_date) : null;
        if (!date) continue;
        ev.push({
          id: `tr-${t.id}`, date,
          title: `Termin ${t.termin_number} — ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(t.amount))}`,
          sub: p.name, type: "termin", status: t.status,
          color: TYPE_STYLE.termin.color, bg: TYPE_STYLE.termin.bg,
          url: `/proyek/${p.id}#sec-termin`,
        });
      }

      // Progress logs (only daily + has pct_overall)
      for (const log of (p.progress_logs ?? []).filter(l => l.mode === "daily" && l.pct_overall != null)) {
        ev.push({
          id: `pl-${log.id}`, date: toDateKey(log.logged_at),
          title: `Progress ${Number(log.pct_overall).toFixed(0)}%`,
          sub: p.name, type: "progress",
          color: TYPE_STYLE.progress.color, bg: TYPE_STYLE.progress.bg,
          url: `/proyek/${p.id}#sec-progress`,
        });
      }
    }
    return ev;
  }, [projects]);

  // Group events by date key
  const eventsByDay = useMemo<Record<string, CalEvent[]>>(() => {
    const map: Record<string, CalEvent[]> = {};
    for (const ev of events) {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    }
    return map;
  }, [events]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month); // 0 = Sunday
  const today = todayKey();
  const DAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] ?? []) : [];

  const card: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  };

  // Month summary counts
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthEvents = events.filter(ev => ev.date.startsWith(monthKey));
  const milestoneCnt = monthEvents.filter(e => e.type === "milestone").length;
  const terminCnt    = monthEvents.filter(e => e.type === "termin").length;
  const progressCnt  = monthEvents.filter(e => e.type === "progress").length;

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #003366, #0066CC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calendar size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Kalender Proyek</h1>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Milestone, termin, dan aktivitas proyek</p>
          </div>
        </div>

        {/* Month summary chips.
            Saat memuat, chip diganti penanda — grid tanggal SELALU terlukis,
            jadi tanpa ini kalender tampak "tak punya acara bulan ini" alih-alih
            "belum selesai memuat". Itu lebih menyesatkan daripada halaman
            kosong: orang menyimpulkan datanya hilang, bukan menunggu. */}
        <div style={{ display: "flex", gap: 8 }}>
        {loading ? (
          <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "var(--surface-hover)", border: "1px solid var(--border)" }}>
            <RefreshCw size={12} className="berputar" color="var(--text-secondary)" />
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Memuat agenda…</span>
          </div>
        ) : (<>
          {[
            { count: milestoneCnt, label: "Milestone", ...TYPE_STYLE.milestone },
            { count: terminCnt,    label: "Termin",    ...TYPE_STYLE.termin },
            { count: progressCnt,  label: "Log",       ...TYPE_STYLE.progress },
          ].map(c => (
            <div key={c.label} style={{ padding: "5px 12px", borderRadius: 20, background: c.bg, border: `1px solid ${c.color}22`, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: c.color }}>{c.icon}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.count}</span>
              {/* Tanpa `opacity`: warnanya sendiri sudah lulus kontras (mis. ungu
                  milestone 5,70:1), tapi opacity 0,8 menurunkannya ke 3,7:1 —
                  di bawah ambang 4,5:1. Opacity memudarkan terhadap LATAR, jadi
                  ia mengurangi kontras walau warnanya sudah dipilih benar.
                  Ini legenda: satu-satunya gunanya justru untuk dibaca. */}
              <span style={{ fontSize: 11, color: c.color }}>{c.label}</span>
            </div>
          ))}
          </>
        )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
        {/* Calendar grid */}
        <div style={card}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
            <button aria-label="Sebelumnya" onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ChevronLeft size={15} />
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>{fmtMonthYear(year, month)}</span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(today); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 11, cursor: "pointer", color: "var(--text-secondary)" }}>
                Hari ini
              </button>
              <button aria-label="Berikutnya" onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Day labels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}>
            {DAY_LABELS.map(d => (
              <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} style={{ minHeight: 88, padding: 6, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface-subtle)" }} />
            ))}

            {/* Day cells */}
            {Array.from({ length: days }, (_, i) => {
              const dayNum = i + 1;
              const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const dayEvents = eventsByDay[dateKey] ?? [];
              const isToday = dateKey === today;
              const isSelected = dateKey === selectedDay;
              const colIdx = (firstDay + i) % 7;
              const isWeekend = colIdx === 0 || colIdx === 6;

              return (
                <div
                  key={dayNum}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDay(isSelected ? null : dateKey)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()   // Spasi jangan menggulir kalender
                      setSelectedDay(isSelected ? null : dateKey)
                    }
                  }}
                  style={{
                    minHeight: 88, padding: 6,
                    borderRight: "1px solid var(--border)",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: isSelected ? "var(--navy-light)" : isToday ? "#FFFBEB" : isWeekend ? "var(--surface-subtle)" : "var(--surface)",
                    transition: "background 0.1s",
                    position: "relative",
                  }}
                  onMouseEnter={e => { if (!isSelected && !isToday) e.currentTarget.style.background = "var(--surface-hover)"; }}
                  onMouseLeave={e => { if (!isSelected && !isToday) e.currentTarget.style.background = isWeekend ? "var(--surface-subtle)" : "var(--surface)"; }}
                >
                  {/* Day number */}
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%", marginBottom: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isToday ? "#003366" : isSelected ? "#003366" : "transparent",
                    color: isToday || isSelected ? "#fff" : isWeekend ? "var(--text-muted)" : "var(--text-primary)",
                    fontSize: 12, fontWeight: isToday || isSelected ? 700 : 400,
                  }}>
                    {dayNum}
                  </div>

                  {/* Event dots / pills */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {dayEvents.slice(0, 3).map(ev => {
                      const faded = ev.status && STATUS_FADED[ev.status];
                      return (
                        <div key={ev.id} style={{
                          display: "flex", alignItems: "center", gap: 3,
                          padding: "1px 5px", borderRadius: 4,
                          background: ev.bg, opacity: faded ? 0.45 : 1,
                          overflow: "hidden",
                        }}>
                          <span style={{ color: ev.color, flexShrink: 0 }}>{TYPE_STYLE[ev.type]?.icon}</span>
                          <span style={{ fontSize: 10, color: ev.color, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ev.title.slice(0, 18)}{ev.title.length > 18 ? "…" : ""}
                          </span>
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 }}>
                        +{dayEvents.length - 3} lainnya
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel — selected day detail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Legend */}
          <div style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Keterangan</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(TYPE_STYLE).map(([type, cfg]) => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color, border: `1px solid ${cfg.color}22` }}>
                    {cfg.icon}
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {{ milestone: "Milestone", termin: "Deadline Termin", progress: "Log Progress", project_end: "Selesai Proyek", project_start: "Mulai Proyek" }[type]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected day events */}
          <div style={{ ...card, flex: 1 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                {selectedDay
                  ? new Date(selectedDay + "T12:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
                  : "Pilih tanggal"}
              </div>
              {selectedDay && (
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {selectedEvents.length} event
                </div>
              )}
            </div>
            <div style={{ padding: 8, maxHeight: 380, overflowY: "auto" }}>
              {!selectedDay && (
                <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                  Klik tanggal di kalender untuk melihat detail event
                </div>
              )}
              {selectedDay && selectedEvents.length === 0 && (
                <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                  Tidak ada event pada tanggal ini
                </div>
              )}
              {selectedEvents.map(ev => {
                const cfg = TYPE_STYLE[ev.type];
                const faded = ev.status && STATUS_FADED[ev.status];
                return (
                  <a key={ev.id} href={ev.url ?? "#"} style={{ textDecoration: "none" }}>
                    <div style={{
                      display: "flex", gap: 10, padding: "9px 8px",
                      borderRadius: 8, marginBottom: 4,
                      background: faded ? "var(--surface-subtle)" : cfg.bg,
                      border: `1px solid ${cfg.color}22`,
                      opacity: faded ? 0.6 : 1,
                      transition: "opacity 0.1s",
                    }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color, flexShrink: 0 }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.sub}</div>
                      </div>
                      {ev.status && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }}>
                          {ev.status}
                        </span>
                      )}
                    </div>
                  </a>
                );
              })}
            </div>
          </div>

          {/* Upcoming events */}
          <div style={card}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>Akan Datang</div>
            </div>
            <div style={{ padding: 8 }}>
              {(() => {
                const upcoming = events
                  .filter(ev => ev.date >= today && !STATUS_FADED[ev.status ?? ""])
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .slice(0, 5);
                if (upcoming.length === 0) return <div style={{ padding: "12px 8px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Tidak ada event mendatang</div>;
                return upcoming.map(ev => {
                  const cfg = TYPE_STYLE[ev.type];
                  const daysLeft = Math.round((new Date(ev.date + "T12:00:00").getTime() - Date.now()) / 86400000);
                  return (
                    <div key={ev.id} style={{ display: "flex", gap: 8, padding: "7px 8px", borderRadius: 6, marginBottom: 2 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 5, background: cfg.bg, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color, flexShrink: 0 }}>
                        {cfg.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{ev.sub}</div>
                      </div>
                      <span style={{ fontSize: 10, color: daysLeft <= 3 ? "#B91C1C" : daysLeft <= 7 ? "#B45309" : "var(--text-muted)", fontWeight: daysLeft <= 7 ? 700 : 400, flexShrink: 0 }}>
                        {daysLeft === 0 ? "Hari ini" : daysLeft === 1 ? "Besok" : `${daysLeft}h`}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
