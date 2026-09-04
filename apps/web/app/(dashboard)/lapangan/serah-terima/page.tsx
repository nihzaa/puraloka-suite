"use client";

/**
 * SERAH TERIMA PHO/FHO — berita acara yang mencairkan retensi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MENENTUKAN RANCANGANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12: pencairan retensi memeriksa SALDO saja, dan 36 dari 40
 * punch item masih terbuka — termasuk satu proyek dengan 19 dari 19. Uang
 * jaminan mutu bisa cair penuh sementara sembilan belas cacat menunggu.
 *
 * 1. MASA PEMELIHARAAN adalah inti kartunya, bukan tanggal terbit. Pertanyaan
 *    pembacanya selalu "berapa lama lagi kami menanggung cacat" — dan
 *    jawabannya rentang, bukan titik.
 *
 * 2. CACAT TERBUKA SAAT TERBIT ditampilkan permanen, tak pernah dihitung
 *    ulang. Cacat akan diperbaiki sesudahnya; yang ditanyakan saat sengketa
 *    adalah berapa yang menggantung SAAT KAMI TANDA TANGAN.
 *
 * 3. PORSI RETENSI disebut angka. "PHO ditandatangani" tak memberi tahu
 *    berapa yang bisa cair; "50% boleh cair" memberi tahu.
 *
 * 4. PHO BERSYARAT tidak dilarang — ia praktik nyata. Melarangnya membuat
 *    orang menutup punch item massal supaya tombolnya menyala, dan daftar
 *    cacatnya berhenti berarti apa-apa.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ClipboardCheck, RefreshCw, PenLine, Check, X, CalendarClock, Plus, ShieldCheck,
} from "lucide-react";
import { api, hasPermission, makeAbortController } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { Pilihan } from "@/components/pilihan";

type Jenis = "pho" | "fho";
type Status = "draf" | "ditandatangani" | "dibatalkan";

interface BeritaAcara {
  id: string;
  jenis: Jenis;
  nomor: string;
  tanggal: string;
  lingkup_serah: string;
  catatan: string | null;
  catatan_cacat: string | null;
  masa_pemeliharaan_hari: number | null;
  punch_terbuka_saat_terbit: number;
  ttd_penyerah_url: string | null;
  ttd_penerima_url: string | null;
  status: Status;
  alasan_batal: string | null;
  project_id: string;
  work_scope_id: string | null;
  proyek?: { id: string; name: string } | null;
  scope?: { id: string; scope_name: string } | null;
  penerbit?: { id: string; name: string } | null;
  /** Diturunkan server saat baca — bukan disimpan. */
  akhir_pemeliharaan: string | null;
}

interface Proyek {
  id: string;
  name: string;
}

