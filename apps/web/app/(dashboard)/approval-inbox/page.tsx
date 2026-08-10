"use client";

/**
 * INBOX APPROVAL — apa yang menunggu keputusan saya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU PERTANYAAN, SATU HALAMAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sebelum ini, approver harus membuka tujuh halaman untuk tahu apa yang
 * menunggunya. Yang tak dibuka tak diputuskan — dan yang tak diputuskan
 * menahan pekerjaan lapangan tanpa ada yang tahu sebabnya.
 *
 * ── Urutan: yang paling lama menunggu di ATAS
 *
 * Bukan dikelompokkan menurut jenis. Approver yang membuka halaman ini dengan
 * waktu terbatas harus melihat kasbon dua pekan sebelum change order kemarin;
 * pengelompokan menurut jenis akan menyembunyikannya di bawah.
 *
 * ── Kenapa "sebagian tak terbaca" ditampilkan mencolok
 *
 * Inbox yang tak lengkap LEBIH BERBAHAYA daripada tak ada inbox: ia
 * mengajarkan bahwa antrean kosong berarti tak ada pekerjaan. Kalau server
 * melaporkan ada jenis yang gagal dibaca, itu harus terlihat — bukan
 * disembunyikan supaya halamannya tampak rapi.
 *
 * ── Arah visual (ARAH-VISUAL-2026 §3d)
 *
 * Navy aksen tunggal (indigo DITOLAK, §10 #1). Di sini navy hanya dipakai
 * tautan "Buka" pada baris. Nominal memakai warna teks biasa — mewarnainya
 * membuat tujuh baris berwarna sekaligus, dan yang penting kembali tak
 * menonjol.
 */

import { useCallback, useEffect, useReducer, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Inbox, TriangleAlert, ArrowRight, UserRound } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";

const card: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 14,
  boxShadow: "var(--naik-1)",
};

interface Baris {
  jenis: string;
  label: string;
  id: string;
  judul: string | null;
  nomor: string | null;
  nominal: number | null;
  pengaju_id: string | null;
  dibuat_pada: string | null;
  project_id: string | null;
  level_selesai: number;
  jalur_ui: string;
  saya_pengajunya: boolean;
}

interface Respons {
  data: Baris[];
  total: number;
  ringkas: Record<string, number>;
  dilewati: Array<{ jenis: string; sebab: string }>;
}

const rupiah = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

function lamaMenunggu(iso: string | null): { teks: string; hari: number } {
  if (!iso) return { teks: "—", hari: 0 };
  const hari = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (hari < 1) return { teks: "hari ini", hari };
  if (hari === 1) return { teks: "1 hari", hari };
  return { teks: `${hari} hari`, hari };
}

export default function ApprovalInboxPage() {
  const [mounted, mount] = useReducer(() => true, false);
  useEffect(mount, [mount]);
  if (!mounted) return null;
  return <Konten />;
}

