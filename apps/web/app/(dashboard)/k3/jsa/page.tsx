"use client";

/**
 * JOB SAFETY ANALYSIS — analisa bahaya per JENIS pekerjaan.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA JSA BUKAN BAGIAN DARI IZIN KERJA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `izin_kerja` sudah punya kolom `pengendalian_risiko` — dan godaannya adalah
 * berhenti di situ. Keduanya menjawab pertanyaan berbeda:
 *
 *   izin kerja       pengendalian untuk PEKERJAAN INI, hari ini, lalu selesai
 *   JSA              analisa bahaya untuk JENIS pekerjaan, DIPAKAI ULANG
 *                    setiap kali jenis itu muncul lagi
 *
 * JSA yang ditulis ulang tiap izin akan berbeda-beda tiap kali — dan yang
 * berbeda-beda itu justru pengendalian yang menyelamatkan orang. Menyimpannya
 * sekali per jenis pekerjaan membuat pelajaran dari insiden bisa DIMASUKKAN
 * KEMBALI: satu perbaikan berlaku untuk semua izin berikutnya.
 *
 * Itulah sebabnya `insiden_k3.jsa_id` ada. Insiden yang tak menyebut JSA-nya
 * adalah pelajaran yang berhenti di satu kejadian.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SATU AKSEN (§3d): LANGKAH YANG MASIH TINGGI SESUDAH PENGENDALIAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Yang ditandai bukan bahaya berskor tinggi — hampir semua pekerjaan
 * konstruksi punya itu, dan menandai semuanya membuat halamannya berhenti
 * dibaca. Yang ditandai adalah langkah yang skornya MASIH tinggi SESUDAH
 * pengendalian diterapkan: di situlah pengendaliannya belum cukup.
 *
 * Langkah yang belum dinilai ulang TIDAK menggugurkan kelayakan — itu
 * kekurangan administrasi, bukan bahaya yang diketahui dan dibiarkan. Dua hal
 * itu menuntut tindakan berbeda, dan menyamakannya membuat yang serius
 * tenggelam di antara yang belum sempat diisi.
 */

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Plus, TriangleAlert, CircleCheck, ListChecks } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, JudulKartu, Tabel, Kosong, Rangka, Galat,
  Tombol, Lencana, Medan, gayaInput, type Kolom,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

interface Langkah {
  id: string;
  urutan: number;
  langkah: string;
  bahaya: string;
  pengendalian: string;
  apd_wajib: string | null;
  dampak: number;
  kemungkinan: number;
  skor: number;
  dampak_sisa: number | null;
  kemungkinan_sisa: number | null;
}

interface Jsa {
  id: string;
  kode: string | null;
  jenis_pekerjaan: string;
  uraian: string | null;
  disetujui_pada: string | null;
  berlaku: boolean;
  penyusun: { id: string; name: string } | null;
  langkah: Langkah[];
  ringkas: {
    langkah: number;
    skor_tertinggi: number | null;
    sisa_tinggi: number;
    belum_dinilai_ulang: number;
    layak: boolean | null;
    alasan: string[];
  };
}