const META: Record<Status, { label: string; warna: string; bg: string; border: string }> = {
  draf:           { label: "Draf",           warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
  ditandatangani: { label: "Ditandatangani", warna: "var(--success)",        bg: "var(--success-bg)",     border: "var(--success-border)" },
  dibatalkan:     { label: "Dibatalkan",     warna: "var(--danger)",         bg: "var(--danger-bg)",      border: "var(--danger-border)" },
};

const JUDUL_JENIS: Record<Jenis, string> = {
  pho: "PHO — Serah Terima Pertama",
  fho: "FHO — Serah Terima Akhir",
};

const langganan = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

/** Sisa hari masa pemeliharaan. Negatif berarti sudah lewat. */
function sisaHari(akhir: string | null): number | null {
  if (!akhir) return null;
  const t = Date.parse(akhir);
  if (!Number.isFinite(t)) return null;
  const kini = new Date();
  kini.setHours(0, 0, 0, 0);
  return Math.round((t - kini.getTime()) / 86_400_000);
}

export default function SerahTerimaPage() {
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [formTerbuka, setFormTerbuka] = useState(false);

  const bolehKelola = useSyncExternalStore(
    langganan, () => hasPermission("serah_terima:kelola"), () => false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData` menggantikan `Promise.all` + `putaran` (penghitung yang
    dinaikkan untuk memicu efek muat ulang). `muatUlang()` melakukan hal yang
    sama secara langsung.

    Daftar proyek hanya untuk form — gagal memuatnya TIDAK melumpuhkan
    halaman, jadi galatnya sengaja tak ikut menggagalkan `galat` utama
    (perilaku `.catch(() => null)` versi sebelumnya dipertahankan lewat
    `galatProyek` yang tak pernah ditampilkan sebagai galat blocking).
  */
  const { data: dataBa, memuat: memuatBa, galat: galatMuatBa, muatUlang: muatUlangBa } =
    useData<{ serah_terima: BeritaAcara[] }>("/api/v1/serah-terima");
  const { data: dataProyek, muatUlang: muatUlangProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");

  // `useMemo`, bukan `?? []` biasa: turunan array yang masuk dependensi
  // `useMemo` lain (`urut`/`segeraBerakhir` di bawah) butuh referensi
  // stabil, kalau tidak ratchet exhaustive-deps merah setiap render.
  const daftar = useMemo(() => dataBa?.serah_terima ?? [], [dataBa]);
  const proyek = dataProyek?.projects ?? [];
  const memuat = memuatBa;
  const galat = galatMuatBa ? "Gagal memuat berita acara serah terima." : "";

  const muat = useCallback(async () => {
    await Promise.all([muatUlangBa(), muatUlangProyek()]);
  }, [muatUlangBa, muatUlangProyek]);

  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(null), 6000);
    return () => clearTimeout(t);
  }, [pesan]);

  async function kirim(id: string, body: Record<string, unknown>, sukses: string) {
    setSibuk(id);
    setPesan(null);
    try {
      const r = await api.patch<{ pesan?: string }>(`/api/v1/serah-terima/${id}/status`, body);
      // Pesan server dipakai kalau ada — ia yang tahu apa yang terbuka
      // sesudahnya ("sebagian retensi kini boleh cair").
      setPesan({ jenis: "ok", teks: r.data.pesan ?? sukses });
      void muatUlangBa();
    } catch (e) {
      setPesan({
        jenis: "galat",
        teks: (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal memproses berita acara.",
      });
    } finally {
      setSibuk(null);
    }
  }

  // Yang menunggu tindakan di atas; yang dibatalkan di bawah.
  const urut = useMemo(() => {
    const bobot: Record<Status, number> = { draf: 0, ditandatangani: 1, dibatalkan: 2 };
    return [...daftar].sort((a, b) =>
      bobot[a.status] - bobot[b.status] || b.tanggal.localeCompare(a.tanggal));
  }, [daftar]);

  // Masa pemeliharaan yang akan berakhir dalam 30 hari — inspeksi akhir perlu
  // dijadwalkan SEBELUM FHO, bukan sesudah tenggatnya lewat.
  const segeraBerakhir = daftar.filter((b) => {
    if (b.jenis !== "pho" || b.status !== "ditandatangani") return false;
    const s = sisaHari(b.akhir_pemeliharaan);
    return s !== null && s >= 0 && s <= 30;
  });

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Serah Terima (PHO/FHO)"
          keterangan="Berita acara serah terima pertama dan akhir — yang memulai masa pemeliharaan, dan yang mencairkan retensi."
          ikon={<ClipboardCheck size={19} />}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {bolehKelola && (
            <button
              type="button"
              onClick={() => setFormTerbuka(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)",
                cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Terbitkan berita acara
            </button>
          )}
          <button
            type="button"
            onClick={() => void muat()}
            disabled={memuat}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: memuat ? "default" : "pointer", opacity: memuat ? 0.5 : 1,
            }}
          >
            <RefreshCw size={14} aria-hidden="true" /> Muat ulang
          </button>
        </div>
      </div>

      {pesan && (
        <div role="alert" style={{
          ...GAYA_KARTU, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: pesan.jenis === "ok" ? "var(--success-border)" : "var(--danger-border)",
          background: pesan.jenis === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
          color: pesan.jenis === "ok" ? "var(--success)" : "var(--danger)",
          fontSize: 13, lineHeight: 1.55,
        }}>
          {pesan.teks}
        </div>
      )}

      {galat && (
        <div role="alert" style={{
          ...GAYA_KARTU, padding: "10px 14px", marginBottom: "var(--gap-bagian)",
          borderColor: "var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)", fontSize: 13,
        }}>
          {galat}
        </div>
      )}

      {segeraBerakhir.length > 0 && (
        <div style={{
          marginBottom: "var(--gap-bagian)", padding: "10px 14px", borderRadius: 8,
          background: "var(--warning-bg)", border: "1px solid var(--warning-border)",
          color: "var(--warning-teks)", fontSize: 13,
          display: "flex", alignItems: "flex-start", gap: 8, lineHeight: 1.55,
        }}>
          <CalendarClock size={15} aria-hidden="true" style={{ marginTop: 1, flexShrink: 0 }} />
          <span>
            Masa pemeliharaan <strong>{segeraBerakhir.length}</strong> proyek berakhir dalam
            30 hari. Jadwalkan inspeksi akhir sebelum FHO — sesudah FHO, cacat yang muncul
            bukan lagi tanggungan pelaksana.
          </span>
        </div>
      )}

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat berita acara…
        </div>
      ) : urut.length === 0 ? (
        <Kosong
          ikon={<ClipboardCheck size={28} />}
          judul="Belum ada berita acara serah terima"
          sebab={
            <>
              PHO memulai <strong>masa pemeliharaan</strong>; FHO mengakhirinya. Keduanya
              yang menentukan kapan retensi boleh cair — tanpa berita acara, uang jaminan
              tertahan, dan itu memang gunanya. Retensi yang bisa dilepas kapan saja bukan
              jaminan.
            </>
          }
          aksi={bolehKelola ? (
            <button
              type="button" onClick={() => setFormTerbuka(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--grad-aksen)", color: "var(--on-aksen)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Terbitkan PHO pertama
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
          {urut.map((b) => (
            <KartuBeritaAcara
              key={b.id}
              ba={b}
              bolehKelola={bolehKelola}
              sibuk={sibuk === b.id}
              onTtd={(pihak) => void kirim(b.id,
                { ttd_url: `ttd-${pihak}-${Date.now()}.png`, pihak },
                `Tanda tangan ${pihak} dibubuhkan pada ${b.nomor}.`)}
              onTandatangani={() => void kirim(b.id, { status: "ditandatangani" },
                `${b.nomor} ditandatangani kedua pihak.`)}
            />
          ))}
        </div>
      )}

      {formTerbuka && (
        <FormTerbitBa
          proyek={proyek}
          onTutup={() => setFormTerbuka(false)}
          onSelesai={(teks) => {
            setFormTerbuka(false);
            setPesan({ jenis: "ok", teks });
            void muatUlangBa();
          }}
        />
      )}
    </div>
  );
}

function KartuBeritaAcara({ ba: b, bolehKelola, sibuk, onTtd, onTandatangani }: {
  ba: BeritaAcara;
  bolehKelola: boolean;
  sibuk: boolean;
  onTtd: (pihak: "penyerah" | "penerima") => void;
  onTandatangani: () => void;
}) {
  const m = META[b.status];
  const lengkapTtd = !!b.ttd_penyerah_url && !!b.ttd_penerima_url;
  const sisa = sisaHari(b.akhir_pemeliharaan);

  return (
    <div style={{ ...GAYA_KARTU, overflow: "hidden", borderColor: m.border }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", borderBottom: `1px solid ${C.border}`,
        background: m.bg, display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {b.nomor}
            <span style={{
              marginInlineStart: 10, fontSize: 11.5, fontWeight: 700, color: m.warna,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {m.label}
            </span>
          </h3>
          <div style={{ fontSize: 13, color: C.text, marginTop: 5 }}>
            {JUDUL_JENIS[b.jenis]}
          </div>
          <div style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>
            {b.proyek?.name && <>{b.proyek.name} · </>}
            {b.scope?.scope_name && <>{b.scope.scope_name} · </>}
            {b.tanggal}
            {b.penerbit?.name && <> · diterbitkan {b.penerbit.name}</>}
          </div>
        </div>

        {/* Porsi retensi — angka, bukan hanya status. */}
        {b.status === "ditandatangani" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px", borderRadius: 999,
            background: "var(--success-bg)", border: "1px solid var(--success-border)",
            color: "var(--success)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            <ShieldCheck size={13} aria-hidden="true" />
            {b.jenis === "pho" ? "50% retensi terbuka" : "Retensi terbuka penuh"}
          </div>
        )}
      </div>

      <div style={{ padding: "var(--pad-kartu-lega)" }}>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, marginBottom: 12 }}>
          {b.lingkup_serah}
        </div>

        {/* Masa pemeliharaan — inti kartu untuk PHO. */}
        {b.jenis === "pho" && b.masa_pemeliharaan_hari !== null && (
          <div style={{
            padding: "10px 12px", borderRadius: 8, marginBottom: 12,
            border: `1px solid ${sisa !== null && sisa < 0 ? "var(--success-border)" : C.border}`,
            background: sisa !== null && sisa < 0 ? "var(--success-bg)" : "var(--surface-subtle)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 3 }}>
              Masa pemeliharaan {b.masa_pemeliharaan_hari} hari
            </div>
            <div style={{
              fontSize: 12.5,
              color: sisa !== null && sisa < 0 ? "var(--success)" : C.mid,
              lineHeight: 1.5,
            }}>
              {b.tanggal} — {b.akhir_pemeliharaan}
              {sisa === null ? null
                : sisa < 0
                  ? <> · <strong>berakhir {Math.abs(sisa)} hari lalu</strong> — FHO bisa diterbitkan</>
                  : sisa === 0
                    ? <> · <strong>berakhir hari ini</strong></>
                    : <> · sisa <strong>{sisa} hari</strong></>}
            </div>
          </div>
        )}

        {/* Cacat saat terbit — permanen, tak pernah dihitung ulang. */}
        {b.punch_terbuka_saat_terbit > 0 && (
          <div style={{
            padding: "10px 12px", borderRadius: 8, marginBottom: 12,
            border: "1px solid var(--warning-border)", background: "var(--warning-bg)",
            color: "var(--warning-teks)", fontSize: 12.5, lineHeight: 1.55,
          }}>
            <strong>{b.punch_terbuka_saat_terbit} temuan cacat masih terbuka</strong> saat
            berita acara ini ditandatangani — serah terima bersyarat.
            {b.catatan_cacat && (
              <div style={{ marginTop: 5, color: C.text }}>{b.catatan_cacat}</div>
            )}
          </div>
        )}

        {b.status === "dibatalkan" && b.alasan_batal && (
          <div style={{
            padding: "8px 12px", borderRadius: 8, marginBottom: 12,
            border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
            color: "var(--danger)", fontSize: 12.5,
          }}>
            Dibatalkan: {b.alasan_batal}
          </div>
        )}

        {b.catatan && (
          <div style={{ fontSize: 12.5, color: C.mid, marginBottom: 12, lineHeight: 1.55 }}>
            {b.catatan}
          </div>
        )}

        {/* Dua tanda tangan — yang menentukan berpindahnya tanggung jawab. */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`,
        }}>
          <BarisTtd
            label="Penyerah (pelaksana)"
            ada={!!b.ttd_penyerah_url}
            boleh={bolehKelola && b.status === "draf"}
            sibuk={sibuk}
            onKlik={() => onTtd("penyerah")}
          />
          <BarisTtd
            label="Penerima (pemberi kerja)"
            ada={!!b.ttd_penerima_url}
            boleh={bolehKelola && b.status === "draf"}
            sibuk={sibuk}
            onKlik={() => onTtd("penerima")}
          />
        </div>

        {bolehKelola && b.status === "draf" && (
          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              onClick={onTandatangani}
              disabled={sibuk || !lengkapTtd}
              title={lengkapTtd ? undefined : "Kedua pihak harus menandatangani lebih dulu"}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: lengkapTtd ? "var(--success)" : "var(--surface-subtle)",
                color: lengkapTtd ? "var(--on-aksen)" : C.muted,
                fontSize: 13, fontWeight: 600,
                cursor: sibuk || !lengkapTtd ? "not-allowed" : "pointer",
                opacity: sibuk ? 0.6 : 1,
              }}
            >
              {sibuk ? "Memproses…" : "Sahkan berita acara"}
            </button>
            {!lengkapTtd && (
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                Serah terima bertanda tangan satu pihak adalah pengumuman bahwa pekerjaan
                dianggap selesai, bukan perpindahan tanggung jawab.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BarisTtd({ label, ada, boleh, sibuk, onKlik }: {
  label: string; ada: boolean; boleh: boolean; sibuk: boolean; onKlik: () => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 4 }}>{label}</div>
      {ada ? (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          color: "var(--success)", fontSize: 12.5, fontWeight: 600,
        }}>
          <Check size={13} aria-hidden="true" /> Sudah menandatangani
        </div>
      ) : boleh ? (
        <button
          type="button" onClick={onKlik} disabled={sibuk}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
            border: `1px solid ${C.border}`, background: "var(--surface)",
            color: C.text, cursor: sibuk ? "not-allowed" : "pointer", opacity: sibuk ? 0.5 : 1,
          }}
        >
          <PenLine size={12} aria-hidden="true" /> Bubuhkan tanda tangan
        </button>
      ) : (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          color: C.muted, fontSize: 12,
        }}>
          <X size={12} aria-hidden="true" /> Belum menandatangani
        </div>
      )}
    </div>
  );
}

