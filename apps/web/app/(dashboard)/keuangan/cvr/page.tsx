"use client";

/**
 * CVR — Cost Value Reconciliation per scope borongan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN, BUKAN TAB
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `ARAH-VISUAL-2026.md` §6a: *tab = sudut pandang berbeda atas data yang
 * sama; halaman = entitas berbeda*. Ujinya: "kalau saya kirim tautan ini ke
 * rekan, apa yang ia lihat?"
 *
 * CVR menjawab **"pekerjaan mana yang merugi"** — pertanyaan yang dikirim ke
 * orang lain ("lihat scope struktur Dago"), bukan sudut lain atas estimasi.
 * Jadi halaman, bersaudara dengan `/keuangan/profitabilitas`.
 *
 * ── Yang dijawab halaman ini
 *
 * "Pekerjaan mana yang biayanya sudah melampaui nilai yang terpasang?"
 *
 * Diukur pada data nyata 2026-08-08: "Renovasi Total" 70% selesai, nilai
 * terpasang Rp 98 juta, upah terpakai Rp 102 juta — **rugi Rp 4 juta**, dan
 * itu tenggelam di total proyek yang masih untung.
 *
 * ── Kenapa yang RUGI di atas
 *
 * Itu satu-satunya baris yang menuntut tindakan selagi pekerjaan berjalan.
 * Daftar yang mengurutkannya di bawah membuatnya tak pernah dibaca.
 *
 * ── Kenapa cakupannya dinyatakan besar-besar
 *
 * CVR ini **hanya upah borongan**. Material dan faktur supplier belum bisa
 * dipecah per pekerjaan (`work_scopes.rab_category_id` 0 dari 20). Pembaca
 * yang mengira ini mencakup seluruh biaya akan salah menyimpulkan, dan
 * salahnya di angka untung-rugi — tempat kesalahan paling mahal.
 */

import { useCallback, useEffect, useState } from "react";
import { Scale, TriangleAlert, Info } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { Tabel, type Kolom } from "@/components/dasar";

type Keadaan = "untung" | "rugi" | "impas" | "tanpa_biaya" | "belum_mulai" | "tak_berlaku";

interface BarisCvr {
  scope_id: string;
  scope_name: string;
  borongan: number;
  progress_pct: number;
  nilai_terpasang: number;
  terpakai: number;
  selisih: number;
  margin_pct: number | null;
  keadaan: Keadaan;
  jumlah_laporan: number;
}

interface HasilCvr {
  baris: BarisCvr[];
  total_nilai_terpasang: number;
  total_terpakai: number;
  total_selisih: number;
  /** Biaya scope HARIAN — tak bisa diadu dengan nilai terpasang. */
  terpakai_harian: number;
  jumlah_rugi: number;
  jumlah_tanpa_biaya: number;
  jumlah_tak_berlaku: number;
  meta: { cakupan: string; keterbatasan?: string; jumlah_scope: number };
}

interface Proyek { id: string; name: string }

const rp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);

/**
 * Arti tiap keadaan, dalam kalimat yang bisa ditampilkan apa adanya.
 *
 * Enam keadaan, bukan dua. `tanpa_biaya` dan `tak_berlaku` menuntut tindakan
 * yang sama sekali berbeda dari "untung", dan menyamakannya menyembunyikan
 * keduanya — yang pertama justru tanda bahaya.
 */
