"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { useToast } from "@/components/toast";
import { Paginasi } from "@/components/paginasi";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import {
  ShieldCheck, Search,
  Clock, User, Database, RefreshCw, AlertCircle, FileText,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  table_name: string;
  /**
   * NULLABLE — dan itu bukan kasus langka: diukur 2026-08-11, **554 baris**
   * `audit_logs` punya `record_id` NULL (kolomnya `is_nullable=YES`).
   *
   * Tipenya dulu ditulis `string`. TypeScript karena itu diam saat
   * `record_id.slice(0, 8)` dan `record_id.toLowerCase()` dipanggil, dan
   * halaman ini **crash** dengan "Cannot read properties of null" begitu satu
   * baris NULL masuk ke daftar. Tipe yang berbohong tak menghasilkan galat
   * kompilasi — ia memindahkan galatnya ke peramban pengguna.
   */
  record_id: string | null;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user: { id: string; name: string; email: string; role: string } | null;
  /** Alasan keputusan. `null` = tak diberikan — dan itu informasi, bukan kekosongan. */
  reason: string | null;
  severity: "info" | "warning" | "critical" | null;
  /** Satu request = satu id. Semua event di dalamnya berbagi nilai ini. */
  correlation_id: string | null;
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
  insert:                   { bg: "var(--success-bg)", color: "var(--success)" },
  update:                   { bg: "var(--info-bg)", color: "var(--info)" },
  delete:                   { bg: "var(--danger-bg)", color: "var(--danger)" },
  // `--warning`, BUKAN `--data-5`.
  //
  // `--data-5` (#EA580C) adalah token deret KATEGORI untuk grafik: ambangnya
  // 3:1 sebagai komponen non-teks. Dipakai sebagai warna teks di atas
  // `--warning-bg` ia menghasilkan 3,43:1 — gagal ambang teks WCAG AA 4,5:1.
  // Diukur, bukan ditaksir.
  //
  // `--warning` (#B45309) memberi 4,84:1 pada latar yang sama, dan itu
  // pasangan yang sudah dipakai `soft_delete` tiga baris di bawah — satu
  // baris ini yang menyimpang. Kelas cacat yang sama sudah dicatat di
  // `keuangan/arus-kas` dan `piutang`: palet grafik dipinjam untuk teks,
  // yang syaratnya lebih ketat.
  change_order_approved:    { bg: "var(--warning-bg)", color: "var(--warning)" },
  change_order_rejected:    { bg: "var(--danger-bg)", color: "var(--danger)" },
  soft_delete:              { bg: "var(--warning-bg)", color: "var(--warning)" },
};