const GAYA_ISIAN: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 6,
  border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box",
  background: "var(--surface)", color: C.text,
};

function Label({ htmlFor, children, wajib }: {
  htmlFor: string; children: React.ReactNode; wajib?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} style={{
      display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4,
    }}>
      {children}
      {wajib && <span style={{ color: "var(--danger)" }} aria-hidden="true"> *</span>}
    </label>
  );
}

interface Kesiapan {
  kesiapan: { siap: boolean; punchTerbuka: number; punchTotal: number; sebab: string };
  retensi: { porsi_maks: number; sebab: string };
  sudah_ada: { pho: boolean; fho: boolean };
}

/**
 * Form terbit berita acara.
 *
 * Memuat KESIAPAN begitu proyek dipilih — jumlah cacat terbukanya muncul
 * sebelum orang mengisi sisanya, bukan sesudah menekan simpan. Ia tak pernah
 * menolak: PHO bersyarat sah, dan yang dilakukan adalah mencatat angkanya.
 */
function FormTerbitBa({ proyek, onTutup, onSelesai }: {
  proyek: Proyek[];
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [kesiapan, setKesiapan] = useState<Kesiapan | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const [isi, setIsi] = useState({
    project_id: "",
    jenis: "pho" as Jenis,
    tanggal: new Date().toISOString().slice(0, 10),
    lingkup_serah: "",
    masa_pemeliharaan_hari: "90",
    catatan: "",
    catatan_cacat: "",
  });
  const ubah = (k: keyof typeof isi, v: string) => setIsi((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!isi.project_id) { setKesiapan(null); return; }
    const ac = makeAbortController();
    queueMicrotask(() => {
      void api.get<Kesiapan>(`/api/v1/serah-terima/kesiapan/${isi.project_id}`, { signal: ac.signal })
        .then((r) => setKesiapan(r.data))
        .catch((e) => {
          if ((e as { code?: string })?.code === "ERR_CANCELED") return;
          setKesiapan(null);
        });
    });
    return () => ac.abort();
  }, [isi.project_id]);

  const bolehKirim = isi.project_id !== "" && isi.lingkup_serah.trim() !== "" && isi.tanggal !== "";

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      // Masa pemeliharaan hanya dikirim untuk PHO — rutenya menolak masa pada
      // FHO, dan mengirimnya berarti penolakan yang membingungkan.
      const r = await api.post<{ serah_terima: { nomor: string }; peringatan?: string }>(
        "/api/v1/serah-terima", {
          project_id: isi.project_id,
          jenis: isi.jenis,
          tanggal: isi.tanggal,
          lingkup_serah: isi.lingkup_serah.trim(),
          masa_pemeliharaan_hari: isi.jenis === "pho"
            ? (isi.masa_pemeliharaan_hari.trim() === "" ? null : Number(isi.masa_pemeliharaan_hari))
            : null,
          catatan: isi.catatan.trim() || null,
          catatan_cacat: isi.catatan_cacat.trim() || null,
        });
      const p = r.data.peringatan;
      onSelesai(
        `${r.data.serah_terima.nomor} tersimpan sebagai draf.`
        + (p ? ` ${p}` : " Bubuhkan kedua tanda tangan untuk mengesahkannya."),
      );
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menerbitkan berita acara.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul="Terbitkan berita acara serah terima"
      keterangan="PHO memulai masa pemeliharaan dan membuka sebagian retensi; FHO mengakhirinya dan membuka sisanya. Tersimpan sebagai draf lebih dulu."
      lebar={620}
      kaki={
        <>
          <button
            type="button" onClick={onTutup}
            style={{
              padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`,
              background: "var(--surface)", color: C.mid, fontSize: 13, cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button" onClick={() => void kirim()} disabled={sibuk || !bolehKirim}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || !bolehKirim ? "not-allowed" : "pointer",
              opacity: sibuk || !bolehKirim ? 0.5 : 1,
            }}
          >
            {sibuk ? "Menyimpan…" : "Simpan sebagai draf"}
          </button>
        </>
      }
    >
      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "8px 12px", borderRadius: 6,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          color: "var(--danger)", fontSize: 12.5, lineHeight: 1.5,
        }}>
          {galat}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="ba-proyek" wajib>Proyek</Label>
        <Pilihan
          id="ba-proyek" value={isi.project_id}
          onChange={(e) => ubah("project_id", e.target.value)}
          style={GAYA_ISIAN}
        >
          <option value="">— pilih proyek —</option>
          {proyek.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Pilihan>
      </div>

      {/* Kesiapan — muncul sebelum sisanya diisi, bukan sesudah ditolak. */}
      {kesiapan && (
        <div style={{
          padding: "10px 12px", borderRadius: 8, marginBottom: 14,
          border: `1px solid ${kesiapan.kesiapan.siap ? "var(--success-border)" : "var(--warning-border)"}`,
          background: kesiapan.kesiapan.siap ? "var(--success-bg)" : "var(--warning-bg)",
          color: kesiapan.kesiapan.siap ? "var(--success)" : "var(--warning-teks)",
          fontSize: 12.5, lineHeight: 1.55,
        }}>
          {kesiapan.kesiapan.sebab}
          {kesiapan.sudah_ada.pho && (
            <div style={{ marginTop: 5, color: C.text }}>
              Proyek ini sudah punya PHO. {kesiapan.sudah_ada.fho
                ? "FHO-nya juga sudah ada."
                : "FHO bisa diterbitkan setelah masa pemeliharaan berakhir."}
            </div>
          )}
        </div>
      )}

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 14, marginBottom: 14,
      }}>
        <div>
          <Label htmlFor="ba-jenis" wajib>Jenis</Label>
          <Pilihan
            id="ba-jenis" value={isi.jenis}
            onChange={(e) => ubah("jenis", e.target.value)}
            style={GAYA_ISIAN}
          >
            <option value="pho">PHO — serah terima pertama</option>
            <option value="fho">FHO — serah terima akhir</option>
          </Pilihan>
        </div>
        <div>
          <Label htmlFor="ba-tanggal" wajib>Tanggal</Label>
          <input className="isian-fokus"
            id="ba-tanggal" type="date" value={isi.tanggal}
            onChange={(e) => ubah("tanggal", e.target.value)}
            style={GAYA_ISIAN}
          />
        </div>
        {isi.jenis === "pho" && (
          <div>
            <Label htmlFor="ba-masa">Masa pemeliharaan (hari)</Label>
            <input className="isian-fokus"
              id="ba-masa" type="number" inputMode="numeric" min={0}
              value={isi.masa_pemeliharaan_hari}
              onChange={(e) => ubah("masa_pemeliharaan_hari", e.target.value)}
              style={GAYA_ISIAN}
            />
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="ba-lingkup" wajib>Lingkup yang diserahkan</Label>
        <textarea className="isian-fokus"
          id="ba-lingkup" rows={2} value={isi.lingkup_serah}
          onChange={(e) => ubah("lingkup_serah", e.target.value)}
          placeholder="cth: Seluruh pekerjaan struktur, arsitektur, dan MEP lantai 1–3"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>

      {/* Catatan cacat hanya relevan saat ADA cacat terbuka — itulah yang
          membedakan PHO bersyarat dari PHO yang mengabaikan cacat. */}
      {kesiapan && kesiapan.kesiapan.punchTerbuka > 0 && (
        <div style={{ marginBottom: 14 }}>
          <Label htmlFor="ba-cacat">Cacat yang disepakati diperbaiki</Label>
          <textarea className="isian-fokus"
            id="ba-cacat" rows={2} value={isi.catatan_cacat}
            onChange={(e) => ubah("catatan_cacat", e.target.value)}
            placeholder="cth: Retak rambut plafon ruang tamu dan bocor talang sisi timur, diperbaiki paling lambat 30 hari"
            style={{ ...GAYA_ISIAN, resize: "vertical" }}
          />
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
            {kesiapan.kesiapan.punchTerbuka} temuan masih terbuka. Jumlahnya tercatat permanen
            di berita acara ini — tuliskan yang disepakati diperbaiki supaya keduanya
            sepakat apa yang menggantung.
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="ba-catatan">Catatan</Label>
        <textarea className="isian-fokus"
          id="ba-catatan" rows={2} value={isi.catatan}
          onChange={(e) => ubah("catatan", e.target.value)}
          placeholder="cth: Dihadiri konsultan pengawas dan perwakilan pemilik"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>
    </DialogBersama>
  );
}
