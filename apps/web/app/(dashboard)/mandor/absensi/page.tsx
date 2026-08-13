"use client";

/**
 * ABSENSI LAPANGAN (F5-1 INTI #9)
 *
 * ── Bentuknya ditentukan oleh siapa yang memakainya
 *
 * Yang mengisi halaman ini adalah mandor di lokasi, sering lewat ponsel,
 * SETIAP HARI, untuk 5–15 tukang. Formulir bertingkat dengan tombol simpan
 * di bawah akan ditinggalkan setelah minggu pertama — dan begitu ditinggalkan,
 * `days_worked` kembali diketik dari ingatan, yang persis masalah yang hendak
 * dihilangkan modul ini.
 *
 * Karena itu: satu tanggal, satu daftar, satu ketukan per orang. Tiga tombol
 * besar (Penuh · ½ · Absen) menggantikan kotak angka, karena mengetik "0.5"
 * di ponsel dengan tangan berdebu bukan interaksi yang akan bertahan.
 *
 * ── Kenapa "Tidak hadir" adalah TOMBOL, bukan ketiadaan
 *
 * Baris tanpa jawaban dan baris "tidak hadir" terlihat sama di layar tapi
 * berarti berbeda: yang satu belum diisi, yang lain sudah diputuskan. Kalau
 * keduanya sama-sama kosong, mandor tak bisa tahu ia sudah selesai atau
 * belum — dan hari yang terlewat baru ketahuan saat upahnya kurang.
 */

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Save, Users, CheckCheck } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";

type Scope = {
  id: string;
  scope_name: string;
  payment_system: string;
  project?: { id: string; name: string } | null;
};
type Assignment = {
  id: string;
  mandor?: { id: string; name: string } | null;
  project?: { id: string; name: string } | null;
  work_scopes?: Scope[];
};
type Worker = { id: string; name: string; tipe: string | null; is_active: boolean };
type BarisAbsen = {
  id: string;
  worker_id: string;
  tanggal: string;
  porsi_hari: number | string;
  jam_lembur: number | string;
  keterangan: string | null;
};

/** Nilai porsi yang bisa dipilih — sengaja hanya tiga. */
const PILIHAN = [
  { nilai: 1, label: "Penuh", pendek: "1" },
  { nilai: 0.5, label: "½ hari", pendek: "½" },
  { nilai: 0, label: "Absen", pendek: "0" },
] as const;

function hariIni() {
  return new Date().toISOString().slice(0, 10);
}

/** "Senin, 6 Agu 2026" — tanggal yang dibaca manusia, bukan 2026-08-06. */
function tanggalPanjang(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "short", year: "numeric",
  });
}

