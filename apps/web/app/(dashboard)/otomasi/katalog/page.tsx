"use client";

/**
 * KATALOG OTOMASI — apa yang dikerjakan tiap otomasi, dan di mana.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Saya dapat pesan ini — dari mana asalnya, dan kenapa saya yang menerimanya?"
 *
 * Tiga halaman otomasi yang sudah ada tak menjawabnya. Ikhtisar menjawab
 * "sehat atau tidak", Alur menjawab "apa yang terpasang di n8n", Riwayat
 * menjawab "kapan terakhir jalan". Ketiganya mengandaikan pembaca sudah tahu
 * apa yang dikerjakan otomasi itu.
 *
 * Founder memintanya eksplisit (2026-08-15): katalog di UI beserta penjelasan
 * dan flow kerjanya.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KEPUTUSAN RANCANGAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── Daftar dulu, alur kerja saat diminta
 *
 * Tujuh belas otomasi × empat langkah = enam puluh delapan kalimat. Menampilkan
 * semuanya sekaligus membuat halaman ini jadi dokumen yang di-scroll, bukan
 * alat yang dipakai — dan yang mencari SATU otomasi harus melewati enam belas
 * lainnya.
 *
 * Jadi: satu baris per otomasi, langkah kerjanya terbuka saat diklik.
 *
 * ── Kenapa "belum terpasang" TIDAK ditandai bahaya
 *
 * Nada bahaya dipakai untuk yang rusak. Otomasi yang belum dipasang di n8n
 * tidak rusak — ia belum dipasang, dan itu keadaan wajar untuk yang belum
 * di-deploy. Menandainya merah membuat halaman ini terlihat penuh masalah
 * sejak hari pertama, dan halaman yang selalu merah berhenti dibaca.
 *
 * Yang bernada bahaya hanya satu: alur yang terpasang DAN kesehatannya buruk.
 *
 * ── Satu aksen (ARAH-VISUAL-2026 §3d)
 *
 * Navy hanya untuk satu hal di layar ini: penanda langkah yang berjalan di
 * dalam sistem. Itu jawaban atas pertanyaan yang founder ajukan langsung
 * ("dipasang di sistem atau di n8n"), jadi ia yang pantas menonjol. Sisanya
 * netral.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bot, CalendarClock, ChevronDown, ChevronRight, MessageSquare,
  Server, Settings2, Workflow, Zap,
} from "lucide-react";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Galat, Rangka, Lencana, Kartu } from "@/components/dasar";
import { Kosong } from "@/components/ui-dasar";

type Penempatan = "sistem" | "n8n";
type Pemicu = "jadwal" | "peristiwa" | "percakapan";

interface Langkah {
  di: Penempatan;
  teks: string;
}

interface Entri {
  kunci: string;
  nomor?: string;
  nama: string;
  pemicu: Pemicu;
  penjelasan: string;
  penerima: string;
  alur: Langkah[];
  catatan?: string;
  terpasang: boolean;
  aktif: boolean;
  kesehatan: string | null;
  jalan_terakhir: string | null;
  ambang?: string;
  ambang_nilai: number | null;
  ambang_label: string | null;
  ambang_bawaan: number | null;
  ambang_disetel: boolean;
}

const LABEL_PEMICU: Record<Pemicu, { teks: string; ikon: typeof Zap }> = {
  jadwal: { teks: "Berjalan terjadwal", ikon: CalendarClock },
  peristiwa: { teks: "Saat sesuatu terjadi", ikon: Zap },
  percakapan: { teks: "Lewat WhatsApp", ikon: MessageSquare },
};

/** Waktu relatif — sama dengan halaman Ikhtisar, supaya satu kebiasaan. */
function sejak(iso: string): string {
  const detik = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (detik < 60) return "baru saja";
  if (detik < 3600) return `${Math.floor(detik / 60)} mnt lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  return `${Math.floor(detik / 86400)} hr lalu`;
}

/**
 * Nominal besar dibaca sebagai "Rp 5 jt", bukan "Rp 5.000.000".
 *
 * Ambang saldo bawaannya lima juta, dan angka penuh di dalam kalimat pendek
 * memaksa mata menghitung nol. Yang butuh angka persisnya membukanya di
 * Pengaturan, tempat ia memang bisa diubah.
 */
function ringkasAngka(n: number, kunci: string): string {
  if (kunci.endsWith(".rupiah")) {
    if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toLocaleString("id-ID")} M`;
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toLocaleString("id-ID")} jt`;
    return `Rp ${n.toLocaleString("id-ID")}`;
  }
  if (kunci.endsWith(".persen")) return `${n}%`;
  if (kunci.endsWith(".hari")) return `${n} hari`;
  return String(n);
}

export default function KatalogOtomasiPage() {
  const [buka, setBuka] = useState<Set<string>>(new Set());
  const [saring, setSaring] = useState<Pemicu | "semua">("semua");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan useCallback+useEffect+queueMicrotask.
  */
  const { data: hasil, galat: galatMuat, muatUlang } = useData<{ data: Entri[] }>(
    "/api/v1/otomasi/katalog",
  );
  const data = hasil?.data ?? null;
  const galat = galatMuat ? "Gagal memuat katalog otomasi" : null;
  const muat = async () => { await muatUlang(); };

  const tampil = useMemo(
    () => (data ?? []).filter((e) => saring === "semua" || e.pemicu === saring),
    [data, saring],
  );

  /*
    Jumlah per pemicu dihitung dari SELURUH data, bukan dari yang tersaring —
    tombol saring yang angkanya berubah mengikuti saringan tak memberi tahu
    apa-apa selain dirinya sendiri.
  */
  const jumlah = useMemo(() => {
    const j: Record<string, number> = { semua: (data ?? []).length };
    for (const e of data ?? []) j[e.pemicu] = (j[e.pemicu] ?? 0) + 1;
    return j;
  }, [data]);

  const alih = (kunci: string) =>
    setBuka((s) => {
      const b = new Set(s);
      if (b.has(kunci)) b.delete(kunci); else b.add(kunci);
      return b;
    });

  return (
    /*
      Container ber-token lebar — dituntut `tata-letak-ratchet` (ambang NOL).

      `--w-page` (1280px): isinya kartu bercampur — penjelasan naratif, daftar
      langkah alur, dan penanda status. `--w-form` terlalu sempit untuk
      langkah alur yang berdampingan; `--w-luas` untuk tabel padat kolom, dan
      halaman ini tak punya tabel.
    */
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
    }}>
      <KepalaHalaman
        judul="Katalog Otomasi"
        keterangan="Apa yang dikerjakan tiap otomasi, kapan berjalan, dan di bagian mana ia dipasang."
        ikon={<Bot size={20} />}
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}
      {!data && !galat && <Rangka tinggi={72} jumlah={5} />}

      {data && (
        <>
          {/* ── Saringan pemicu ─────────────────────────────────────────── */}
          <div
            style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "var(--r4)" }}
            role="group"
            aria-label="Saring berdasarkan pemicu"
          >
            {([
              ["semua", "Semua"],
              ["jadwal", "Terjadwal"],
              ["percakapan", "Lewat WhatsApp"],
              ["peristiwa", "Saat ada kejadian"],
            ] as const).map(([nilai, label]) => {
              const aktif = saring === nilai;
              const n = jumlah[nilai] ?? 0;
              return (
                <button
                  key={nilai}
                  type="button"
                  onClick={() => setSaring(nilai as Pemicu | "semua")}
                  aria-pressed={aktif}
                  disabled={n === 0}
                  style={{
                    /* 44px — target sentuh minimum, bukan angka estetis. */
                    minHeight: 40,
                    padding: "var(--r2) var(--r3)",
                    borderRadius: 8,
                    border: `1px solid ${aktif ? C.navy : C.border}`,
                    background: aktif ? C.navy : C.surface,
                    color: aktif ? C.onNavy : n === 0 ? C.muted : C.text,
                    fontSize: 13,
                    fontWeight: aktif ? 600 : 500,
                    cursor: n === 0 ? "not-allowed" : "pointer",
                    opacity: n === 0 ? 0.5 : 1,
                  }}
                >
                  {/*
                    Warna, bukan `opacity` — dituntut `uji-opacity-teks`.

                    `opacity` menipiskan teks TERHADAP apa pun di belakangnya,
                    jadi rasio kontrasnya tak bisa dihitung dan tak bisa
                    dijamin lolos WCAG. Di tombol aktif yang berlatar navy,
                    0,7 menjatuhkannya jauh di bawah 4,5:1 — angka dalam
                    kurung itu justru yang paling sering dibaca sekilas.
                  */}
                  {label}{" "}
                  <span style={{ color: aktif ? C.onNavy : C.muted }}>({n})</span>
                </button>
              );
            })}
          </div>

          {tampil.length === 0 ? (
            <Kosong judul="Tak ada otomasi pada saringan ini" sebab="Coba pilih saringan lain di atas." />
          ) : (
            <div style={{ display: "grid", gap: "var(--r3)" }}>
              {tampil.map((e) => {
                const terbuka = buka.has(e.kunci);
                const P = LABEL_PEMICU[e.pemicu];
                const IkonPemicu = P.ikon;
                /*
                  Hanya yang TERPASANG dan kesehatannya buruk yang bernada
                  bahaya. Yang belum terpasang bukan rusak — lihat komentar
                  kepala berkas.
                */
                const bermasalah = e.terpasang && e.kesehatan === "buruk";

                return (
                  <Kartu key={e.kunci} pad="rapat">
                    {/* ── Baris ringkas ───────────────────────────────── */}
                    <button
                      type="button"
                      onClick={() => alih(e.kunci)}
                      aria-expanded={terbuka}
                      aria-controls={`alur-${e.kunci}`}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "var(--r3)",
                        background: "none",
                        border: "none",
                        padding: "var(--r2)",
                        textAlign: "left",
                        cursor: "pointer",
                        minHeight: 44,
                      }}
                    >
                      <span style={{ color: C.mid, marginTop: 2, flexShrink: 0 }} aria-hidden="true">
                        {terbuka ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      </span>

                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: "flex", alignItems: "center", gap: "var(--r2)",
                          flexWrap: "wrap", marginBottom: 4,
                        }}>
                          <strong style={{ fontSize: 15, color: C.text }}>{e.nama}</strong>
                          {e.nomor && (
                            <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
                              #{e.nomor}
                            </span>
                          )}
                          {bermasalah && <Lencana nada="bahaya">Bermasalah</Lencana>}
                          {!e.terpasang && <Lencana nada="netral">Belum dipasang</Lencana>}
                          {e.terpasang && !e.aktif && <Lencana nada="netral">Dimatikan</Lencana>}
                        </span>

                        <span style={{
                          display: "block", fontSize: 13, color: C.mid, lineHeight: 1.6,
                          /* 65–75 huruf per baris — batas keterbacaan. */
                          maxWidth: "68ch",
                        }}>
                          {e.penjelasan}
                        </span>

                        <span style={{
                          display: "flex", alignItems: "center", gap: "var(--r3)",
                          flexWrap: "wrap", marginTop: 6, fontSize: 12, color: C.muted,
                        }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <IkonPemicu size={13} aria-hidden="true" /> {P.teks}
                          </span>
                          {e.jalan_terakhir && (
                            <span>Terakhir jalan {sejak(e.jalan_terakhir)}</span>
                          )}
                          {e.ambang_nilai !== null && e.ambang && (
                            <span>
                              Batas: <strong style={{ color: C.mid, fontVariantNumeric: "tabular-nums" }}>
                                {ringkasAngka(e.ambang_nilai, e.ambang)}
                              </strong>
                              {!e.ambang_disetel && " (bawaan)"}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>

                    {/* ── Alur kerja ──────────────────────────────────── */}
                    {terbuka && (
                      <div
                        id={`alur-${e.kunci}`}
                        style={{
                          marginTop: "var(--r3)",
                          paddingTop: "var(--r3)",
                          borderTop: `1px solid ${C.border}`,
                        }}
                      >
                        <p style={{
                          fontSize: 12, fontWeight: 600, color: C.mid,
                          textTransform: "uppercase", letterSpacing: "0.04em",
                          margin: "0 0 var(--r3)",
                        }}>
                          Cara kerjanya
                        </p>

                        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--r2)" }}>
                          {e.alur.map((l, i) => (
                            <li key={i} style={{ display: "flex", gap: "var(--r3)", alignItems: "flex-start" }}>
                              {/*
                                Nomor langkah pakai angka tabular supaya
                                kolomnya tak bergoyang saat mencapai dua digit.
                              */}
                              <span style={{
                                flexShrink: 0, width: 22, height: 22, borderRadius: "50%",
                                background: C.subtle, color: C.mid,
                                fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {i + 1}
                              </span>

                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>
                                  {l.teks}
                                </span>
                                {/*
                                  Penanda tempat — jawaban langsung atas
                                  pertanyaan founder "dipasang di sistem atau
                                  di n8n". Ikon DAN teks, tak pernah warna
                                  saja: WCAG 1.4.1, dan sebagian pembaca
                                  layar ini memakai layar lama berwarna pucat.
                                */}
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  marginLeft: 8, padding: "1px 7px", borderRadius: 5,
                                  fontSize: 11, fontWeight: 600,
                                  background: l.di === "sistem" ? C.navyLight : C.subtle,
                                  color: l.di === "sistem" ? C.navy : C.mid,
                                  whiteSpace: "nowrap",
                                }}>
                                  {l.di === "sistem"
                                    ? <><Server size={11} aria-hidden="true" /> di sistem</>
                                    : <><Workflow size={11} aria-hidden="true" /> di n8n</>}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ol>

                        <dl style={{
                          margin: "var(--r4) 0 0", display: "grid",
                          gap: "var(--r2)", fontSize: 13,
                        }}>
                          <div style={{ display: "flex", gap: "var(--r2)", flexWrap: "wrap" }}>
                            <dt style={{ color: C.muted, minWidth: 96 }}>Yang diberi tahu</dt>
                            <dd style={{ margin: 0, color: C.text }}>{e.penerima}</dd>
                          </div>

                          {e.ambang && e.ambang_label && (
                            <div style={{ display: "flex", gap: "var(--r2)", flexWrap: "wrap" }}>
                              <dt style={{ color: C.muted, minWidth: 96 }}>Batasnya</dt>
                              <dd style={{ margin: 0, color: C.text }}>
                                {e.ambang_label} —{" "}
                                <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                                  {ringkasAngka(e.ambang_nilai ?? 0, e.ambang)}
                                </strong>
                                {!e.ambang_disetel && e.ambang_bawaan !== null && (
                                  <span style={{ color: C.muted }}> (bawaan, belum diubah)</span>
                                )}
                                {" · "}
                                <Link
                                  href="/pengaturan/otomasi"
                                  style={{ color: C.navy, textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 3 }}
                                >
                                  <Settings2 size={12} aria-hidden="true" /> ubah
                                </Link>
                              </dd>
                            </div>
                          )}

                          {e.catatan && (
                            <div style={{ display: "flex", gap: "var(--r2)", flexWrap: "wrap" }}>
                              <dt style={{ color: C.muted, minWidth: 96 }}>Perlu diketahui</dt>
                              <dd style={{ margin: 0, color: C.mid, maxWidth: "62ch", lineHeight: 1.6 }}>
                                {e.catatan}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}
                  </Kartu>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