const ARTI: Record<Keadaan, { label: string; warna: string; bg: string; border: string; arti: string }> = {
  rugi: {
    label: "Rugi", warna: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger-border)",
    arti: "Biaya sudah melampaui nilai yang terpasang. Sisa pekerjaannya dikerjakan dari kantong sendiri.",
  },
  tanpa_biaya: {
    label: "Tanpa biaya", warna: "var(--warning-teks)", bg: "var(--warning-bg)", border: "var(--warning-border)",
    arti: "Pekerjaan berjalan tapi NOL upah tercatat. Selisihnya besar dan positif — dan itu justru mencurigakan: biayanya ada di suatu tempat yang tak terlihat laporan ini.",
  },
  impas: {
    label: "Impas", warna: "var(--info)", bg: "var(--info-bg)", border: "var(--info-border)",
    arti: "Biaya persis sama dengan nilai terpasang. Pada pekerjaan yang belum selesai ini BUKAN kabar baik: sisanya dikerjakan tanpa cadangan sama sekali.",
  },
  untung: {
    label: "Untung", warna: "var(--success)", bg: "var(--success-bg)", border: "var(--success-border)",
    arti: "Nilai terpasang masih di atas biaya.",
  },
  belum_mulai: {
    label: "Belum mulai", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Progres nol dan belum ada biaya.",
  },
  tak_berlaku: {
    label: "Harian", warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)",
    arti: "Scope harian tanpa nilai borongan — nilai terpasangnya tak bisa diturunkan dari progres, jadi CVR tak berlaku.",
  },
};

const KOLOM: Array<Kolom<BarisCvr>> = [
  {
    kunci: "scope", judul: "Pekerjaan", kepalaBaris: true,
    render: (b) => (
      <span style={{
        display: "block", paddingLeft: 9,
        borderLeft: b.keadaan === "rugi" || b.keadaan === "tanpa_biaya"
          ? `3px solid ${ARTI[b.keadaan].warna}`
          : "3px solid transparent",
      }}>
        {b.scope_name}
        <span style={{ display: "block", fontSize: 11, color: C.mid, marginTop: 2 }}>
          progres {b.progress_pct}%
          {b.jumlah_laporan > 0 && ` · ${b.jumlah_laporan} laporan upah`}
        </span>
      </span>
    ),
  },
  {
    kunci: "borongan", judul: "Nilai borongan", rata: "kanan",
    render: (b) => <span style={{ color: C.mid }}>{b.borongan > 0 ? rp(b.borongan) : "—"}</span>,
  },
  {
    kunci: "terpasang", judul: "Nilai terpasang", rata: "kanan",
    render: (b) => (
      <>
        {b.borongan > 0 ? rp(b.nilai_terpasang) : "—"}
        {b.borongan > 0 && (
          <span style={{ display: "block", fontSize: 10, color: C.muted }}>
            {b.progress_pct}% dari borongan
          </span>
        )}
      </>
    ),
  },
  {
    kunci: "terpakai", judul: "Biaya terpakai", rata: "kanan",
    render: (b) => <span>{rp(b.terpakai)}</span>,
  },
  {
    kunci: "selisih", judul: "Selisih", rata: "kanan",
    // NEGATIF dipertahankan dan diberi warna bahaya. Meratakannya ke nol
    // menghapus satu-satunya sinyal yang bisa ditindaklanjuti.
    render: (b) => (
      <span style={{ fontWeight: 700, color: b.selisih < 0 ? "var(--danger)" : C.text }}>
        {b.borongan > 0 ? rp(b.selisih) : "—"}
        {b.margin_pct !== null && (
          <span style={{
            display: "block", fontSize: 10, fontWeight: 600,
            color: b.margin_pct < 0 ? "var(--danger)" : C.muted,
          }}>
            {b.margin_pct.toFixed(1)}%
          </span>
        )}
      </span>
    ),
  },
  {
    kunci: "keadaan", judul: "Keadaan",
    render: (b) => {
      const m = ARTI[b.keadaan];
      // Keadaan sebagai KATA, bukan hanya warna — yang tak bisa membedakan
      // warna, dan pembaca layar, sama-sama butuh teksnya.
      return (
        <span title={m.arti} style={{
          display: "inline-block", padding: "2px 8px", borderRadius: 20,
          fontSize: 11, fontWeight: 600, whiteSpace: "nowrap",
          color: m.warna, background: m.bg, border: `1px solid ${m.border}`,
        }}>{m.label}</span>
      );
    },
  },
];

