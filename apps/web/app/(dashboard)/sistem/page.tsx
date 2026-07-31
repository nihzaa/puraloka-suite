"use client";

import { useState } from "react";
import { api, getStoredUser } from "@/lib/api";
import {
  Settings2, Bell, Mail, RefreshCw, CheckCircle, AlertCircle,
  Clock, Wallet, Receipt, FolderKanban, Target,
} from "lucide-react";

interface DeadlineResult {
  success: boolean;
  notifications_created: number;
  checked: {
    termins: number;
    ending_projects: number;
    stale_kasbons: number;
    overdue_invoices: number;
  };
}

interface MilestoneResult {
  success: boolean;
  approaching: number;
  overdue: number;
  notifications_created: number;
}

export default function SistemPage() {
  const user = getStoredUser();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; data: unknown; ts: string }>>({});

  if (user?.role !== "admin") {
    return (
      <div style={{ padding: "40px 36px", textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
        <div style={{ fontSize: 14, color: "var(--text-muted)" }}>Hanya admin yang dapat mengakses halaman ini.</div>
      </div>
    );
  }

  async function runCheck(key: string, endpoint: string) {
    setRunning(key);
    try {
      const { data } = await api.get(endpoint);
      setResults(r => ({ ...r, [key]: { ok: true, data, ts: new Date().toLocaleTimeString("id-ID") } }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal";
      setResults(r => ({ ...r, [key]: { ok: false, data: { error: msg }, ts: new Date().toLocaleTimeString("id-ID") } }));
    } finally {
      setRunning(null);
    }
  }

  const section = (title: string) => (
    <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>{title}</h2>
  );

  const card: React.CSSProperties = {
    background: "var(--surface)", border: "1px solid var(--border)",
    borderRadius: 12, padding: "18px 20px",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  };

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-form)", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #003366, #0066CC)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Settings2 size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Sistem</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Reminder, notifikasi, dan konfigurasi otomasi</p>
        </div>
      </div>

      {/* Reminder checks */}
      <div style={{ marginBottom: 24 }}>
        {section("Jalankan Pengecekan Manual")}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Deadline check */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EBF2FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bell size={16} style={{ color: "#003366" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Cek Semua Deadline</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Termin siap tagih · proyek mendekati selesai · kasbon pending lama · invoice overdue
                </div>
                {results["deadlines"] && <ResultBadge result={results["deadlines"]} renderDetail={(data) => {
                  const d = data as DeadlineResult;
                  if (!d?.success) return null;
                  return (
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
                      {[
                        { icon: <Receipt size={10} />, label: "Termin", val: d.checked.termins },
                        { icon: <FolderKanban size={10} />, label: "Proyek", val: d.checked.ending_projects },
                        { icon: <Wallet size={10} />, label: "Kasbon", val: d.checked.stale_kasbons },
                        { icon: <Receipt size={10} />, label: "Invoice", val: d.checked.overdue_invoices },
                      ].map(c => (
                        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-secondary)" }}>
                          {c.icon} <span>{c.val} {c.label}</span>
                        </div>
                      ))}
                      <div style={{ marginLeft: "auto", fontSize: 11, color: "#15803D", fontWeight: 600 }}>
                        +{d.notifications_created} notif dibuat
                      </div>
                    </div>
                  );
                }} />}
              </div>
              <RunButton isRunning={running === "deadlines"} color="#003366" bg="#EBF2FF" onClick={() => runCheck("deadlines", "/api/v1/notifications/check-deadlines")} />
            </div>
          </div>

          {/* Milestone check */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Target size={16} style={{ color: "#7C3AED" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Cek Milestone Approaching / Overdue</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Kirim notif untuk milestone jatuh tempo dalam 3 hari atau sudah terlewat
                </div>
                {results["milestones"] && <ResultBadge result={results["milestones"]} renderDetail={(data) => {
                  const d = data as MilestoneResult;
                  if (!d?.success) return null;
                  return (
                    <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{d.approaching} approaching · {d.overdue} overdue</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "#15803D", fontWeight: 600 }}>+{d.notifications_created} notif dibuat</span>
                    </div>
                  );
                }} />}
              </div>
              <RunButton isRunning={running === "milestones"} color="#7C3AED" bg="#F5F3FF" onClick={() => runCheck("milestones", "/api/v1/notifications/check-milestones")} />
            </div>
          </div>
        </div>
      </div>

      {/* Email config */}
      <div style={{ marginBottom: 24 }}>
        {section("Konfigurasi Email (Resend)")}
        <div style={card}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mail size={16} style={{ color: "#C2410C" }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Email Notifikasi via Resend</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                Email dikirim otomatis saat menjalankan cek deadline. Tambahkan ke <code style={{ background: "var(--surface-subtle)", padding: "1px 5px", borderRadius: 4 }}>apps/api/.env</code>:
              </p>
              <div style={{ background: "var(--surface-subtle)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
                RESEND_API_KEY=re_xxxxxxxxxxxx<br />
                EMAIL_FROM=Puraloka Suite &lt;noreply@puraloka.id&gt;<br />
                APP_URL=https://app.puraloka.id
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                Jika <code>RESEND_API_KEY</code> tidak diset, email dinonaktifkan (no-op). Notifikasi in-app tetap berjalan.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cron guide */}
      <div>
        {section("Otomasi via Cron Job")}
        <div style={card}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Clock size={16} style={{ color: "#15803D" }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Jadwalkan Setiap Hari Otomatis</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                Jalankan endpoint berikut setiap pagi (misal 07:00) via cron atau GitHub Actions:
              </p>
              <div style={{ background: "var(--surface-subtle)", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>
                # Crontab — setiap hari jam 07:00<br />
                0 7 * * * curl -s \<br />
                &nbsp;&nbsp;-H "Authorization: Bearer $ADMIN_TOKEN" \<br />
                &nbsp;&nbsp;$API_URL/api/v1/notifications/check-deadlines<br />
                <br />
                0 7 * * * curl -s \<br />
                &nbsp;&nbsp;-H "Authorization: Bearer $ADMIN_TOKEN" \<br />
                &nbsp;&nbsp;$API_URL/api/v1/notifications/check-milestones
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                Idempotent — aman dijalankan berkali-kali, tidak akan duplikat notif dalam satu hari.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function RunButton({ isRunning, color, bg, onClick }: { isRunning: boolean; color: string; bg: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={isRunning}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "7px 13px", borderRadius: 8,
        border: `1px solid ${color}33`, background: bg, color,
        cursor: isRunning ? "not-allowed" : "pointer",
        fontSize: 12, fontWeight: 600, flexShrink: 0, opacity: isRunning ? 0.7 : 1,
      }}
    >
      <RefreshCw size={12} style={{ animation: isRunning ? "spin 0.8s linear infinite" : "none" }} />
      {isRunning ? "Memproses..." : "Jalankan"}
    </button>
  );
}

function ResultBadge({ result, renderDetail }: {
  result: { ok: boolean; data: unknown; ts: string };
  renderDetail: (data: unknown) => React.ReactNode;
}) {
  return (
    <div style={{
      marginTop: 8, padding: "8px 10px", borderRadius: 8,
      background: result.ok ? "#F0FDF4" : "#FEF2F2",
      border: `1px solid ${result.ok ? "#BBF7D0" : "#FECACA"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {result.ok
          ? <CheckCircle size={12} style={{ color: "#15803D" }} />
          : <AlertCircle size={12} style={{ color: "#B91C1C" }} />}
        <span style={{ fontSize: 11, fontWeight: 600, color: result.ok ? "#15803D" : "#B91C1C" }}>
          {result.ok ? "Berhasil" : "Gagal"}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>{result.ts}</span>
      </div>
      {result.ok && renderDetail(result.data)}
    </div>
  );
}
