"use client";

/**
 * ANGGARAN PELAKSANAAN (RAP) — pagu biaya, bukan nilai jual.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * INI LAYAR YANG PALING RUSAK DI VERSI LAMA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-16 lewat sesi ber-login: tab "Material & RAP" merender
 * HALAMAN PUTIH. Bukan pesan "belum ada data" — benar-benar kosong: satu
 * dropdown proyek, lalu ruang putih. Memilih proyek pun tak mengubahnya.
 *
 * Yang mahal bukan kekosongannya. `rap_budget` memang cuma berisi 1 baris di
 * seluruh basis, jadi kosong itu JUJUR. Yang mahal adalah kekosongan yang tak
 * menjelaskan diri: pengguna tak punya cara tahu bahwa RAP dibentuk DARI versi
 * estimasi, jadi layar itu terbaca sebagai "fitur belum jadi".
 *
 * ── Perbedaan yang paling sering tertukar, dan mahal kalau salah
 *
 *     RAB = nilai JUAL   (mengandung margin — yang ditawarkan ke klien)
 *     RAP = pagu BIAYA   (yang benar-benar boleh dibelanjakan)
 *
 * Tertukar sekali saja, seluruh CPI/SPI jadi optimistis sistematis — persis
 * cacat yang diperbaiki 2026-07-31 (CECEP/52 Gap-2, `meta.evm.bacSource`).
 * Karena itu bedanya dinyatakan DI LAYAR, bukan diserahkan ke pengetahuan
 * pengguna.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wallet, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { LayarKosong } from "../_bersama/layar-kosong";
import { angka, rp, type ProyekRingkas } from "../_bersama/tipe";

interface VersiRingkas {
  id: string;
  version_number: number;
  status: string;
  total_amount?: number | string | null;
}
interface SkenarioLengkap {
  id: string;
  name: string;
  versions: VersiRingkas[];
}
interface RapRingkas {
  id: string;
  name: string;
  status?: string | null;
  total_budget?: number | string | null;
}

export default function RapPage() {
  const router = useRouter();
  const params = useSearchParams();
  const proyekId = params.get("proyek") ?? "";

  const { data: dataProyek } = useData<{ projects?: ProyekRingkas[] }>("/api/v1/projects");
  const proyek = useMemo(() => dataProyek?.projects ?? [], [dataProyek]);

  const [daftar, setDaftar] = useState<RapRingkas[]>([]);
  const [skenario, setSkenario] = useState<SkenarioLengkap[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const muat = useCallback(async (pid: string) => {
    if (!pid) { setDaftar([]); setSkenario([]); return; }
    setMemuat(true);
    try {
      const [rRap, rSc] = await Promise.all([
        api.get<{ data: RapRingkas[] }>(`/api/v1/projects/${pid}/rap`),
        api.get<{ data: SkenarioLengkap[] }>(`/api/v1/projects/${pid}/scenarios`),
      ]);
      setDaftar(rRap.data.data ?? []);
      setSkenario(rSc.data.data ?? []);
    } catch {
      setDaftar([]); setSkenario([]);
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => { void muat(proyekId); }, [proyekId, muat]);

  /** Semua versi lintas skenario, yang SUDAH TERKUNCI saja. */
  const versiTerkunci = useMemo(
    () => skenario.flatMap((sc) =>
      (sc.versions ?? [])
        .filter((v) => v.status !== "draft")
        .map((v) => ({ ...v, namaSkenario: sc.name }))),
    [skenario],
  );

  const adaVersiDraft = useMemo(
    () => skenario.some((sc) => (sc.versions ?? []).some((v) => v.status === "draft")),
    [skenario],
  );

  const buatRap = async (versiId: string) => {
    setSibuk(true); setGalat("");
    try {
      await api.post(`/api/v1/projects/${proyekId}/rap`, {
        estimate_version_id: versiId,
        name: "RAP",
      });
      await muat(proyekId);
    } catch (e) {
      setGalat((e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal membuat RAP");
    } finally { setSibuk(false); }
  };

  if (!proyekId) {
    return (
      <>
        <Pemilih proyek={proyek} nilai="" onPilih={(id) => router.push(`/estimasi/rap?proyek=${id}`)} />
        <LayarKosong
          ikon={<Wallet size={21} />}
          judul="Pilih proyek dulu"
          apa="RAP adalah pagu biaya pelaksanaan untuk satu proyek."
          kenapa="Pilih proyeknya di atas untuk melihat atau membuat RAP."
          aksi={{ label: "Lihat daftar proyek", href: "/estimasi" }}
        />
      </>
    );
  }

  return (
    <>
      <Pemilih
        proyek={proyek}
        nilai={proyekId}
        onPilih={(id) => router.push(id ? `/estimasi/rap?proyek=${id}` : "/estimasi/rap")}
      />

      {galat && (
        <p role="alert" style={{
          background: "var(--danger-bg)", color: "var(--danger)",
          border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
          padding: "8px 12px", fontSize: "var(--teks-label)", marginBottom: 12,
        }}>{galat}</p>
      )}

      {memuat && <p style={{ fontSize: "var(--teks-label)", color: C.muted }}>Memuat…</p>}

      {/* ── Sudah ada RAP ─────────────────────────────────────────────── */}
      {!memuat && daftar.length > 0 && (
        <section style={{
          border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
          background: C.surface, overflow: "hidden",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--teks-tabel)" }}>
              <thead>
                <tr>
                  <th style={th}>Nama</th>
                  <th style={th}>Keadaan</th>
                  <th style={{ ...th, textAlign: "right" }}>Pagu biaya</th>
                </tr>
              </thead>
              <tbody>
                {daftar.map((r) => (
                  <tr key={r.id}>
                    <td style={td}>{r.name}</td>
                    <td style={td}>
                      {r.status === "locked" ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.aksen, fontWeight: 600 }}>
                          <Lock size={11} aria-hidden="true" /> Terkunci
                        </span>
                      ) : "Masih disusun"}
                    </td>
                    <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {angka(Number(r.total_budget ?? 0))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Belum ada RAP: kenapa, dan apa langkah berikutnya ─────────── */}
      {!memuat && daftar.length === 0 && versiTerkunci.length > 0 && (
        <section style={{
          border: `1px solid ${C.border}`, borderRadius: "var(--radius-md)",
          background: C.surface, padding: "var(--pad-kartu-lega, 16px)",
        }}>
          <h2 style={{
            fontFamily: "var(--font-display), sans-serif",
            fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 5,
          }}>Bentuk RAP dari RAB yang sudah terkunci</h2>
          <p style={{
            fontSize: "var(--teks-label)", color: C.mid,
            lineHeight: 1.6, marginBottom: 13, maxWidth: "62ch",
          }}>
            RAP adalah <b>pagu biaya</b> — beda dari RAB yang merupakan nilai
            jual (sudah mengandung margin). Pilih RAB terkunci di bawah; item
            dan take-off materialnya jadi dasar pagu.
          </p>

          <div style={{ display: "grid", gap: 8 }}>
            {versiTerkunci.map((v) => (
              <div key={v.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                gap: 10, flexWrap: "wrap",
                border: `1px solid ${C.border}`, borderRadius: "var(--radius-dense)",
                background: C.subtle, padding: 12,
              }}>
                <span style={{ fontSize: "var(--teks-label)", color: C.text }}>
                  <b>{v.namaSkenario}</b> · Revisi {v.version_number}
                  {v.total_amount != null && (
                    <span style={{ color: C.muted }}> · {rp(Number(v.total_amount))}</span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => buatRap(v.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "var(--pad-tombol)", borderRadius: "var(--radius-dense)",
                    background: C.aksen, color: C.onAksen, border: `1px solid ${C.aksen}`,
                    fontSize: "var(--teks-label)", fontWeight: 600,
                    fontFamily: "inherit", cursor: sibuk ? "wait" : "pointer",
                  }}
                >
                  Bentuk RAP dari ini →
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Belum ada RAP DAN belum ada RAB terkunci ──────────────────── */}
      {!memuat && daftar.length === 0 && versiTerkunci.length === 0 && (
        <LayarKosong
          ikon={<Wallet size={21} />}
          judul="Belum ada RAP untuk proyek ini"
          apa="RAP adalah anggaran biaya pelaksanaan — dibuat dari RAB yang sudah terkunci."
          kenapa={
            adaVersiDraft
              ? "RAB proyek ini masih berstatus disusun. Kunci dulu lewat “Kunci & kirim ke klien”, lalu RAP bisa dibentuk dari itemnya."
              : "Proyek ini belum punya RAB. Susun RAB-nya dulu, kunci, lalu RAP bisa dibentuk otomatis dari itemnya."
          }
          aksi={{ label: adaVersiDraft ? "Buka RAB untuk dikunci" : "Susun RAB dulu",
                  href: `/estimasi/rab?proyek=${proyekId}` }}
        />
      )}
    </>
  );
}

function Pemilih({ proyek, nilai, onPilih }: {
  proyek: ProyekRingkas[]; nilai: string; onPilih: (id: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <select
        className="isian-fokus"
        aria-label="Proyek"
        value={nilai}
        onChange={(e) => onPilih(e.target.value)}
        style={{
          width: "min(100%, 340px)", padding: "9px 12px",
          border: `1px solid var(--border-strong)`,
          borderRadius: "var(--radius-dense)",
          background: C.surface, color: C.text,
          fontSize: "var(--teks-label)", fontFamily: "inherit",
        }}
      >
        <option value="">— Pilih proyek —</option>
        {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "var(--pad-baris)",
  fontSize: 11, fontWeight: 700, letterSpacing: ".04em",
  textTransform: "uppercase", color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface-subtle)", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "var(--pad-baris)", borderBottom: "1px solid var(--border)",
  verticalAlign: "middle",
};