export default function CvrPage() {
  const [proyek, setProyek] = useState<Proyek[]>([]);
  const [projectId, setProjectId] = useState("");
  const [hasil, setHasil] = useState<HasilCvr | null>(null);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    const ac = makeAbortController();
    api.get<{ projects: Proyek[] }>("/api/v1/projects", { signal: ac.signal })
      .then((r) => setProyek(r.data.projects ?? []))
      .catch((e) => { if (e?.name !== "CanceledError") setGalat("Gagal memuat daftar proyek"); });
    return () => ac.abort();
  }, []);

  const muat = useCallback(async (pid: string) => {
    if (!pid) { setHasil(null); return; }
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<HasilCvr>(`/api/v1/projects/${pid}/cvr`);
      setHasil(r.data);
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat rekonsiliasi biaya");
      setHasil(null);
    } finally { setMemuat(false); }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: `muat()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  // Menunda satu microtask memindahkannya keluar dari fase render tanpa
  // menambah jeda yang terlihat.
  useEffect(() => { queueMicrotask(() => { void muat(projectId); }); }, [projectId, muat]);

  
  return (
    <div>
      <p style={{ fontSize: 13, color: C.mid, margin: "0 0 18px", maxWidth: "70ch", lineHeight: 1.55 }}>
        Biaya yang sudah keluar diadu dengan <strong>nilai yang sudah terpasang</strong> —
        bagian pekerjaan yang benar-benar jadi hak, bukan nilai kontrak penuh.
        Selisih negatif berarti pekerjaan itu sedang merugi <em>sekarang</em>,
        selagi masih bisa ditangani.
      </p>

      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "10px 14px", borderRadius: 8, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>
          {galat}
        </div>
      )}

      <div className="rise" style={{ ...GAYA_KARTU, padding: "12px 16px", marginBottom: 16, maxWidth: 420 }}>
        <label htmlFor="cvr-proyek" style={{
          fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
          marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Proyek</label>
        <select
          id="cvr-proyek" value={projectId} onChange={(e) => setProjectId(e.target.value)}
          style={{
            padding: "8px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
            background: "var(--surface)", color: C.text, fontSize: 13, width: "100%",
          }}
        >
          <option value="">— pilih proyek —</option>
          {proyek.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {!projectId ? (
        <Kosong
          ikon={<Scale size={28} />}
          judul="Pilih proyek dulu"
          sebab="Rekonsiliasi dihitung per proyek — tiap scope borongannya diadu dengan upah yang sudah terbayar."
        />
      ) : memuat ? (
        <div style={{ ...GAYA_KARTU, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>Memuat…</div>
      ) : hasil ? (
        <>
          {/* Cakupan dinyatakan SEBELUM angkanya, bukan sesudah.
              Pembaca yang mengira ini seluruh biaya proyek akan salah
              menyimpulkan, dan salahnya di angka untung-rugi. */}
          <div className="rise rise-2" style={{
            display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
            background: "var(--info-bg)", border: "1px solid var(--info-border)",
            borderRadius: 8, fontSize: 12.5, color: "var(--info)",
            marginBottom: 14, lineHeight: 1.55,
          }}>
            <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
            <span>
              Cakupan: <strong>{hasil.meta.cakupan}</strong>.
              {hasil.meta.keterbatasan && <> {hasil.meta.keterbatasan}</>}
            </span>
          </div>

          {hasil.baris.length === 0 ? (
            <Kosong
              ikon={<Scale size={28} />}
              judul="Belum ada scope borongan di proyek ini"
              sebab="Rekonsiliasi ini membandingkan nilai borongan dengan upah terbayar. Proyek yang seluruh mandornya bersistem harian belum bisa dinilai begini."
            />
          ) : (
            <>
              {/* Yang menuntut tindakan lebih dulu — bukan total yang menenangkan. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8, marginBottom: 16 }}>
                <div style={{ ...GAYA_KARTU, padding: "12px 14px",
                  borderColor: hasil.jumlah_rugi > 0 ? "var(--danger-border)" : C.border }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em", display: "flex",
                    alignItems: "center", gap: 5 }}>
                    {hasil.jumlah_rugi > 0 && (
                      <TriangleAlert size={12} style={{ color: "var(--danger)" }} aria-hidden="true" />
                    )}
                    Pekerjaan merugi
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4,
                    color: hasil.jumlah_rugi > 0 ? "var(--danger)" : C.text }}>
                    {hasil.jumlah_rugi}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    dari {hasil.meta.jumlah_scope} scope
                  </div>
                </div>

                <div style={{ ...GAYA_KARTU, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>Nilai terpasang</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: C.text }}>
                    {rp(hasil.total_nilai_terpasang)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    bagian yang sudah jadi hak
                  </div>
                </div>

                <div style={{ ...GAYA_KARTU, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>Biaya terpakai</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: C.text }}>
                    {rp(hasil.total_terpakai)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {/* Biaya harian DINYATAKAN, bukan dibuang diam-diam.
                        Tanpa ini, total biaya di layar ini berbeda dari
                        `/estimasi` untuk proyek yang sama, dan tak ada yang
                        bisa menjelaskan selisihnya. */}
                    upah borongan terbayar
                    {hasil.terpakai_harian > 0 && (
                      <> · <strong>{rp(hasil.terpakai_harian)}</strong> lagi di scope harian,
                      di luar hitungan ini</>
                    )}
                  </div>
                </div>

                <div style={{ ...GAYA_KARTU, padding: "12px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.muted,
                    textTransform: "uppercase", letterSpacing: "0.05em" }}>Selisih</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4,
                    color: hasil.total_selisih < 0 ? "var(--danger)" : C.text }}>
                    {rp(hasil.total_selisih)}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {/* Kalimat ini pernah BERBOHONG.
                    
                        Terlihat 2026-08-08: layar menampilkan "Selisih
                        −Rp 2.600.100" berwarna merah di sebelah keterangan
                        "seluruh pekerjaan di atas biayanya" — dua pernyataan
                        yang saling membantah.
                        
                        Sebabnya total mencampur scope harian (Rp 46,6 juta
                        biaya tanpa nilai terpasang) ke dalam selisih. Sudah
                        diperbaiki di `lib/cvr.ts`; kalimatnya pun kini
                        diturunkan dari ANGKANYA, bukan dari `jumlah_rugi`
                        saja. */}
                    {hasil.jumlah_rugi > 0
                      ? `${hasil.jumlah_rugi} pekerjaan merugi`
                      : hasil.total_selisih < 0
                        ? "total di bawah biaya meski tak ada satu pun pekerjaan merugi"
                        : "seluruh pekerjaan borongan di atas biayanya"}
                  </div>
                </div>
              </div>

              {hasil.jumlah_tanpa_biaya > 0 && (
                <div role="status" style={{
                  display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
                  background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
                  borderRadius: 8, fontSize: 12.5, color: "var(--warning-teks)",
                  marginBottom: 14, lineHeight: 1.55,
                }}>
                  <TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
                  <span>
                    <strong>{hasil.jumlah_tanpa_biaya} pekerjaan berjalan tanpa satu pun upah tercatat.</strong>{" "}
                    Selisihnya terlihat besar dan positif — dan itu justru yang mencurigakan:
                    biayanya ada di suatu tempat yang tak terbaca laporan ini.
                  </span>
                </div>
              )}

              <div className="rise rise-3" style={{ ...GAYA_KARTU, overflow: "hidden" }}>
                <Tabel<BarisCvr>
                  caption="Rekonsiliasi biaya per scope borongan: nilai borongan, nilai terpasang, biaya terpakai, dan selisihnya."
                  data={hasil.baris}
                  kunciBaris={(b) => b.scope_id}
                  kolom={KOLOM}
                />
                <p style={{ margin: 0, padding: "10px 14px", fontSize: 11.5, color: C.mid,
                  borderTop: `1px solid ${C.border}`, lineHeight: 1.55 }}>
                  Nilai terpasang = nilai borongan × progres. Membandingkan biaya
                  sampai hari ini dengan nilai kontrak PENUH membuat setiap pekerjaan
                  terlihat untung besar sampai hampir selesai — lalu tiba-tiba rugi
                  di akhir, saat sudah terlambat berbuat apa pun.
                  {hasil.jumlah_tak_berlaku > 0 && (
                    <> {hasil.jumlah_tak_berlaku} scope harian ditampilkan tanpa
                    perhitungan: nilai terpasangnya tak bisa diturunkan dari progres.</>
                  )}
                </p>
              </div>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