const NAMA_BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tanggal = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${NAMA_BULAN[m - 1]} ${y}`;
};

/** Sama dengan register risiko (migrasi 291) — sengaja, supaya sebanding. */
function tingkatDari(skor: number): { label: string; nada: "netral" | "info" | "peringatan" | "bahaya" } {
  if (skor >= 15) return { label: "Ekstrem", nada: "bahaya" };
  if (skor >= 10) return { label: "Tinggi", nada: "peringatan" };
  if (skor >= 5) return { label: "Sedang", nada: "info" };
  return { label: "Rendah", nada: "netral" };
}

export default function JsaPage() {
  const [daftar, setDaftar] = useState<Jsa[]>([]);
  const [memuat, setMemuat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [terpilih, setTerpilih] = useState<string>("");

  const [tambah, setTambah] = useState(false);
  const [fJenis, setFJenis] = useState("");
  const [fKode, setFKode] = useState("");

  const [langkahUntuk, setLangkahUntuk] = useState<Jsa | null>(null);
  const [lLangkah, setLLangkah] = useState("");
  const [lBahaya, setLBahaya] = useState("");
  const [lPengendalian, setLPengendalian] = useState("");
  const [lApd, setLApd] = useState("");
  const [lDampak, setLDampak] = useState("3");
  const [lKemungkinan, setLKemungkinan] = useState("3");
  const [lDampakSisa, setLDampakSisa] = useState("");
  const [lKemungkinanSisa, setLKemungkinanSisa] = useState("");

  const [menyimpan, setMenyimpan] = useState(false);
  const [galatModal, setGalatModal] = useState<string | null>(null);

  const muat = useCallback(async (signal?: AbortSignal) => {
    setMemuat(true); setGalat(null);
    try {
      const r = await api.get<{ jsa: Jsa[] }>("/api/v1/k3/jsa", { signal });
      const d = r.data.jsa ?? [];
      setDaftar(d);
      setTerpilih((s) => s || d[0]?.id || "");
    } catch (e) {
      if ((e as { name?: string })?.name === "CanceledError") return;
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalat(m ?? "Gagal memuat JSA");
    } finally { setMemuat(false); }
  }, []);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat]);

  const simpanJsa = useCallback(async () => {
    if (!fJenis.trim()) { setGalatModal("Jenis pekerjaan wajib diisi"); return; }
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post("/api/v1/k3/jsa", {
        jenis_pekerjaan: fJenis.trim(),
        kode: fKode.trim() || null,
      });
      setTambah(false); setFJenis(""); setFKode("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah JSA");
    } finally { setMenyimpan(false); }
  }, [fJenis, fKode, muat]);

  const simpanLangkah = useCallback(async () => {
    if (!langkahUntuk) return;
    setMenyimpan(true); setGalatModal(null);
    try {
      await api.post(`/api/v1/k3/jsa/${langkahUntuk.id}/langkah`, {
        langkah: lLangkah.trim(),
        bahaya: lBahaya.trim(),
        pengendalian: lPengendalian.trim(),
        apd_wajib: lApd.trim() || null,
        dampak: lDampak,
        kemungkinan: lKemungkinan,
        urutan: (langkahUntuk.langkah?.length ?? 0) + 1,
        ...(lDampakSisa ? { dampak_sisa: lDampakSisa } : {}),
        ...(lKemungkinanSisa ? { kemungkinan_sisa: lKemungkinanSisa } : {}),
      });
      setLangkahUntuk(null);
      setLLangkah(""); setLBahaya(""); setLPengendalian(""); setLApd("");
      setLDampakSisa(""); setLKemungkinanSisa("");
      await muat();
    } catch (e) {
      const m = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setGalatModal(m ?? "Gagal menambah langkah");
    } finally { setMenyimpan(false); }
  }, [langkahUntuk, lLangkah, lBahaya, lPengendalian, lApd,
      lDampak, lKemungkinan, lDampakSisa, lKemungkinanSisa, muat]);

  const aktif = daftar.find((j) => j.id === terpilih) ?? null;

  const kolom: Array<Kolom<Langkah>> = [
    {
      kunci: "langkah", judul: "Langkah & bahaya", kepalaBaris: true,
      render: (l) => {
        const sisa = l.dampak_sisa != null && l.kemungkinan_sisa != null
          ? l.dampak_sisa * l.kemungkinan_sisa : null;
        const masihTinggi = sisa != null && sisa >= 10;
        return (
          <span style={{
            display: "block", paddingLeft: 9,
            // Pita HANYA untuk yang masih tinggi SESUDAH pengendalian —
            // bukan untuk bahaya berskor tinggi. Hampir semua pekerjaan
            // konstruksi punya bahaya berskor tinggi.
            borderLeft: masihTinggi ? "3px solid var(--danger)" : "3px solid transparent",
          }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{l.urutan}</span>
              <strong style={{ fontSize: 13, color: C.text }}>{l.langkah}</strong>
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 2, maxWidth: "56ch" }}>
              <strong style={{ color: C.mid }}>Bahaya:</strong> {l.bahaya}
            </span>
            <span style={{ display: "block", fontSize: 11.5, color: C.mid, marginTop: 1, maxWidth: "56ch" }}>
              <strong style={{ color: C.mid }}>Kendali:</strong> {l.pengendalian}
            </span>
            {l.apd_wajib && (
              <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 2 }}>
                APD: {l.apd_wajib}
              </span>
            )}
          </span>
        );
      },
    },
    {
      kunci: "skor", judul: "Risiko", rata: "kanan",
      render: (l) => {
        const sisa = l.dampak_sisa != null && l.kemungkinan_sisa != null
          ? l.dampak_sisa * l.kemungkinan_sisa : null;
        return (
          <span style={{ display: "block", fontVariantNumeric: "tabular-nums" }}>
            <span style={{
              display: "grid", gridTemplateColumns: "1fr 14px 22px",
              alignItems: "center", justifyItems: "end", gap: 3,
            }}>
              <strong style={{ fontSize: 15, color: C.text }}>{l.skor}</strong>
              {sisa !== null ? (
                <>
                  <span aria-hidden="true" style={{ color: C.muted, fontSize: 12 }}>→</span>
                  <strong style={{
                    fontSize: 15,
                    color: sisa < l.skor ? "var(--success)" : C.mid,
                  }}>{sisa}</strong>
                </>
              ) : (
                <><span aria-hidden="true" /><span aria-hidden="true" /></>
              )}
            </span>
            {/* Faktor KEDUA sisi disebut, bukan hanya yang awal.
                *
                * Terlihat di layar: baris "16 → 4" berfaktor "4×4" —
                * dua angka 4 yang artinya berbeda, dan pembacanya bisa
                * mengira 4×4 adalah asal angka 4 di sebelah kanan. */}
            <span style={{ display: "block", fontSize: 11, color: C.muted, marginTop: 1 }}>
              {l.dampak}×{l.kemungkinan}
              {sisa === null
                ? " · belum dinilai ulang"
                : ` → ${l.dampak_sisa}×${l.kemungkinan_sisa}`}
            </span>
          </span>
        );
      },
    },
    {
      kunci: "tingkat", judul: "Sesudah kendali",
      render: (l) => {
        const sisa = l.dampak_sisa != null && l.kemungkinan_sisa != null
          ? l.dampak_sisa * l.kemungkinan_sisa : null;
        if (sisa === null) return <Lencana nada="netral">Belum dinilai</Lencana>;
        const t = tingkatDari(sisa);
        return <Lencana nada={t.nada}>{t.label}</Lencana>;
      },
    },
  ];

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<ShieldAlert size={18} />}
        judul="Job Safety Analysis"
        keterangan={
          <>Analisa bahaya per <strong>jenis pekerjaan</strong>, bukan per izin.
          Disimpan sekali dan dipakai ulang — sehingga pelajaran dari insiden
          bisa dimasukkan kembali ke sini, dan berlaku untuk semua izin kerja
          berikutnya.</>
        }
        aksi={
          <Tombol jenis="utama" ikon={<Plus size={14} />}
            onClick={() => { setTambah(true); setGalatModal(null); }}>
            Susun JSA
          </Tombol>
        }
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muat()} />}

      {memuat ? (
        <Rangka tinggi={56} jumlah={3} />
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<ShieldAlert size={28} />}
          judul="Belum ada JSA tersusun"
          sebab="Mulai dari pekerjaan yang paling sering berulang dan paling berbahaya — bekerja di ketinggian, pekerjaan panas, dan galian dalam."
        />
      ) : (
        <>
          <Kartu pad="sedang">
            <label htmlFor="jsa-pilih" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Jenis pekerjaan</label>
            <select
              id="jsa-pilih" value={terpilih} onChange={(e) => setTerpilih(e.target.value)}
              style={{ ...gayaInput, maxWidth: 520 }}
            >
              {daftar.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.kode ? `${j.kode} — ` : ""}{j.jenis_pekerjaan}
                  {j.ringkas.sisa_tinggi > 0 ? " (perlu ditinjau)" : ""}
                </option>
              ))}
            </select>
          </Kartu>

          {/* ── SATU aksen: langkah yang masih tinggi sesudah kendali ─────── */}
          {aktif && aktif.ringkas.sisa_tinggi > 0 && (
            <div role="alert" style={{
              padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
              border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
              color: "var(--danger)",
            }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <TriangleAlert size={15} aria-hidden="true" />
                {aktif.ringkas.sisa_tinggi === 1
                  ? "1 langkah masih berisiko tinggi SESUDAH pengendalian"
                  : `${aktif.ringkas.sisa_tinggi} langkah masih berisiko tinggi SESUDAH pengendalian`}
              </strong>
              <span style={{ display: "block", fontSize: 12.5 }}>
                Pengendaliannya belum cukup — tambahkan kendali lain, atau ubah
                cara kerjanya. JSA ini belum layak jadi dasar izin kerja.
              </span>
            </div>
          )}

          {aktif && aktif.ringkas.sisa_tinggi === 0 && aktif.ringkas.belum_dinilai_ulang > 0 && (
            // Dibedakan dari yang di atas: ini kekurangan ADMINISTRASI, bukan
            // bahaya yang diketahui dan dibiarkan. Menyamakan keduanya membuat
            // yang serius tenggelam.
            <div role="status" style={{
              padding: "11px 16px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
              border: `1px solid ${C.border}`, background: "var(--surface-2)", color: C.mid,
            }}>
              {aktif.ringkas.belum_dinilai_ulang === 1
                ? "1 langkah belum dinilai ulang sesudah pengendalian"
                : `${aktif.ringkas.belum_dinilai_ulang} langkah belum dinilai ulang sesudah pengendalian`}
              {" — belum tentu berbahaya, hanya belum diperiksa apakah kendalinya menolong."}
            </div>
          )}

          <Kartu pad="rapat">
            <JudulKartu
              sub={aktif
                ? [
                    `${aktif.ringkas.langkah} langkah`,
                    aktif.ringkas.skor_tertinggi != null
                      ? `risiko tertinggi ${aktif.ringkas.skor_tertinggi}` : null,
                    aktif.disetujui_pada
                      ? `disetujui ${tanggal(aktif.disetujui_pada)}`
                      : "belum disetujui",
                  ].filter(Boolean).join(" · ")
                : undefined}
              aksi={
                aktif ? (
                  <Tombol kecil ikon={<Plus size={12} />}
                    onClick={() => { setLangkahUntuk(aktif); setGalatModal(null); }}>
                    Tambah langkah
                  </Tombol>
                ) : undefined
              }
            >
              {aktif?.jenis_pekerjaan ?? "JSA"}
            </JudulKartu>

            <Tabel
              berpermukaan              kolom={kolom}
              data={aktif?.langkah ?? []}
              kunciBaris={(x) => x.id}
              caption="Langkah pekerjaan beserta bahaya, pengendalian, dan risiko sesudah pengendalian"
              tandaiBaris={(x) => {
                const s = x.dampak_sisa != null && x.kemungkinan_sisa != null
                  ? x.dampak_sisa * x.kemungkinan_sisa : null;
                return s != null && s >= 10 ? "bahaya" : undefined;
              }}
              kosong={
                <Kosong
                  ikon={<ListChecks size={28} />}
                  judul="JSA ini belum punya langkah"
                  sebab="JSA tanpa langkah bukan JSA yang aman — ia JSA yang belum diisi, dan tak boleh jadi dasar izin kerja."
                />
              }
            />
          </Kartu>

          {aktif && aktif.ringkas.layak === true && (
            <p style={{
              fontSize: 12.5, color: "var(--success)", margin: 0,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <CircleCheck size={14} aria-hidden="true" />
              Seluruh langkah turun ke tingkat yang bisa diterima sesudah
              pengendalian — JSA ini layak jadi dasar izin kerja.
            </p>
          )}
        </>
      )}

      {/* ── Susun JSA ─────────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={tambah}
        judul="Susun JSA"
        keterangan="Satu JSA untuk satu JENIS pekerjaan — bukan untuk satu izin. Yang disusun sekali dipakai berulang, dan pelajaran dari insiden masuk kembali ke sini."
        onTutup={() => setTambah(false)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setTambah(false)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpanJsa()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan JSA"}
            </Tombol>
          </>
        }
      >
        {galatModal && (
          <div role="alert" style={{
            marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", lineHeight: 1.5,
          }}>{galatModal}</div>
        )}
        <Medan id="js-jenis" label="Jenis pekerjaan" wajib
          keterangan="Tulis sebagai JENIS yang berulang, bukan sebagai pekerjaan sekali jalan. “Bekerja di ketinggian di atas 1,8 m” — bukan “pasang atap rumah Bu Sari”."
          anak={
            <input id="js-jenis" value={fJenis}
              onChange={(e) => setFJenis(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="js-kode" label="Kode"
          anak={
            <input id="js-kode" value={fKode}
              onChange={(e) => setFKode(e.target.value)} style={gayaInput} />
          }
        />
      </DialogBersama>

      {/* ── Tambah langkah ────────────────────────────────────────────────── */}
      <DialogBersama
        terbuka={langkahUntuk != null}
        judul="Tambah langkah"
        keterangan="Langkah tanpa pengendalian adalah daftar bahaya, bukan analisa — dan daftar bahaya tanpa jawaban justru membuat orang berhenti membacanya."
        onTutup={() => setLangkahUntuk(null)}
        kaki={
          <>
            <Tombol jenis="hantu" onClick={() => setLangkahUntuk(null)} disabled={menyimpan}>
              Batal
            </Tombol>
            <Tombol jenis="utama" onClick={() => void simpanLangkah()} disabled={menyimpan}>
              {menyimpan ? "Menyimpan…" : "Simpan langkah"}
            </Tombol>
          </>
        }
      >
        {galatModal && (
          <div role="alert" style={{
            marginBottom: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12.5,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", lineHeight: 1.5,
          }}>{galatModal}</div>
        )}
        <Medan id="lk-langkah" label="Langkah pekerjaan" wajib
          anak={
            <input id="lk-langkah" value={lLangkah}
              onChange={(e) => setLLangkah(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="lk-bahaya" label="Bahaya" wajib
          keterangan="Apa yang bisa melukai orang pada langkah ini."
          anak={
            <input id="lk-bahaya" value={lBahaya}
              onChange={(e) => setLBahaya(e.target.value)} style={gayaInput} />
          }
        />
        <Medan id="lk-kendali" label="Pengendalian" wajib
          keterangan="Yang bisa dikerjakan dan diperiksa orang — bukan “hati-hati”."
          anak={
            <textarea id="lk-kendali" value={lPengendalian} rows={2}
              onChange={(e) => setLPengendalian(e.target.value)}
              style={{ ...gayaInput, resize: "vertical" }} />
          }
        />
        <Medan id="lk-apd" label="APD wajib"
          anak={
            <input id="lk-apd" value={lApd}
              onChange={(e) => setLApd(e.target.value)} style={gayaInput} />
          }
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <Medan id="lk-dampak" label="Dampak (1–5)"
              anak={
                <select id="lk-dampak" value={lDampak}
                  onChange={(e) => setLDampak(e.target.value)} style={gayaInput}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              }
            />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Medan id="lk-kemungkinan" label="Kemungkinan (1–5)"
              anak={
                <select id="lk-kemungkinan" value={lKemungkinan}
                  onChange={(e) => setLKemungkinan(e.target.value)} style={gayaInput}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              }
            />
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.mid, margin: "2px 0 10px", lineHeight: 1.5 }}>
          Di bawah ini: penilaian <strong>SESUDAH</strong> pengendalian
          diterapkan. Boleh dikosongkan — tetapi selama kosong, tak ada yang
          tahu apakah kendalinya menolong.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <Medan id="lk-dampak-sisa" label="Dampak sesudah"
              anak={
                <select id="lk-dampak-sisa" value={lDampakSisa}
                  onChange={(e) => setLDampakSisa(e.target.value)} style={gayaInput}>
                  <option value="">— belum dinilai —</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              }
            />
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <Medan id="lk-kemungkinan-sisa" label="Kemungkinan sesudah"
              anak={
                <select id="lk-kemungkinan-sisa" value={lKemungkinanSisa}
                  onChange={(e) => setLKemungkinanSisa(e.target.value)} style={gayaInput}>
                  <option value="">— belum dinilai —</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              }
            />
          </div>
        </div>
      </DialogBersama>
    </Halaman>
  );
}
