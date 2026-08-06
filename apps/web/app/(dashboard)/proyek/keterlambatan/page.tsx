"use client";

/**
 * ANALISA KETERLAMBATAN (F5 PEMBEDA)
 *
 * ── Yang dijawab halaman ini
 *
 * "Milestone ini telat 67 hari. Apakah sudah dimaafkan EOT? Berapa
 * paparannya kalau tidak?"
 *
 * ── Kenapa EOT ditampilkan sekolom dengan telat
 *
 * Keterlambatan yang sudah dimaafkan lewat EOT BUKAN keterlambatan.
 * Menampilkan "67 hari" tanpa menyebut EOT-nya adalah menuduh atas sesuatu
 * yang secara kontrak mungkin tak pernah terjadi.
 *
 * ── Kenapa "estimasi paparan", bukan "denda"
 *
 * Denda yang sah butuh berita acara dan sering dinegosiasikan. Menyebutnya
 * "denda" membuat angka perkiraan terbaca sebagai kewajiban yang sudah pasti.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Clock, FileCheck2, RefreshCw } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type Proyek = { id: string; name: string };

type Status =
  | "tepat_waktu" | "belum_jatuh_tempo" | "selesai_terlambat"
  | "berjalan_terlambat" | "dimaafkan_eot";

type Baris = {
  milestone_id: string;
  project_id: string;
  project_name: string;
  title: string;
  target_date: string;
  completed_at: string | null;
  telat_kotor: number;
  eot_hari: number;
  telat_efektif: number;
  status: Status;
  estimasi_paparan: number | null;
  kena_cap: boolean;
  masih_bertambah: boolean;
};

type Hasil = {
  baris: Baris[];
  jumlah_selesai_terlambat: number;
  jumlah_berjalan_terlambat: number;
  jumlah_dimaafkan_eot: number;
  jumlah_tepat_waktu: number;
  jumlah_belum_jatuh_tempo: number;
  telat_terparah: number;
  total_estimasi_paparan: number;
  jumlah_proyek_denda_mati: number;
};

/**
 * Label & warna per status.
 *
 * Kalimatnya menyebut APA YANG TERJADI, bukan nama kodenya —
 * "berjalan_terlambat" tak berarti apa pun bagi PM yang membuka layar ini.
 */
const STATUS_META: Record<Status, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  berjalan_terlambat: {
    label: "Masih berjalan, telat", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Belum selesai dan tenggat sudah lewat — angkanya masih bertambah tiap hari.",
  },
  selesai_terlambat: {
    label: "Selesai terlambat", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Sudah selesai, tapi melewati tenggat. Angkanya final, tinggal dinegosiasikan.",
  },
  dimaafkan_eot: {
    label: "Dimaafkan EOT", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Telat, tapi seluruhnya tertutup perpanjangan waktu yang sudah disetujui.",
  },
  belum_jatuh_tempo: {
    label: "Belum jatuh tempo", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Belum selesai, tapi tenggatnya juga belum lewat.",
  },
  tepat_waktu: {
    label: "Tepat waktu", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Selesai sebelum atau tepat pada tenggat.",
  },
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const tanggalTerbaca = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

