"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp, Plus } from "lucide-react";
import { getProgressLogs } from "@/lib/api";
import type { ProgressLog } from "@/lib/api";
import { ProgressLogList } from "@/components/progress-log-list";
import { ProgressLogModal } from "@/components/progress-log-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProgressSectionProps {
  projectId: string;
  workScopes?: { id: string; scope_name: string }[];
  userRole?: string;
  userId?: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy: "var(--navy)",
  text: "var(--text-primary)",
  mid: "var(--text-secondary)",
  muted: "var(--text-muted)",
  border: "var(--border)",
};

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ProgressSection({
  projectId,
  workScopes = [],
  userRole,
  userId,
}: ProgressSectionProps) {
  const [logs, setLogs] = useState<ProgressLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    fetchLogs(1, true);
    return () => { mounted.current = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function fetchLogs(pageNum: number, replace: boolean) {
    if (replace) setLoading(true);
    try {
      const result = await getProgressLogs(projectId, pageNum, 20);
      if (!mounted.current) return;
      setTotal(result.meta.total);
      setHasMore(pageNum < result.meta.totalPages);
      setPage(pageNum);
      setLogs(prev => replace ? result.data : [...prev, ...result.data]);
    } catch {
      // silently fail — component still renders empty state
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  function handleLoadMore() {
    fetchLogs(page + 1, false);
  }

  function handleSuccess(newLog: unknown) {
    setLogs(prev => [newLog as ProgressLog, ...prev]);
    setTotal(t => t + 1);
  }

  function handleDeleted(logId: string) {
    setLogs(prev => prev.filter(l => l.id !== logId));
    setTotal(t => Math.max(0, t - 1));
  }

  const canLog = userRole !== "client";

  return (
    <>
      <div style={{ ...card, padding: 24 }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, marginBottom: 20,
        }}>
          <h2 style={{
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600,
            color: C.text, margin: 0,
          }}>
            <span style={{ width: 3, height: 16, background: C.navy, borderRadius: 2, flexShrink: 0 }} />
            <TrendingUp size={16} style={{ color: C.navy }} />
            Progress Lapangan
            {total > 0 && !loading && (
              <span style={{
                fontSize: 11, fontWeight: 600, color: C.navy,
                background: "var(--navy-light)", padding: "2px 8px", borderRadius: 99,
              }}>
                {total} log
              </span>
            )}
          </h2>

          {canLog && (
            <button
              onClick={() => setModalOpen(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10, border: "none",
                background: C.navy, color: "var(--surface)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
                transition: "background 0.15s", flexShrink: 0,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--aksen-pekat)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.navy; }}
            >
              <Plus size={14} />
              Log Progress
            </button>
          )}
        </div>

        {/* List */}
        <ProgressLogList
          logs={logs}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onDeleted={handleDeleted}
          projectId={projectId}
          userRole={userRole}
          userId={userId}
        />
      </div>

      {/* Modal */}
      <ProgressLogModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        projectId={projectId}
        workScopes={workScopes}
        onSuccess={handleSuccess}
      />
    </>
  );
}