function actionStyle(action: string) {
  return ACTION_COLORS[action] ?? { bg: "var(--surface-hover)", color: "var(--text-secondary)" };
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
  if (!oldVal && !newVal) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Tidak ada data</span>;

  const allKeys = [...new Set([...Object.keys(oldVal ?? {}), ...Object.keys(newVal ?? {})])];
  const changed = allKeys.filter(k => JSON.stringify((oldVal ?? {})[k]) !== JSON.stringify((newVal ?? {})[k]));

  if (changed.length === 0) {
    return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Tidak ada perubahan nilai</span>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {changed.slice(0, 8).map(key => (
        <div key={key} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 11 }}>
          <span style={{ fontWeight: 700, color: "var(--text-secondary)", minWidth: 120, flexShrink: 0 }}>{key}</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
            {oldVal && oldVal[key] !== undefined && (
              <span style={{ padding: "0px 6px", borderRadius: 6, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontFamily: "monospace" }}>
                {String(oldVal[key]).slice(0, 80)}
              </span>
            )}
            {newVal && newVal[key] !== undefined && (
              <span style={{ padding: "0px 6px", borderRadius: 6, background: "var(--success-bg)", color: "var(--on-success-bg)", fontFamily: "monospace" }}>
                {String(newVal[key]).slice(0, 80)}
              </span>
            )}
          </div>
        </div>
      ))}
      {changed.length > 8 && (
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>+{changed.length - 8} kolom lainnya</span>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditPage() {
  const { showToast } = useToast();
  // Hook HARUS dipanggil sebelum early-return mana pun.
  const bolehLihat = useIzin("audit:view");

  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [filterTable, setFilterTable] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    URL-nya dinamis mengikuti page + keempat saringan — itulah yang dipakai
    `useData` sebagai kunci cache, jadi kembali ke halaman/saringan yang sama
    tak perlu ambil ulang selama masih segar.

    `fetchMeta` dulu menelan galatnya (komentar "non-fatal" di kode lama) —
    dipertahankan: daftar tabel/aksi untuk dropdown saringan memang tak
    fatal bila gagal.
  */
  const jalurLogs = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (filterTable)  params.set("table_name", filterTable);
    if (filterAction) params.set("action", filterAction);
    if (filterFrom)   params.set("from", filterFrom);
    if (filterTo)     params.set("to", filterTo);
    return `/api/v1/audit?${params}`;
  }, [page, filterTable, filterAction, filterFrom, filterTo]);

  const { data: dataLogs, memuat: loading, galat: galatLogs, muatUlang: muatUlangLogs } =
    useData<{ logs: AuditLog[]; meta: Meta }>(jalurLogs);
  const { data: dataMeta } = useData<AuditMeta>("/api/v1/audit/meta");

  const logs = dataLogs?.logs ?? [];
  const meta = dataLogs?.meta ?? { total: 0, page: 1, limit: 50, pages: 1 };
  const auditMeta = dataMeta ?? { tables: [], actions: [] };

  const fetchLogs = useCallback((p = page) => { setPage(p); void muatUlangLogs(); }, [page, muatUlangLogs]);

  // Halaman kembali ke 1 begitu salah satu saringan berganti — daftar hasil
  // saringan baru tak pernah bermakna dimulai dari halaman lama.
  useEffect(() => { setPage(1); }, [filterTable, filterAction, filterFrom, filterTo]);

  // Galat muat ditampilkan via toast, seperti perilaku sebelumnya — bukan
  // state galat terpisah, supaya perilaku tak berubah dari versi lama.
  useEffect(() => { if (galatLogs) showToast("error", "Gagal memuat audit log"); }, [galatLogs, showToast]);

  // Kedua sisi di-lowercase. Sebelumnya hanya KATA KUNCI yang diturunkan
  // sementara nilainya tidak — kebetulan lolos untuk `table_name`/`action`
  // (memang sudah lowercase di DB) tapi tidak untuk `record_id`: mencari UUID
  // dengan huruf besar tak menemukan apa pun, tanpa petunjuk kenapa.
  const q = search.trim().toLowerCase();
  const filteredLogs = q
    ? logs.filter(l =>
        l.table_name.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.user?.name?.toLowerCase().includes(q) ||
        // `?.` — `record_id` nullable (554 baris NULL). Tanpa ini, mengetik
        // apa pun di kotak cari mematikan seluruh halaman.
        l.record_id?.toLowerCase().includes(q)
      )
    : logs;

  
  // ADR-004: capability, bukan jabatan. API menjaga rute ini dengan
  // `requirePermission('audit:view')` (audit.ts:10,77) — gerbang UI harus
  // menanyakan hal yang SAMA, kalau tidak pemegang wewenang yang sah (mis.
  // `direktur`) ditolak di depan pintu oleh halaman yang API-nya sendiri
  // akan melayani.
  // `useIzin`, bukan `hasPermission` langsung: yang kedua membaca
  // localStorage, jadi di server SELALU false. Gerbang ini akan
  // menampilkan "tidak punya akses" di HTML server lalu halaman penuh di
  // klien — dua pohon yang sama sekali berbeda, sehingga React membuang
  // hasil SSR dan merender ulang semuanya. Detail di `lib/use-izin.ts`.
  if (!bolehLihat) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "var(--danger)", marginBottom: 12 }} />
        <p style={{ color: "var(--text-secondary)" }}>Anda tidak punya akses ke jejak audit.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto" }}>
      {/*
        `<KepalaHalaman>`, bukan header buatan sendiri.

        Yang digambar di sini persis apa yang komponen itu sediakan: ikon,
        judul, keterangan, dan satu tombol aksi. Bedanya cuma `fontWeight:
        800` — satu-satunya di repo ini yang memakai 800, sementara 105
        halaman lain memakai 700 lewat komponennya.

        Selisih satu langkah bobot tak terlihat sendirian dan langsung
        terasa saat berpindah halaman: judulnya "meloncat" lebih tebal.
      */}
      <KepalaHalaman
        ikon={<ShieldCheck size={19} />}
        judul="Audit Trail"
        keterangan={`${meta.total.toLocaleString("id-ID")} entri total`}
        aksi={(
          <button
            onClick={() => fetchLogs(page)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
          >
            <RefreshCw size={13} style={{ color: "var(--text-muted)" }} /> Refresh
          </button>
        )}
      />

      {/* Filters */}
      <div style={{ ...GAYA_KARTU, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text" placeholder="Cari nama, action, ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, height: 36, borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, outline: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Table filter */}
        <select aria-label="Tabel"
          value={filterTable}
          onChange={e => setFilterTable(e.target.value)}
          style={{ height: 36, borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, padding: "0 10px", flex: "0 0 auto", minWidth: 150 }}
        >
          <option value="">Semua Tabel</option>
          {auditMeta.tables.map(t => (
            <option key={t} value={t}>{tableIcon(t)} {t}</option>
          ))}
        </select>

        {/* Action filter */}
        <select aria-label="Aksi"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          style={{ height: 36, borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, padding: "0 10px", flex: "0 0 auto", minWidth: 160 }}
        >
          <option value="">Semua Action</option>
          {auditMeta.actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        {/* Date range */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input aria-label="Tanggal mulai"
            type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            style={{ height: 36, borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, padding: "0 8px" }}
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>—</span>
          <input aria-label="Tanggal akhir"
            type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            style={{ height: 36, borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, padding: "0 8px" }}
          />
        </div>

        {/* Clear filters */}
        {(filterTable || filterAction || filterFrom || filterTo || search) && (
          <button
            onClick={() => { setFilterTable(""); setFilterAction(""); setFilterFrom(""); setFilterTo(""); setSearch(""); }}
            style={{ height: 36, padding: "0 12px", borderRadius: 6, border: "1px solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 12, cursor: "pointer" }}
          >
            Reset Filter
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {[
          { label: "INSERT", count: logs.filter(l => l.action === "insert").length, color: "var(--success)", bg: "var(--success-bg)" },
          { label: "UPDATE", count: logs.filter(l => l.action === "update").length, color: "var(--info)", bg: "var(--info-bg)" },
          { label: "DELETE", count: logs.filter(l => l.action === "delete" || l.action === "soft_delete").length, color: "var(--danger)", bg: "var(--danger-bg)" },
          { label: "LAINNYA", count: logs.filter(l => !["insert","update","delete","soft_delete"].includes(l.action)).length, color: "var(--warning)", bg: "var(--warning-bg)" },
        ].map(chip => chip.count > 0 && (
          <span key={chip.label} style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700, background: chip.bg, color: chip.color }}>
            {chip.label} · {chip.count}
          </span>
        ))}
      </div>

      {/* Log table */}
      <div style={GAYA_KARTU}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Memuat...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Database size={28} style={{ color: "var(--border-strong)", marginBottom: 8 }} />
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Tidak ada log yang cocok</p>
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const isExpanded = expanded === log.id;
            const ast = actionStyle(log.action);

            return (
              <div
                key={log.id}
                style={{ borderBottom: i < filteredLogs.length - 1 ? "1px solid var(--surface-hover)" : "none" }}
              >
                {/* Row summary */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : log.id)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()   // Spasi jangan menggulir halaman
                      setExpanded(isExpanded ? null : log.id)
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 20px", cursor: "pointer",
                    background: isExpanded ? "var(--surface-subtle)" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "var(--surface-subtle)"; }}
                  onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Table icon */}
                  <span style={{ fontSize: 17, flexShrink: 0 }}>{tableIcon(log.table_name)}</span>

                  {/* Main info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        padding: "2px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                        background: ast.bg, color: ast.color, textTransform: "uppercase",
                      }}>{log.action}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>{log.table_name}</span>
                      {/*
                        `record_id` boleh NULL — 554 baris di antaranya. Baris
                        semacam itu bukan cacat data: sebagian peristiwa audit
                        (login, ekspor, perubahan pengaturan global) memang tak
                        menunjuk satu baris tabel pun.

                        Ditampilkan sebagai "—", bukan disembunyikan: kolom
                        yang kosong tanpa penanda terbaca seperti nilainya
                        gagal dimuat.
                      */}
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>
                        {log.record_id ? `${log.record_id.slice(0, 8)}…` : "—"}
                      </span>
                      {/* `critical` ditandai KATA, bukan hanya warna (WCAG 1.4.1).
                          Hanya `critical` yang diberi penanda: menandai ketiga
                          tingkat membuat tak ada yang menonjol, dan `info`
                          adalah mayoritas mutlak. */}
                      {log.severity === "critical" && (
                        <span style={{
                          padding: "1px 7px", borderRadius: 99, fontSize: 10, fontWeight: 700,
                          background: "var(--danger-bg)", color: "var(--danger)",
                          border: "1px solid var(--danger-border)", textTransform: "uppercase",
                        }}>kritis</span>
                      )}
                    </div>

                    {/* ALASAN — inilah yang membuat jejak bisa dibaca ulang.
                        Diukur 2026-08-07: 636 penolakan estimasi tersimpan,
                        dan alasannya tak pernah sampai ke layar karena
                        endpoint tak mengambil kolomnya. */}
                    {log.reason && (
                      <div style={{
                        fontSize: 11, color: "var(--text-secondary)", marginTop: 3,
                        fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>
                        “{log.reason}”
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {log.new_values ? (
                        Object.keys(log.new_values).slice(0, 4).join(", ") +
                        (Object.keys(log.new_values).length > 4 ? ` +${Object.keys(log.new_values).length - 4} lainnya` : "")
                      ) : ""}
                    </div>
                  </div>

                  {/* User */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", background: "var(--navy-light)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <User size={13} style={{ color: "var(--navy)" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                        {log.user?.name ?? "—"}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{log.user?.role ?? ""}</div>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, minWidth: 140 }}>
                    <Clock size={11} style={{ color: "var(--border-strong)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtDate(log.created_at)}</span>
                  </div>

                  {/* Expand indicator */}
                  <span style={{ fontSize: 13, color: "var(--border-strong)", flexShrink: 0, transition: "transform 0.15s", transform: isExpanded ? "rotate(180deg)" : "none" }}>▾</span>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "0 20px 16px 20px", background: "var(--surface-subtle)", borderTop: "1px solid var(--surface-hover)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 14 }}>
                      {/* Metadata */}
                      <div style={{ background: "var(--surface)", borderRadius: 10, padding: "12px 12px", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Detail</div>
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
                              <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 80, flexShrink: 0 }}>{label}</span>
                              <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: label === "ID Log" || label === "Record ID" ? "monospace" : "inherit", wordBreak: "break-all" }}>{val}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Diff */}
                      <div style={{ background: "var(--surface)", borderRadius: 10, padding: "12px 12px", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                          Perubahan
                          {log.old_values && <span style={{ marginLeft: 8, padding: "0px 4px", borderRadius: 6, background: "var(--danger-bg)", color: "var(--on-danger-bg)", fontSize: 10 }}>SEBELUM</span>}
                          {log.new_values && <span style={{ marginLeft: 4, padding: "0px 4px", borderRadius: 6, background: "var(--success-bg)", color: "var(--on-success-bg)", fontSize: 10 }}>SESUDAH</span>}
                        </div>
                        <DiffView oldVal={log.old_values} newVal={log.new_values} />
                      </div>
                    </div>

                    {/* Raw JSON toggle */}
                    <details style={{ marginTop: 10 }}>
                      <summary style={{ fontSize: 11, color: "var(--text-muted)", cursor: "pointer", userSelect: "none" }}>
                        <FileText size={11} style={{ display: "inline", marginRight: 4 }} />
                        Lihat JSON mentah
                      </summary>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>old_values</div>
                          <pre style={{ fontSize: 10, background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: 6, padding: 8, overflow: "auto", maxHeight: 200, margin: 0, color: "var(--text-secondary)" }}>
                            {JSON.stringify(log.old_values, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>new_values</div>
                          <pre style={{ fontSize: 10, background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: 6, padding: 8, overflow: "auto", maxHeight: 200, margin: 0, color: "var(--text-secondary)" }}>
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

      {/* Paginasi: komponen bersama. Versi sebelumnya di sini memakai
          `background: "#fff"` dipaku — tombol halaman aktif tetap PUTIH
          di mode gelap. Diangkat ke `components/paginasi.tsx` supaya
          perbaikannya berlaku untuk semua pemakainya. */}
      <Paginasi
        halaman={page}
        totalHalaman={meta.pages}
        totalEntri={meta.total}
        onPindah={setPage}
      />
    </div>
  );
}
