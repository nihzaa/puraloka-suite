"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { KepalaHalaman } from "@/components/dasar";
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
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; data: unknown; ts: string }>>({});
  // `useIzin`, bukan `hasPermission`: yang kedua membaca localStorage,
  // jadi di server SELALU false. Gerbang ini akan merender "tidak punya
  // akses" di HTML server lalu halaman penuh di klien — dua pohon yang
  // berbeda total, dan React membuang hasil SSR karenanya.
  // Hook HARUS sebelum early-return. Detail: `lib/use-izin.ts`.
  const bolehPelihara = useIzin("notifications:milestone:check");

  // ADR-004: capability, bukan jabatan. Kedua tombol di halaman ini memanggil
  // rute yang dijaga `requirePermission('notifications:milestone:check')`
  // (notifications.ts:295,399) — gerbang UI menanyakan hal yang sama.
  if (!bolehPelihara) {
    return (
      <div style={{ padding: "40px 36px", textAlign: "center" }}>
        <AlertCircle size={32} style={{ color: "var(--text-muted)", marginBottom: 12 }} />
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Anda tidak punya akses ke pemeliharaan sistem.</div>
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
    borderRadius: 10, padding: "16px 20px",
    boxShadow: "var(--naik-1)",
  };

  return (
    <div style={{ padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", width: "100%", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: "linear-gradient(135deg, var(--navy), var(--aksen-terang))", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Settings2 size={20} color="#fff" />
        </div>
        <KepalaHalaman judul="Sistem" keterangan="Reminder, notifikasi, dan konfigurasi otomasi" />
      </div>

      {/* Reminder checks */}
      <div style={{ marginBottom: 24 }}>
        {section("Jalankan Pengecekan Manual")}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Deadline check */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--navy-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Bell size={16} style={{ color: "var(--navy)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Cek Semua Deadline</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Termin siap tagih · proyek mendekati selesai · kasbon pending lama · invoice overdue
                </div>
                {results["deadlines"] && <ResultBadge result={results["deadlines"]} renderDetail={(data) => {
                  const d = data as DeadlineResult;
                  if (!d?.success) return null;
                  return (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                      {[
                        { icon: <Receipt size={10} />, label: "Termin", val: d.checked.termins },
                        { icon: <FolderKanban size={10} />, label: "Proyek", val: d.checked.ending_projects },
                        { icon: <Wallet size={10} />, label: "Kasbon", val: d.checked.stale_kasbons },
                        { icon: <Receipt size={10} />, label: "Invoice", val: d.checked.overdue_invoices },
                      ].map(c => (
                        <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 11, color: "var(--text-secondary)" }}>
                          {c.icon} <span>{c.val} {c.label}</span>
                        </div>
                      ))}
                      <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--success)", fontWeight: 600 }}>
                        +{d.notifications_created} notif dibuat
                      </div>
                    </div>
                  );
                }} />}
              </div>
              <RunButton isRunning={running === "deadlines"} color="var(--navy)" bg="var(--navy-light)" onClick={() => runCheck("deadlines", "/api/v1/notifications/check-deadlines")} />
            </div>
          </div>

          {/* Milestone check */}
          <div style={card}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--navy-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Target size={16} style={{ color: "var(--aksen)" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Cek Milestone Approaching / Overdue</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  Kirim notif untuk milestone jatuh tempo dalam 3 hari atau sudah terlewat
                </div>
                {results["milestones"] && <ResultBadge result={results["milestones"]} renderDetail={(data) => {
                  const d = data as MilestoneResult;
                  if (!d?.success) return null;
                  return (
                    <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{d.approaching} approaching · {d.overdue} overdue</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--success)", fontWeight: 600 }}>+{d.notifications_created} notif dibuat</span>
                    </div>
                  );
                }} />}
              </div>
              <RunButton isRunning={running === "milestones"} color="var(--aksen)" bg="var(--navy-light)" onClick={() => runCheck("milestones", "/api/v1/notifications/check-milestones")} />
            </div>
          </div>
        </div>
      </div>

      {/* Email config */}
      <div style={{ marginBottom: 24 }}>
        {section("Konfigurasi Email (Resend)")}
        <div style={card}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--warning-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mail size={16} style={{ color: "var(--warning)" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Email Notifikasi via Resend</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                Email dikirim otomatis saat menjalankan cek deadline. Tambahkan ke <code style={{ background: "var(--surface-subtle)", padding: "0px 4px", borderRadius: 6 }}>apps/api/.env</code>:
              </p>
              <div style={{ background: "var(--surface-subtle)", borderRadius: 6, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8 }}>
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
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--success-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Clock size={16} style={{ color: "var(--success)" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Jadwalkan Setiap Hari Otomatis</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                Jalankan endpoint berikut setiap pagi (misal 07:00) via cron atau GitHub Actions:
              </p>
              <div style={{ background: "var(--surface-subtle)", borderRadius: 6, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.9 }}>
                {/*
                  `&quot;`, BUKAN kutip tipografis “ ”.

                  Blok ini disalin orang ke terminal. Kutip tipografis
                  membuat `curl` menerima nama header yang salah, dan
                  galatnya tak menyebut penyebabnya sama sekali — pemakainya
                  akan mengira tokennya yang bermasalah.

                  Delapan tempat lain di aplikasi ini memang diubah ke kutip
                  tipografis untuk memenuhi `react/no-unescaped-entities`;
                  yang ini tidak, karena teksnya bukan untuk dibaca melainkan
                  untuk dijalankan.
                */}
                # Crontab — setiap hari jam 07:00<br />
                0 7 * * * curl -s \<br />
                &nbsp;&nbsp;-H &quot;Authorization: Bearer $ADMIN_TOKEN&quot; \<br />
                &nbsp;&nbsp;$API_URL/api/v1/notifications/check-deadlines<br />
                <br />
                0 7 * * * curl -s \<br />
                &nbsp;&nbsp;-H &quot;Authorization: Bearer $ADMIN_TOKEN&quot; \<br />
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
        display: "flex", alignItems: "center", gap: 4,
        padding: "6px 12px", borderRadius: 6,
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
      marginTop: 8, padding: "8px 8px", borderRadius: 6,
      background: result.ok ? "var(--success-bg)" : "var(--danger-bg)",
      border: `1px solid ${result.ok ? "var(--success-border)" : "var(--danger-border)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {result.ok
          ? <CheckCircle size={12} style={{ color: "var(--success)" }} />
          : <AlertCircle size={12} style={{ color: "var(--danger)" }} />}
        <span style={{ fontSize: 11, fontWeight: 600, color: result.ok ? "var(--success)" : "var(--danger)" }}>
          {result.ok ? "Berhasil" : "Gagal"}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>{result.ts}</span>
      </div>
      {result.ok && renderDetail(result.data)}
    </div>
  );
}
