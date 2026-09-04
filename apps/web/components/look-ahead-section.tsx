"use client";

/**
 * LOOK-AHEAD 3 MINGGU — daftar apa yang harus dikerjakan, bukan laporan.
 *
 * ── Kenapa komponen ini ada
 *
 * Kurva-S dan EVM di halaman ini menjawab "sejauh mana kita menyimpang" —
 * keduanya menoleh ke BELAKANG. Yang tak dijawab satu pun: "minggu depan saya
 * harus menyiapkan apa?" Padahal itu pertanyaan yang benar-benar dipakai PM
 * tiap Senin, dan yang menentukan material & mandor disiapkan tepat waktu.
 *
 * ── Keputusan tampilan
 *
 * URUTAN = urutan PERHATIAN, bukan tanggal. Yang telat paling lama di paling
 * atas, karena itu yang paling mahal kalau dibiarkan. Tanggal bisa diurutkan
 * di Gantt; yang tak bisa ditemukan di Gantt adalah "mana yang harus saya
 * tangani lebih dulu".
 *
 * NILAI ditonjolkan pada kelompok telat. "3 item telat" tak berarti apa-apa
 * sampai orang tahu itu Rp 5 juta atau Rp 500 juta.
 *
 * STATUS dibedakan warna DAN teks (bukan warna saja) — WCAG 1.4.1, dan banyak
 * pemakai sistem ini membacanya di layar HP di bawah sinar matahari.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, PlayCircle } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";

import { C } from "@/lib/warna-ui";

type Status = "telat" | "berjalan" | "akan_mulai";

interface Baris {
  itemId: string;
  name: string;
  categoryCode: string | null;
  plannedStart: string;
  plannedEnd: string;
  progressPct: number;
  totalPrice: number;
  status: Status;
  mingguKe: number;
  hariTelat: number;
}

interface Meta {
  minggu: number;
  telat: number;
  berjalan: number;
  akanMulai: number;
  nilaiTelat: number;
  telatTerlama: number;
  totalBerjadwal: number;
}

const fmtRp = (n: number) =>
  n >= 1_000_000_000 ? `Rp ${(n / 1_000_000_000).toFixed(2)} M`
  : n >= 1_000_000 ? `Rp ${(n / 1_000_000).toFixed(1)} jt`
  : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const fmtTgl = (s: string) =>
  new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

const GAYA: Record<Status, { label: string; warna: string; bg: string; border: string; Icon: typeof AlertTriangle }> = {
  telat:      { label: "Telat",      warna: C.red,    bg: C.redBg,    border: C.redBorder,    Icon: AlertTriangle },
  berjalan:   { label: "Berjalan",   warna: C.blue,   bg: C.blueBg,   border: C.blueBorder,   Icon: PlayCircle },
  akan_mulai: { label: "Akan mulai", warna: C.yellow, bg: C.yellowBg, border: C.yellowBorder, Icon: CalendarClock },
};

export function LookAheadSection({ projectId }: { projectId: string }) {
  const [baris, setBaris] = useState<Baris[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    // `setMemuat(true)` TIDAK dipanggil di sini: state awalnya sudah `true`,
    // dan memanggilnya lagi memicu `react-hooks/set-state-in-effect` tanpa
    // mengubah apa pun. `projectId` di halaman detail tak berganti tanpa
    // remount, jadi tak ada kasus "muat ulang untuk proyek lain".
    api.get<{ data: Baris[]; meta: Meta }>(
      `/api/v1/projects/${projectId}/rab/look-ahead`, { signal: ac.signal })
      .then(({ data }) => { setBaris(data.data ?? []); setMeta(data.meta); setGalat(null); })
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat look-ahead"); })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, [projectId]);

  if (memuat) {
    return <div style={{ padding: 24, color: C.mid, fontSize: 13 }}>Memuat look-ahead…</div>;
  }
  if (galat) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "var(--pad-kartu-lega)", fontSize: 13, color: C.red }}>
        <AlertTriangle size={15} aria-hidden="true" /> {galat}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.text, fontFamily: "var(--font-display, inherit)" }}>
            Look-ahead {meta?.minggu ?? 3} minggu
          </h2>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: C.mid }}>
            Yang harus dikerjakan minggu ini sampai {meta?.minggu ?? 3} minggu ke depan — plus yang sudah telat.
          </p>
        </div>
      </div>

      {/* Ringkasan. Angka NILAI ikut ditampilkan pada telat: "11 item telat"
          tak berarti apa-apa sampai orang tahu itu Rp 5 jt atau Rp 879 jt. */}
      {meta && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginBottom: 16 }}>
          <Kartu label="Telat" nilai={String(meta.telat)}
            sub={meta.telat > 0 ? `${fmtRp(meta.nilaiTelat)} · terlama ${meta.telatTerlama} hari` : "tak ada"}
            warna={meta.telat > 0 ? C.red : C.green} bg={meta.telat > 0 ? C.redBg : C.greenBg}
            border={meta.telat > 0 ? C.redBorder : C.greenBorder} />
          <Kartu label="Berjalan" nilai={String(meta.berjalan)} sub="sedang dikerjakan"
            warna={C.blue} bg={C.blueBg} border={C.blueBorder} />
          <Kartu label="Akan mulai" nilai={String(meta.akanMulai)} sub={`dalam ${meta?.minggu ?? 3} minggu`}
            warna={C.yellow} bg={C.yellowBg} border={C.yellowBorder} />
        </div>
      )}

      {/* Cakupan — WAJIB tampil. Tanpa ini, daftar kosong terbaca sebagai
          "tak ada pekerjaan" padahal artinya "jadwalnya belum diisi". */}
      {meta && meta.totalBerjadwal === 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px",
          borderRadius: 10, background: C.yellowBg, border: `1px solid ${C.yellowBorder}`,
          fontSize: 12, color: C.yellow, marginBottom: 14,
        }}>
          <AlertTriangle size={14} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Belum ada satu pun pekerjaan yang punya tanggal rencana, jadi look-ahead
            tak bisa menampilkan apa pun. Isi <strong>tanggal rencana</strong> di
            bagian Gantt di atas.
          </span>
        </div>
      )}

      {baris.length === 0 && meta && meta.totalBerjadwal > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "12px 12px",
          borderRadius: 10, background: C.greenBg, border: `1px solid ${C.greenBorder}`,
          fontSize: 12, color: C.green,
        }}>
          <PlayCircle size={15} aria-hidden="true" />
          <span>Tak ada pekerjaan telat maupun terjadwal dalam {meta.minggu} minggu ke depan.</span>
        </div>
      )}

      {baris.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {baris.map((b) => {
            const g = GAYA[b.status];
            return (
              <div key={b.itemId} style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                padding: "12px 12px", borderRadius: 10,
                border: `1px solid ${g.border}`, background: g.bg,
              }}>
                <g.Icon size={16} aria-hidden="true" style={{ color: g.warna, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    {/* Label status ditulis, bukan diwakili warna saja — WCAG
                        1.4.1. Pemakai sistem ini banyak membaca di layar HP
                        di bawah sinar matahari. */}
                    <span style={{ fontSize: "var(--t-mikro)", fontWeight: 700, color: g.warna, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {g.label}
                      {b.status === "telat" && ` ${b.hariTelat} hari`}
                    </span>
                    {b.categoryCode && (
                      <span style={{ fontSize: "var(--t-mikro)", color: C.muted, fontFamily: "ui-monospace, monospace" }}>{b.categoryCode}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 2, wordBreak: "break-word" }}>
                    {b.name}
                  </div>
                  <div style={{ fontSize: "var(--t-kecil)", color: C.mid, marginTop: 3 }}>
                    {fmtTgl(b.plannedStart)} – {fmtTgl(b.plannedEnd)}
                    {" · "}progres {b.progressPct}%
                    {b.totalPrice > 0 && <> · {fmtRp(b.totalPrice)}</>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kartu({ label, nilai, sub, warna, bg, border }: {
  label: string; nilai: string; sub: string; warna: string; bg: string; border: string;
}) {
  return (
    <div style={{ padding: "12px 12px", borderRadius: 10, background: bg, border: `1px solid ${border}` }}>
      <div style={{ fontSize: "var(--t-mikro)", fontWeight: 600, color: C.mid, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: warna, fontFamily: "var(--font-display, inherit)", lineHeight: 1.15 }}>{nilai}</div>
      <div style={{ fontSize: "var(--t-kecil)", color: C.mid, marginTop: 1 }}>{sub}</div>
    </div>
  );
}