function Konten() {
  const [resp, setResp] = useState<Respons | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const muat = useCallback(async () => {
    try {
      const r = await api.get<Respons>("/api/v1/approval/inbox");
      setResp(r.data);
    } catch {
      setGalat("Gagal memuat antrean persetujuan");
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const baris = resp?.data ?? [];
  const terlama = baris.length > 0 ? lamaMenunggu(baris[0].dibuat_pada).hari : 0;
  const berjenis = Object.entries(resp?.ringkas ?? {}).filter(([, n]) => n > 0);

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "var(--gap-bagian)", display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
          judul="Menunggu Persetujuan"
          keterangan="Seluruh dokumen yang menunggu keputusan Anda — dari semua modul, dalam satu antrean."
          ikon={<Inbox size={19} />}
        />
      </div>

      {/* Sebagian antrean tak terbaca. Ditampilkan MENCOLOK dan di atas:
          "kosong" yang sebenarnya "tak terbaca" adalah kesalahpahaman yang
          paling mahal di halaman ini. */}
      {resp && resp.dilewati.length > 0 && (
        <div
          style={{
            ...card, padding: "var(--pad-kartu)", marginBottom: 12,
            display: "flex", gap: 10,
            borderColor: "var(--danger)", background: "var(--danger-bg)",
          }}
        >
          <TriangleAlert size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
            <strong>Antrean ini TIDAK lengkap.</strong> {resp.dilewati.length} jenis dokumen
            gagal dibaca, jadi mungkin ada yang menunggu tanpa muncul di sini:
            <ul style={{ margin: "6px 0 0", paddingInlineStart: 14 }}>
              {resp.dilewati.map((d) => (
                <li key={d.jenis} style={{ fontSize: 12.5 }}>
                  <code>{d.jenis}</code> — {d.sebab}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {galat && (
        <div
          style={{
            ...card, padding: "var(--pad-kartu)", marginBottom: 12,
            color: "var(--danger)", fontSize: 13,
            borderColor: "var(--danger)", background: "var(--danger-bg)",
          }}
        >
          {galat}
        </div>
      )}

      {memuat ? (
        <div style={{ ...card, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : baris.length === 0 ? (
        <div style={{ ...card, padding: "var(--pad-kartu-lega)", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 4 }}>
            Tak ada yang menunggu keputusan Anda.
          </div>
          <div style={{ fontSize: 12.5, color: C.muted }}>
            {resp && resp.dilewati.length === 0
              ? "Ketujuh jenis dokumen terbaca dan antreannya kosong."
              : "Sebagian jenis tak terbaca — lihat peringatan di atas."}
          </div>
        </div>
      ) : (
        <>
          {/* Ringkasan: menjawab "berapa banyak, dan seberapa tertahan"
              sebelum mata turun ke daftar. */}
          <div
            style={{
              ...card, padding: "var(--pad-kartu)", marginBottom: 12,
              display: "flex", flexWrap: "wrap", gap: "var(--gap-bagian)", alignItems: "baseline",
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: C.text }}>
                {resp?.total ?? 0}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Menunggu keputusan</div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 18, fontWeight: 600, lineHeight: 1.2,
                  color: terlama >= 7 ? "var(--danger)" : C.text,
                }}
              >
                {terlama} hari
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Paling lama tertahan</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: C.text }}>
                {berjenis.length}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Jenis dokumen</div>
            </div>
          </div>

          <div style={{ ...card, overflow: "hidden" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                // Kolom nominal & tanggal sejajar antar baris; tanpa ini
                // "Rp 111.111" lebih sempit daripada "Rp 888.888".
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <caption className="sr-only">
                Dokumen yang menunggu persetujuan, diurutkan dari yang paling lama tertahan
              </caption>
              <thead>
                <tr style={{ background: "var(--surface-subtle)" }}>
                  {["Jenis", "Dokumen", "Nominal", "Tertahan", ""].map((h, i) => (
                    <th
                      key={h || i}
                      scope="col"
                      style={{
                        textAlign: i === 2 ? "right" : "left",
                        padding: "var(--pad-baris)",
                        fontSize: 11.5, fontWeight: 600, color: C.muted,
                        textTransform: "uppercase", letterSpacing: "0.03em",
                        borderBottom: "1px solid var(--border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {baris.map((b) => {
                  const t = lamaMenunggu(b.dibuat_pada);
                  return (
                    <tr key={`${b.jenis}-${b.id}`} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "var(--pad-baris)", whiteSpace: "nowrap", color: C.mid }}>
                        {b.label}
                      </td>
                      <td style={{ padding: "var(--pad-baris)", color: C.text }}>
                        {b.nomor && (
                          <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 12, marginInlineEnd: 8 }}>
                            {b.nomor}
                          </span>
                        )}
                        {b.judul ?? <span style={{ color: C.muted }}>(tanpa judul)</span>}
                        {b.level_selesai > 0 && (
                          <span style={{ fontSize: 11.5, color: C.muted, marginInlineStart: 8 }}>
                            · level {b.level_selesai} sudah setuju
                          </span>
                        )}
                        {/* Pengaju tak boleh menyetujui pengajuannya sendiri
                            (SoD). Ditandai di sini supaya ia tak membuka
                            dokumennya hanya untuk menemukan tombolnya tak ada. */}
                        {b.saya_pengajunya && (
                          <span
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              fontSize: 11, marginInlineStart: 8,
                              padding: "var(--pad-lencana)", borderRadius: 999,
                              color: C.mid, background: "var(--surface-subtle)",
                              border: `1px solid ${C.border}`, whiteSpace: "nowrap",
                            }}
                          >
                            <UserRound size={11} aria-hidden="true" />
                            pengajuan Anda
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "var(--pad-baris)", textAlign: "right",
                          whiteSpace: "nowrap", color: C.text,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {b.nominal != null ? rupiah(b.nominal) : <span style={{ color: C.muted }}>—</span>}
                      </td>
                      <td
                        style={{
                          padding: "var(--pad-baris)", whiteSpace: "nowrap",
                          color: t.hari >= 7 ? "var(--danger)" : C.mid,
                          fontWeight: t.hari >= 7 ? 600 : 400,
                        }}
                      >
                        {t.teks}
                      </td>
                      <td style={{ padding: "var(--pad-baris)", textAlign: "right", whiteSpace: "nowrap" }}>
                        <Link
                          href={b.jalur_ui}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            color: C.aksen, textDecoration: "none", fontSize: 12.5,
                          }}
                        >
                          Buka
                          <ArrowRight size={13} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