export default function AbsensiPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [scopeId, setScopeId] = useState("");
  const [tanggal, setTanggal] = useState(hariIni());
  const [absen, setAbsen] = useState<Record<string, { porsi: number; lembur: number }>>({});
  const [tersimpan, setTersimpan] = useState<Record<string, { porsi: number; lembur: number }>>({});
  const [memuat, setMemuat] = useState(true);
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<{ teks: string; ok: boolean } | null>(null);
  /** Dinaikkan tombol "Muat ulang" — satu-satunya jalur pemuatan tetap efek. */
  const [muatUlangKe, setMuatUlangKe] = useState(0);

  // `useIzin`, BUKAN `hasPermission`: yang kedua membaca localStorage saat
  // render, dan localStorage tak ada di server — nilainya SELALU false di sana
  // dan true di klien. React membuang hasil SSR lalu merender ulang seluruh
  // halaman (penjaga `uji-izin-hydration`).
  const bolehIsi = useIzin("mandor:wage:create");

  const semuaScope = useMemo(
    () => assignments.flatMap((a) =>
      (a.work_scopes ?? []).map((s) => ({ ...s, project: a.project ?? s.project }))),
    [assignments],
  );
  /**
   * Lingkup yang sedang dilihat.
   *
   * Kalau belum ada pilihan, pakai yang pertama — DITURUNKAN saat render,
   * bukan lewat `useEffect` + `setState`. Efek yang menulis state pada render
   * pertama menyebabkan render kedua dengan daftar kosong di antaranya, dan
   * halaman berkedip dari "belum ada lingkup" ke isinya (aturan
   * `react-hooks/set-state-in-effect`, dijaga `lint:ratchet`).
   */
  const scopeEfektif = scopeId || semuaScope[0]?.id || "";
  const scopeAktif = semuaScope.find((s) => s.id === scopeEfektif) ?? null;

  // ── Muat penugasan + daftar pekerja ────────────────────────────────────
  useEffect(() => {
    const ac = makeAbortController();
    Promise.all([
      api.get<{ assignments: Assignment[] }>("/api/v1/mandor/assignments", { signal: ac.signal }),
      api.get<{ workers: Worker[] }>("/api/v1/mandor/workers", { signal: ac.signal })
        .catch(() => ({ data: { workers: [] } })),
    ])
      .then(([a, w]) => {
        setAssignments(a.data.assignments ?? []);
        setWorkers((w.data.workers ?? []).filter((x) => x.is_active !== false));
      })
      .catch((e) => { if (e?.name !== "CanceledError") setPesan({ teks: "Gagal memuat data", ok: false }); })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, []);

  // ── Muat absensi tanggal terpilih ──────────────────────────────────────
  //
  // Logikanya ADA DI DALAM efek, bukan di "useCallback" yang dipanggil efek.
  // Bentuk kedua membuat "react-hooks/set-state-in-effect" melaporkan render
  // berantai yang tak ada: aturan itu tak bisa melacak ke dalam callback, jadi
  // ia menganggap setState-nya sinkron padahal semuanya terjadi sesudah await.
  //
  // Tombol "Muat ulang" menaikkan PENGHITUNG, bukan memanggil pemuat langsung.
  // Dua jalur pemuatan yang harus tetap sama adalah dua jalur yang suatu hari
  // berbeda — dan yang satu akan lupa membatalkan permintaan lamanya.
  useEffect(() => {
    if (!scopeEfektif || !tanggal) return;
    const ac = makeAbortController();
    api
      .get<{ absensi: BarisAbsen[] }>("/api/v1/absensi", {
        params: { scope_id: scopeEfektif, dari: tanggal, sampai: tanggal },
        signal: ac.signal,
      })
      .then((r) => {
        const peta: Record<string, { porsi: number; lembur: number }> = {};
        for (const b of r.data.absensi ?? []) {
          peta[b.worker_id] = { porsi: Number(b.porsi_hari), lembur: Number(b.jam_lembur) };
        }
        setAbsen(peta);
        setTersimpan(peta);
      })
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        setAbsen({});
        setTersimpan({});
      });
    return () => ac.abort();
  }, [scopeEfektif, tanggal, muatUlangKe]);

  // Yang berubah sejak terakhir dimuat — dasar tombol simpan dan peringatan
  // "belum tersimpan".
  const berubah = useMemo(() => {
    const k = new Set([...Object.keys(absen), ...Object.keys(tersimpan)]);
    return [...k].filter((id) => {
      const a = absen[id], b = tersimpan[id];
      if (!a && !b) return false;
      if (!a || !b) return true;
      return a.porsi !== b.porsi || a.lembur !== b.lembur;
    });
  }, [absen, tersimpan]);

  const terisi = Object.keys(absen).length;
  const belumDijawab = workers.filter((w) => !absen[w.id]).length;
  const totalHari = Object.values(absen).reduce((s, v) => s + v.porsi, 0);

  function setPorsi(workerId: string, porsi: number) {
    setAbsen((p) => ({ ...p, [workerId]: { porsi, lembur: p[workerId]?.lembur ?? 0 } }));
  }
  function setLembur(workerId: string, jam: number) {
    setAbsen((p) => ({ ...p, [workerId]: { porsi: p[workerId]?.porsi ?? 1, lembur: jam } }));
  }

  /** Isi seluruh baris yang BELUM dijawab dengan "penuh".
   *  Tidak menimpa yang sudah dijawab — jalan pintas tak boleh menghapus
   *  keputusan yang sudah dibuat. */
  function isiSisaPenuh() {
    setAbsen((p) => {
      const baru = { ...p };
      for (const w of workers) if (!baru[w.id]) baru[w.id] = { porsi: 1, lembur: 0 };
      return baru;
    });
  }

  async function simpan() {
    if (!scopeEfektif || berubah.length === 0) return;
    setMenyimpan(true);
    setPesan(null);
    try {
      await api.post("/api/v1/absensi", {
        scope_id: scopeEfektif,
        tanggal,
        entri: Object.entries(absen).map(([worker_id, v]) => ({
          worker_id, porsi_hari: v.porsi, jam_lembur: v.lembur,
        })),
      });
      setTersimpan(absen);
      setPesan({ teks: `Absensi ${tanggalPanjang(tanggal)} tersimpan.`, ok: true });
    } catch (e: unknown) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setPesan({ teks: m ?? "Gagal menyimpan absensi", ok: false });
    } finally {
      setMenyimpan(false);
    }
  }

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };

  return (
    // Padding disediakan `mandor/layout.tsx` — lihat catatan di sana.
    // Menambahkannya lagi di sini membuat jaraknya ganda.
    <div style={{
      width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: 20 }}>
        {/* `<h2>`, bukan `<h1>`: judul halaman ("Mandor") sekarang milik
            layout modul. Dua `<h1>` dalam satu dokumen membuat pembaca layar
            kehilangan tingkatan yang seharusnya menuntunnya. */}
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          Absensi Lapangan
        </h2>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "64ch", lineHeight: 1.55 }}>
          Catatan harian yang menjadi sumber jumlah hari kerja di laporan upah.
          Tanpa ini, angka upah disusun dari ingatan — dan selisihnya baru
          ketahuan saat tukang menagih.
        </p>
      </div>

      {/* ── Pemilih lingkup + tanggal ─────────────────────────────────── */}
      <div className="rise rise-2" style={{
        ...kartu, padding: "12px 16px", marginBottom: 16,
        display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 240 }}>
          <label htmlFor="ab-scope" style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Lingkup kerja
          </label>
          <select
            id="ab-scope"
            value={scopeEfektif}
            onChange={(e) => setScopeId(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13 }}
          >
            {semuaScope.length === 0 && <option value="">— belum ada lingkup —</option>}
            {semuaScope.map((s) => (
              <option key={s.id} value={s.id}>
                {s.project?.name ? `${s.project.name} · ` : ""}{s.scope_name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="ab-tanggal" style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Tanggal
          </label>
          <input
            id="ab-tanggal"
            type="date"
            value={tanggal}
            max={hariIni()}
            onChange={(e) => setTanggal(e.target.value)}
            style={{ padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13 }}
          />
        </div>

        <button
          onClick={() => setMuatUlangKe((n) => n + 1)}
          aria-label="Muat ulang absensi"
          style={{ padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: C.mid }}>
          <CalendarDays size={14} aria-hidden="true" style={{ color: C.navy }} />
          <span>{tanggalPanjang(tanggal)}</span>
        </div>
      </div>

      {/* ── Ringkasan hari ini ────────────────────────────────────────── */}
      {workers.length > 0 && (
        <div className="rise rise-2b" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {[
            { label: "Pekerja terdaftar", nilai: String(workers.length), sub: "di daftar tukang", tegang: false },
            {
              label: "Sudah dijawab",
              nilai: `${terisi} / ${workers.length}`,
              sub: belumDijawab === 0 ? "lengkap" : `${belumDijawab} belum`,
              // Ditandai selama BELUM lengkap. Kartu yang selalu netral tak
              // memberi tahu apa pun; yang menuntut tindakan harus terlihat
              // menuntut.
              tegang: belumDijawab > 0,
            },
            { label: "Total hari kerja", nilai: totalHari.toFixed(1).replace(/\.0$/, ""), sub: "hari · tanggal ini", tegang: false },
          ].map((k) => (
            <div key={k.label} style={{
              ...kartu, padding: "10px 14px", flex: "1 1 180px", minWidth: 160,
              ...(k.tegang ? { borderColor: C.yellowBorder, background: C.yellowBg } : null),
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.tegang ? C.yellow : C.text, fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{k.nilai}</div>
              <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {pesan && (
        <div role="status" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${pesan.ok ? C.greenBorder : C.redBorder}`,
          background: pesan.ok ? C.greenBg : C.redBg,
          color: pesan.ok ? C.green : C.red,
        }}>
          {pesan.teks}
        </div>
      )}

      {/* ── Daftar pekerja ────────────────────────────────────────────── */}
      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : semuaScope.length === 0 ? (
        <Kosong
          ikon={<Users size={28} />}
          judul="Belum ada lingkup kerja"
          sebab={
            <>
              Absensi dicatat per lingkup kerja, karena upah harian berbeda
              antar lingkup (tukang batu dan pembantu tak sama). Tugaskan mandor
              ke proyek lebih dulu lewat halaman detail proyek.
            </>
          }
        />
      ) : workers.length === 0 ? (
        <Kosong
          ikon={<Users size={28} />}
          judul="Belum ada pekerja terdaftar"
          sebab={
            <>
              Absensi diisi per pekerja. Selama daftar tukang kosong, tak ada
              yang bisa diabsen — dan laporan upah kembali disusun dari ingatan.
              Tambahkan pekerja di tab Daftar Tukang halaman Mandor.
            </>
          }
        />
      ) : (
        <div className="rise rise-3" style={{ ...kartu, overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "var(--pad-baris)", borderBottom: `1px solid ${C.border}`, gap: 10, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
              {scopeAktif?.scope_name ?? "Lingkup"} — {workers.length} pekerja
            </span>
            {bolehIsi && (
              <button
                onClick={isiSisaPenuh}
                style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.border}`, background: "var(--surface)", color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <CheckCheck size={13} aria-hidden="true" /> Isi sisanya “Penuh”
              </button>
            )}
          </div>

          {/* SENGAJA tabel mentah. Ini FORMULIR dalam bentuk tabel, bukan tabel
              data: tiap sel porsi berisi tombol ber-`aria-pressed` dan ber-status
              `disabled` yang menulis langsung ke absensi hari itu.

              `<Tabel>` bisa merendernya lewat `render()`, tapi yang ditukar
              bukan kerapian melainkan risiko: ini layar entri data yang dipakai
              mandor di lapangan, dan salah render satu status tombol berarti
              upah hari itu tercatat salah tanpa gejala.

              Jaminan a11y-nya tetap dipenuhi di sini: caption tersembunyi,
              `th scope="row"` di kolom nama, dan pembungkus `overflow-x`. */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <caption className="sr-only">
              Absensi {tanggalPanjang(tanggal)} pada lingkup {scopeAktif?.scope_name ?? "—"}:
              nama pekerja, porsi hari kerja, dan jam lembur masing-masing.
            </caption>
            <thead>
              <tr style={{ background: "var(--surface-subtle)" }}>
                <th scope="col" style={{ textAlign: "left", padding: "var(--pad-baris)", fontSize: "var(--t-mikro)", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pekerja</th>
                <th scope="col" style={{ textAlign: "left", padding: "var(--pad-baris)", fontSize: "var(--t-mikro)", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Kehadiran</th>
                <th scope="col" style={{ textAlign: "right", padding: "var(--pad-baris)", fontSize: "var(--t-mikro)", fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Lembur (jam)</th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                const nilai = absen[w.id];
                const belum = !nilai;
                return (
                  <tr key={w.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    {/* Penanda ada di SEL, bukan `<tr>`: `border-left` pada
                        baris tabel tak dirender andal saat `borderCollapse`.
                        Tanpa penanda, "belum diisi" dan "tidak hadir" terlihat
                        sama — dan hari yang terlewat baru ketahuan saat upahnya
                        kurang. Warna bukan satu-satunya pembeda: kata "belum
                        dijawab" ikut ditulis. */}
                    <th scope="row" style={{
                      textAlign: "left", padding: "var(--pad-baris)", fontWeight: 500, color: C.text,
                      borderLeft: `3px solid ${belum ? C.yellow : "transparent"}`,
                    }}>
                      {w.name}
                      {w.tipe && <span style={{ fontSize: 11, color: C.mid }}> · {w.tipe}</span>}
                      {belum && (
                        <span style={{ display: "block", fontSize: 11, color: C.yellow, fontWeight: 600, marginTop: 1 }}>
                          belum dijawab
                        </span>
                      )}
                    </th>
                    <td style={{ padding: "var(--pad-baris)" }}>
                      <div role="group" aria-label={`Kehadiran ${w.name}`} style={{ display: "flex", gap: 4 }}>
                        {PILIHAN.map((p) => {
                          const aktif = nilai?.porsi === p.nilai;
                          return (
                            <button
                              key={p.nilai}
                              type="button"
                              disabled={!bolehIsi}
                              aria-pressed={aktif}
                              onClick={() => setPorsi(w.id, p.nilai)}
                              style={{
                                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                border: `1px solid ${aktif ? C.navy : C.border}`,
                                background: aktif ? C.navy : "var(--surface)",
                                color: aktif ? "var(--on-navy)" : C.text,
                                cursor: bolehIsi ? "pointer" : "not-allowed",
                              }}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: "var(--pad-baris)", textAlign: "right" }}>
                      <input
                        type="number"
                        min={0} max={16} step={0.5}
                        disabled={!bolehIsi}
                        aria-label={`Jam lembur ${w.name}`}
                        value={nilai?.lembur ?? 0}
                        onChange={(e) => setLembur(w.id, Math.min(16, Math.max(0, Number(e.target.value) || 0)))}
                        style={{
                          width: 70, padding: "5px 8px", textAlign: "right", fontSize: 13,
                          borderRadius: 6, border: `1px solid ${C.border}`,
                          background: "var(--surface)", color: C.text,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {bolehIsi && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "12px 16px", borderTop: `1px solid ${C.border}`,
              background: "var(--surface-subtle)", flexWrap: "wrap",
            }}>
              {/* Tiga keadaan, bukan dua.
                  Versi pertama hanya membedakan "ada perubahan" dari "tidak",
                  sehingga halaman dengan NOL pekerja terjawab berbunyi "semua
                  perubahan tersimpan" — benar secara teknis, dan menyesatkan:
                  terbaca seperti pekerjaan hari itu sudah beres. Yang belum
                  dijawab harus disebut, karena itu yang menentukan apakah
                  upahnya nanti benar. */}
              <span style={{
                fontSize: 12,
                color: berubah.length > 0 ? C.yellow : belumDijawab > 0 ? C.yellow : C.green,
                fontWeight: berubah.length > 0 || belumDijawab > 0 ? 600 : 400,
              }}>
                {berubah.length > 0
                  ? `${berubah.length} perubahan belum tersimpan`
                  : belumDijawab > 0
                    ? `${belumDijawab} pekerja belum dijawab`
                    : "Lengkap — semua pekerja sudah dijawab"}
              </span>
              <button
                onClick={simpan}
                disabled={menyimpan || berubah.length === 0}
                style={{
                  padding: "8px 18px", borderRadius: 6, border: "none",
                  background: berubah.length > 0 ? C.navy : C.border,
                  color: berubah.length > 0 ? "var(--on-navy)" : C.mid,
                  fontSize: 13, fontWeight: 600,
                  cursor: menyimpan || berubah.length === 0 ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <Save size={14} aria-hidden="true" />
                {menyimpan ? "Menyimpan…" : "Simpan absensi"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