export default function KeterlambatanPage() {
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [proyekId, setProyekId] = useState("");
  const [hasil, setHasil] = useState<Hasil | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [muatUlangKe, setMuatUlangKe] = useState(0);
  /**
   * Bawaan "perlu_tindakan", BUKAN "semua".
   *
   * Diukur pada data nyata: 39 milestone, dan 23 di antaranya tepat waktu
   * atau belum jatuh tempo — tak butuh tindakan apa pun. Menampilkan
   * semuanya membuat yang telat 67 hari berbagi ruang dengan yang beres,
   * dan pembacanya harus menyaring sendiri dengan mata.
   *
   * Yang beres tetap BISA dilihat lewat pilihan saringan — hanya tak lagi
   * jadi bawaan.
   */
  const [saring, setSaring] = useState<Status | "semua" | "perlu_tindakan">("perlu_tindakan");

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setProyek(r.data.projects ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar proyek"); })
      .finally(() => setMemuat(false));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    const url = proyekId
      ? `/api/v1/analisa-keterlambatan?project_id=${proyekId}`
      : "/api/v1/analisa-keterlambatan";
    api.get<Hasil>(url, { signal: ac.signal })
      .then((r) => setHasil(r.data))
      .catch((e) => {
        if (e?.name === "CanceledError") return;
        const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setGalat(m ?? "Gagal memuat analisa keterlambatan");
        setHasil(null);
      });
    return () => ac.abort();
  }, [proyekId, muatUlangKe]);

  const terlihat = useMemo(
    () => (hasil?.baris ?? []).filter((b) => {
      if (saring === "semua") return true;
      if (saring === "perlu_tindakan") {
        return b.status === "berjalan_terlambat" || b.status === "selesai_terlambat";
      }
      return b.status === saring;
    }),
    [hasil, saring],
  );

  // Apakah SELURUH baris punya paparan yang tak bisa dihitung? Kalau ya,
  // kolomnya cuma mengulang kalimat yang sama 39 kali — dan itu sudah
  // dinyatakan sekali di banner atas.
  const adaPaparanTerhitung = useMemo(
    () => (hasil?.baris ?? []).some((b) => b.estimasi_paparan !== null),
    [hasil],
  );

  /**
   * Kolom tabel — disusun di sini, bukan di JSX, karena satu di antaranya
   * MUNCUL BERSYARAT. Menyaring array kolom jauh lebih sulit salah daripada
   * versi lama yang menyisipkan `...(syarat ? [[...]] : [])` di `<thead>` DAN
   * `{syarat && <td>}` di `<tbody>`: dua tempat yang harus sepakat, dan kalau
   * tidak, seluruh baris bergeser satu kolom tanpa satu pun galat.
   */
  const kolom = useMemo<Array<Kolom<Baris>>>(() => {
    const daftar: Array<Kolom<Baris> | null> = [
      {
        kunci: "milestone", judul: "Milestone", kepalaBaris: true,
        render: (b) => {
          const meta = STATUS_META[b.status];
          const menonjol = b.status === "berjalan_terlambat" || b.status === "selesai_terlambat";
          return (
            // Pita kiri adalah isyarat "periksa ini". Ia digambar di dalam sel
            // (bukan lewat `borderLeft` sel seperti dulu) karena `Tabel`
            // memiliki gaya selnya sendiri — dan menempelkannya lewat prop
            // akan memaksa primitif bersama tahu soal status keterlambatan.
            <span style={{
              display: "block", paddingLeft: 9,
              borderLeft: menonjol ? `3px solid ${meta.warna}` : "3px solid transparent",
            }}>
              {b.title}
              <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 2 }}>
                {b.project_name}
              </span>
            </span>
          );
        },
      },
      {
        kunci: "tenggat", judul: "Tenggat",
        render: (b) => (
          <span style={{ color: C.mid, whiteSpace: "nowrap" }}>{tanggalTerbaca(b.target_date)}</span>
        ),
      },
      {
        kunci: "selesai", judul: "Selesai",
        render: (b) => (
          <span style={{ color: b.completed_at ? C.mid : C.muted, whiteSpace: "nowrap" }}>
            {b.completed_at ? tanggalTerbaca(b.completed_at) : "belum selesai"}
          </span>
        ),
      },
      {
        kunci: "telat", judul: "Telat", rata: "kanan",
        render: (b) => (
          <span style={{ color: C.mid }}>{b.telat_kotor === 0 ? "—" : `${b.telat_kotor} h`}</span>
        ),
      },
      {
        kunci: "eot", judul: "EOT", rata: "kanan",
        render: (b) => (
          <span style={{ color: b.eot_hari > 0 ? "var(--info)" : C.muted }}>
            {b.eot_hari === 0 ? "—" : `−${b.eot_hari} h`}
          </span>
        ),
      },
      {
        kunci: "telat_efektif", judul: "Telat efektif", rata: "kanan",
        render: (b) => (
          <span style={{
            fontWeight: 700,
            color: b.telat_efektif === 0 ? C.mid : STATUS_META[b.status].warna,
          }}>
            {b.telat_efektif === 0 ? "0" : `${b.telat_efektif} h`}
            {/* "Masih bertambah" ditulis sebagai KATA: angka yang masih
                tumbuh berbeda maknanya dari angka final. */}
            {b.masih_bertambah && (
              <span style={{ display: "block", fontSize: 10, fontWeight: 500, color: C.muted }}>
                masih bertambah
              </span>
            )}
          </span>
        ),
      },
      // Kolom paparan DIHILANGKAN kalau tak satu pun bisa dihitung — 39 baris
      // berbunyi "denda belum aktif" adalah kalimat yang sama diulang 39 kali,
      // dan banner di atas sudah menyatakannya sekali.
      adaPaparanTerhitung
        ? {
            kunci: "paparan", judul: "Estimasi paparan", rata: "kanan",
            render: (b) =>
              // null ≠ 0. null = "tak bisa dihitung" (denda belum aktif);
              // 0 = "sudah dihitung, hasilnya nol".
              b.estimasi_paparan === null ? (
                <span style={{ fontSize: 11, color: C.muted }}>denda belum aktif</span>
              ) : b.estimasi_paparan === 0 ? (
                <span style={{ color: C.mid }}>—</span>
              ) : (
                <>
                  {rupiah(b.estimasi_paparan)}
                  {b.kena_cap && (
                    <span style={{ display: "block", fontSize: 10, color: C.muted }}>
                      batas atas kontrak
                    </span>
                  )}
                </>
              ),
          }
        : null,
      {
        kunci: "status", judul: "Status",
        render: (b) => {
          const meta = STATUS_META[b.status];
          return (
            <span title={meta.arti} style={{
              display: "inline-block", padding: "2px 8px", borderRadius: 20,
              fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
              color: meta.warna, background: meta.bg, border: `1px solid ${meta.border}`,
            }}>
              {meta.label}
            </span>
          );
        },
      },
    ];
    return daftar.filter((k): k is Kolom<Baris> => k !== null);
  }, [adaPaparanTerhitung]);

  const kartu: React.CSSProperties = {
    background: "var(--surface)", border: `1px solid ${C.border}`,
    borderRadius: 10, boxShadow: "var(--naik-1)",
  };
  const labelGaya: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.05em",
  };

  return (
    <div style={{
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-luas)", margin: "0 auto",
    }}>
      <div className="rise" style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, color: C.text, margin: 0 }}>
          Analisa Keterlambatan
        </h1>
        <p style={{ fontSize: 13, color: C.mid, margin: "6px 0 0", maxWidth: "68ch", lineHeight: 1.55 }}>
          Tenggat milestone diadu dengan tanggal selesai, dikurangi perpanjangan
          waktu (EOT) yang sudah disetujui. Keterlambatan yang sudah dimaafkan
          EOT bukan keterlambatan — dan menuduhnya bisa dibantah dengan satu
          lembar surat.
        </p>
      </div>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.redBorder}`, background: C.redBg, color: C.red,
        }}>
          {galat}
        </div>
      )}

      <div className="rise rise-2" style={{
        ...kartu, padding: "12px 16px", marginBottom: 16,
        display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
          <label htmlFor="kt-proyek" style={labelGaya}>Proyek</label>
          <select
            id="kt-proyek" value={proyekId} onChange={(e) => setProyekId(e.target.value)}
            style={{
              padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.text, fontSize: 13,
            }}
          >
            <option value="">Semua proyek</option>
            {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <button
          type="button" onClick={() => setMuatUlangKe((n) => n + 1)}
          style={{
            padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.text, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>
      </div>

      {memuat ? (
        <div style={{ ...kartu, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : !hasil ? null : hasil.baris.length === 0 ? (
        <Kosong
          ikon={<CalendarClock size={28} />}
          judul="Belum ada milestone untuk dianalisa"
          sebab="Analisa keterlambatan membandingkan tenggat milestone dengan tanggal selesainya. Ia terisi sendiri begitu ada milestone bertenggat."
        />
      ) : (
        <>
          {/* ── Ringkasan ────────────────────────────────────────────── */}
          <div className="rise rise-2b" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              {
                label: "Masih berjalan, telat", nilai: hasil.jumlah_berjalan_terlambat,
                sub: "masih bertambah tiap hari", warna: "var(--danger)", Ikon: AlertTriangle,
              },
              {
                label: "Selesai terlambat", nilai: hasil.jumlah_selesai_terlambat,
                sub: "angkanya sudah final", warna: "var(--warning-teks)", Ikon: Clock,
              },
              {
                label: "Dimaafkan EOT", nilai: hasil.jumlah_dimaafkan_eot,
                sub: "tertutup perpanjangan waktu", warna: "var(--info)", Ikon: FileCheck2,
              },
              {
                label: "Telat terparah", nilai: `${hasil.telat_terparah} hari`,
                sub: "sesudah dikurangi EOT", warna: C.text, Ikon: CalendarClock,
              },
            ].map((k) => (
              <div key={k.label} style={{ ...kartu, padding: "10px 14px", flex: "1 1 190px", minWidth: 178 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <k.Ikon size={12} aria-hidden="true" style={{ color: k.warna }} />
                  <span style={labelGaya}>{k.label}</span>
                </div>
                <div style={{
                  fontSize: 20, fontWeight: 800, color: k.warna, marginTop: 3,
                  fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums",
                }}>
                  {k.nilai}
                </div>
                <div style={{ fontSize: 11, color: C.mid, marginTop: 2 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Denda mati DINYATAKAN. Tanpa ini, "paparan Rp0" terbaca sebagai
              "tak ada risiko" — padahal yang benar "tarifnya belum diisi". */}
          {hasil.jumlah_proyek_denda_mati > 0 && (
            <div role="status" style={{
              marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 12,
              border: `1px solid ${C.yellowBorder}`, background: C.yellowBg, color: C.text,
              display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.5,
            }}>
              <AlertTriangle size={14} aria-hidden="true" style={{ color: "var(--warning-teks)", flexShrink: 0, marginTop: 2 }} />
              <span>
                <strong>{hasil.jumlah_proyek_denda_mati} proyek punya milestone telat tapi
                denda keterlambatannya belum aktif</strong> — paparan rupiahnya tak bisa
                dihitung. Itu bukan berarti tak ada risiko; tarifnya yang belum diisi
                di pengaturan proyek.
              </span>
            </div>
          )}

          {/* ── Saringan status ──────────────────────────────────────── */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {([
              ["perlu_tindakan", `Perlu tindakan (${hasil.jumlah_berjalan_terlambat + hasil.jumlah_selesai_terlambat})`],
              ["semua", `Semua (${hasil.baris.length})`],
              ["berjalan_terlambat", `Masih berjalan (${hasil.jumlah_berjalan_terlambat})`],
              ["selesai_terlambat", `Selesai terlambat (${hasil.jumlah_selesai_terlambat})`],
              ["dimaafkan_eot", `Dimaafkan EOT (${hasil.jumlah_dimaafkan_eot})`],
              ["belum_jatuh_tempo", `Belum jatuh tempo (${hasil.jumlah_belum_jatuh_tempo})`],
              ["tepat_waktu", `Tepat waktu (${hasil.jumlah_tepat_waktu})`],
            ] as const).map(([k, label]) => {
              const aktif = saring === k;
              return (
                <button
                  key={k} type="button" aria-pressed={aktif}
                  onClick={() => setSaring(k as Status | "semua" | "perlu_tindakan")}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: aktif ? 700 : 500,
                    border: `1px solid ${aktif ? C.navy : C.border}`,
                    background: aktif ? C.navy : "var(--surface)",
                    color: aktif ? "var(--on-navy)" : C.mid,
                    cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* ── Tabel ────────────────────────────────────────────────── */}
          <div className="rise rise-3" style={{ ...kartu, overflow: "hidden" }}>
            {/* Dipindahkan ke <Tabel> 2026-08-07 (UI-0-4). Caption sr-only,
                kolom pertama <th scope="row">, tabular-nums, dan pembungkus
                overflow-x sekarang dijamin komponen — empat hal yang tabel
                mentah harus ingat sendiri setiap kali, dan yang riwayat repo
                ini tunjukkan TIDAK selalu diingat.

                Kolomnya disusun di `useMemo` di atas, bukan sebaris di sini:
                kolom "Estimasi paparan" muncul bersyarat, dan menyatukannya
                dalam SATU daftar menghapus kemungkinan kepala dan isi tabel
                tak sepakat berapa kolom yang ada.

                `minWidth: 820` sengaja dilepas, bukan lupa: komponen sudah
                membungkus dengan overflow-x, jadi gulir horizontalnya tetap
                ada tanpa memaksa lebar mati ke primitif bersama. */}
            <Tabel<Baris>
              caption="Analisa keterlambatan milestone: tenggat, tanggal selesai, hari telat kotor, perpanjangan waktu yang disetujui, telat efektif sesudah EOT, estimasi paparan rupiah, dan statusnya."
              data={terlihat}
              kunciBaris={(b) => b.milestone_id}
              kolom={kolom}
            />

            {terlihat.length === 0 && (
              <div style={{ padding: "28px 16px", textAlign: "center", fontSize: 13, color: C.mid }}>
                {saring === "perlu_tindakan"
                  ? "Tak ada milestone yang perlu ditindak — semuanya tepat waktu atau belum jatuh tempo."
                  : "Tidak ada milestone berstatus itu — pilih “Semua” untuk melihat seluruhnya."}
              </div>
            )}

            <p style={{
              margin: 0, padding: "10px 14px", borderTop: `1px solid ${C.border}`,
              background: "var(--surface-subtle)", fontSize: 11, color: C.mid, lineHeight: 1.55,
            }}>
              Telat efektif = telat kotor − EOT yang <strong>disetujui</strong> − masa
              tenggang. EOT yang masih diajukan tidak mengurangi apa pun: ia belum
              mengubah kewajiban. Angka rupiah adalah <strong>perkiraan paparan</strong>{" "}
              berdasarkan tarif kontrak, <strong>bukan tagihan</strong> — denda yang sah
              butuh berita acara dan sering dinegosiasikan.
              {hasil.total_estimasi_paparan > 0 && (
                <> Total paparan yang bisa dihitung: <strong>{rupiah(hasil.total_estimasi_paparan)}</strong>.</>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
