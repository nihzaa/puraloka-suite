"use client";

/**
 * TEMPLATE WBS — kerangka pekerjaan yang dipakai ulang antar proyek.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG MENENTUKAN RANCANGANNYA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Diukur 2026-08-12: 13 dari 15 proyek punya NOL item RAB, dan 8 dari 16
 * kategori unik pada dua proyek yang terisi identik kata demi kata.
 *
 * 1. JUMLAH BARIS adalah angka utama tiap kartu. Template kosong terlihat
 *    sama persis dengan yang berisi 40 baris sampai seseorang membukanya —
 *    dan template kosong tak bisa diaktifkan.
 *
 * 2. STATUS menentukan apa yang bisa dilakukan, jadi ia yang menentukan
 *    tombol mana yang muncul. Draf boleh disunting; aktif hanya bisa
 *    diterapkan; superseded hanya riwayat.
 *
 * 3. KATALOG BERSAMA ditandai eksplisit. Ia tak bisa disunting siapa pun,
 *    dan tombol mati tanpa penjelasan terbaca sebagai kerusakan.
 *
 * 4. MENERAPKAN memberi tahu apa yang TIDAK ikut: harga dan volume. Tanpa
 *    kalimat itu, orang mengira anggarannya sudah jadi.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Network, RefreshCw, Plus, Copy, Check, Play, Archive, Layers, Users,
} from "lucide-react";
import { api, hasPermission } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import { Kosong, GAYA_KARTU } from "@/components/ui-dasar";
import { KepalaHalaman } from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";
import { Pilihan } from "@/components/pilihan";

type StatusTemplate = "draft" | "active" | "superseded";

interface Template {
  id: string;
  code: string;
  name: string;
  description: string | null;
  source: "standard" | "company" | "project";
  version_number: number;
  status: StatusTemplate;
  jumlahNode: number;
  milik_bersama: boolean;
}

interface Proyek {
  id: string;
  name: string;
}

const META: Record<StatusTemplate, { label: string; warna: string; bg: string; border: string }> = {
  active:     { label: "Aktif",       warna: "var(--success)",        bg: "var(--success-bg)",     border: "var(--success-border)" },
  draft:      { label: "Draf",        warna: "var(--warning-teks)",   bg: "var(--warning-bg)",     border: "var(--warning-border)" },
  superseded: { label: "Digantikan",  warna: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border)" },
};

const langganan = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};

export default function TemplateWbsPage() {
  const [pesan, setPesan] = useState<{ jenis: "ok" | "galat"; teks: string } | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [formBuat, setFormBuat] = useState<{ salinDari: Template | null } | null>(null);
  const [formTerap, setFormTerap] = useState<Template | null>(null);

  const bolehKelola = useSyncExternalStore(
    langganan, () => hasPermission("cecep:cbs:manage"), () => false);
  const bolehTerap = useSyncExternalStore(
    langganan, () => hasPermission("projects:edit"), () => false);

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    Dua `useData` menggantikan `Promise.all` + AbortController + putaran.
    Daftar proyek TETAP "gagal tak melumpuhkan": `useData` keduanya berdiri
    sendiri, dan galat proyek sengaja tak diperiksa — sama seperti versi
    lama yang menelannya lewat `.catch(() => null)`.
  */
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<{ template: Template[] }>("/api/v1/template-wbs");
  const { data: dataProyek, muatUlang: muatUlangProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");

  // `useMemo` (bukan turunan biasa): `daftar` masuk dependensi `useMemo`
  // `kelompok` di bawah, dan `[] !== []` tiap render membuatnya berjalan
  // ulang tanpa henti.
  const daftar = useMemo(() => data?.template ?? [], [data]);
  const proyek = dataProyek?.projects ?? [];

  const muat = useCallback(async () => {
    await Promise.all([muatUlang(), muatUlangProyek()]);
  }, [muatUlang, muatUlangProyek]);

  /*
    Galat MUAT dan galat AKSI (ubah status/simpan template) sengaja dipisah —
    `pesan` sudah menjalankan peran galat AKSI, jadi galat muat ditambahkan
    sebagai lapis terpisah supaya gagal mengubah status tidak menghapus pesan
    gagal memuat.
  */
  const galat = galatMuat ? "Gagal memuat template WBS." : "";

  useEffect(() => {
    if (!pesan) return;
    const t = setTimeout(() => setPesan(null), 6000);
    return () => clearTimeout(t);
  }, [pesan]);

  async function ubahStatus(t: Template, status: StatusTemplate) {
    setSibuk(t.id);
    setPesan(null);
    try {
      await api.patch(`/api/v1/template-wbs/${t.id}/status`, { status });
      setPesan({
        jenis: "ok",
        teks: status === "active"
          ? `${t.code} v${t.version_number} aktif — strukturnya kini terkunci, dan bisa diterapkan ke proyek baru.`
          : `${t.code} v${t.version_number} ditandai digantikan.`,
      });
      void muat();
    } catch (e) {
      setPesan({
        jenis: "galat",
        teks: (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal mengubah status template.",
      });
    } finally {
      setSibuk(null);
    }
  }

  const kelompok = useMemo(() => ({
    aktif: daftar.filter((t) => t.status === "active"),
    draf: daftar.filter((t) => t.status === "draft"),
    lama: daftar.filter((t) => t.status === "superseded"),
  }), [daftar]);

  return (
    <div style={{ width: "100%", padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
      <div className="rise" style={{
        marginBottom: "var(--gap-bagian)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start",
        gap: "var(--gap-bagian)", flexWrap: "wrap",
      }}>
        <KepalaHalaman
          judul="Template WBS"
          keterangan="Kerangka pekerjaan siap pakai untuk proyek baru — supaya struktur RAB tak diketik ulang tiap kali, dan tak ada pos yang terlewat dari ingatan."
          ikon={<Network size={19} />}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {bolehKelola && (
            <button
              type="button"
              onClick={() => setFormBuat({ salinDari: null })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", background: "var(--grad-aksen)", color: "var(--on-aksen)",
                cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Template baru
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

      {memuat ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat template…
        </div>
      ) : daftar.length === 0 ? (
        <Kosong
          ikon={<Network size={28} />}
          judul="Belum ada template WBS"
          sebab={
            <>
              Template menyimpan <strong>kerangka</strong> pekerjaan — bukan harganya. Sekali
              disusun, ia dipakai untuk proyek berikutnya tanpa mengetik ulang, dan tanpa
              risiko pos pekerjaan terlewat karena tak teringat.
            </>
          }
          aksi={bolehKelola ? (
            <button
              type="button" onClick={() => setFormBuat({ salinDari: null })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "var(--grad-aksen)", color: "var(--on-aksen)",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Plus size={14} aria-hidden="true" /> Susun template pertama
            </button>
          ) : undefined}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-bagian)" }}>
          <Bagian
            judul="Siap dipakai"
            keterangan="Strukturnya terkunci — bisa diterapkan ke proyek yang RAB-nya masih kosong."
            daftar={kelompok.aktif}
          >
            {(t) => (
              <KartuTemplate
                key={t.id} t={t} sibuk={sibuk === t.id}
                bolehKelola={bolehKelola} bolehTerap={bolehTerap}
                onSalin={() => setFormBuat({ salinDari: t })}
                onTerapkan={() => setFormTerap(t)}
                onAktifkan={() => void ubahStatus(t, "active")}
                onArsipkan={() => void ubahStatus(t, "superseded")}
              />
            )}
          </Bagian>

          <Bagian
            judul="Masih draf"
            keterangan="Boleh disunting. Aktifkan bila strukturnya sudah lengkap — sesudah aktif ia terkunci."
            daftar={kelompok.draf}
          >
            {(t) => (
              <KartuTemplate
                key={t.id} t={t} sibuk={sibuk === t.id}
                bolehKelola={bolehKelola} bolehTerap={bolehTerap}
                onSalin={() => setFormBuat({ salinDari: t })}
                onTerapkan={() => setFormTerap(t)}
                onAktifkan={() => void ubahStatus(t, "active")}
                onArsipkan={() => void ubahStatus(t, "superseded")}
              />
            )}
          </Bagian>

          <Bagian
            judul="Riwayat"
            keterangan="Digantikan versi yang lebih baru. Disimpan supaya proyek lama tetap bisa ditelusuri."
            daftar={kelompok.lama}
          >
            {(t) => (
              <KartuTemplate
                key={t.id} t={t} sibuk={sibuk === t.id}
                bolehKelola={bolehKelola} bolehTerap={bolehTerap}
                onSalin={() => setFormBuat({ salinDari: t })}
                onTerapkan={() => setFormTerap(t)}
                onAktifkan={() => void ubahStatus(t, "active")}
                onArsipkan={() => void ubahStatus(t, "superseded")}
              />
            )}
          </Bagian>
        </div>
      )}

      {formBuat && (
        <FormBuat
          salinDari={formBuat.salinDari}
          onTutup={() => setFormBuat(null)}
          onSelesai={(teks) => {
            setFormBuat(null);
            setPesan({ jenis: "ok", teks });
            void muat();
          }}
        />
      )}

      {formTerap && (
        <FormTerapkan
          template={formTerap}
          proyek={proyek}
          onTutup={() => setFormTerap(null)}
          onSelesai={(teks) => {
            setFormTerap(null);
            setPesan({ jenis: "ok", teks });
            void muat();
          }}
        />
      )}
    </div>
  );
}

function Bagian({ judul, keterangan, daftar, children }: {
  judul: string;
  keterangan: string;
  daftar: Template[];
  children: (t: Template) => React.ReactNode;
}) {
  if (daftar.length === 0) return null;
  return (
    <section>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: "0 0 3px" }}>
        {judul}{" "}
        <span style={{ color: C.muted, fontWeight: 500 }}>({daftar.length})</span>
      </h2>
      <p style={{ fontSize: 12, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
        {keterangan}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-grid)" }}>
        {daftar.map(children)}
      </div>
    </section>
  );
}

function KartuTemplate({ t, sibuk, bolehKelola, bolehTerap, onSalin, onTerapkan, onAktifkan, onArsipkan }: {
  t: Template;
  sibuk: boolean;
  bolehKelola: boolean;
  bolehTerap: boolean;
  onSalin: () => void;
  onTerapkan: () => void;
  onAktifkan: () => void;
  onArsipkan: () => void;
}) {
  const m = META[t.status];
  const kosong = t.jumlahNode === 0;

  return (
    <div style={{ ...GAYA_KARTU, overflow: "hidden", borderColor: m.border }}>
      <div style={{
        padding: "var(--pad-kartu-lega)", display: "flex",
        justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            {t.code}
            <span style={{ color: C.muted, fontWeight: 500 }}> v{t.version_number}</span>
            <span style={{
              marginInlineStart: 10, fontSize: "var(--t-kecil)", fontWeight: 700, color: m.warna,
              textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {m.label}
            </span>
            {t.milik_bersama && (
              <span style={{
                marginInlineStart: 8, display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: "var(--t-kecil)", color: C.mid, fontWeight: 500,
              }}>
                <Users size={11} aria-hidden="true" /> katalog bersama
              </span>
            )}
          </h3>
          <div style={{ fontSize: 13, color: C.text, marginTop: 4 }}>{t.name}</div>
          {t.description && (
            <div style={{ fontSize: 12, color: C.mid, marginTop: 3, lineHeight: 1.5 }}>
              {t.description}
            </div>
          )}
        </div>

        {/* Jumlah baris — angka yang menentukan apakah template ini berguna. */}
        <div style={{ textAlign: "right" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 15, fontWeight: 700,
            color: kosong ? "var(--warning-teks)" : C.text,
            fontVariantNumeric: "tabular-nums",
          }}>
            <Layers size={14} aria-hidden="true" />
            {t.jumlahNode}
          </div>
          <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 1 }}>
            baris struktur
          </div>
        </div>
      </div>

      {kosong && t.status === "draft" && (
        <div style={{
          padding: "8px 14px", background: "var(--warning-bg)",
          borderTop: `1px solid ${C.border}`,
          color: "var(--warning-teks)", fontSize: 12, lineHeight: 1.5,
        }}>
          Belum ada baris struktur — template kosong tak bisa diaktifkan, dan proyek yang
          dibuat darinya akan lahir dengan RAB kosong.
        </div>
      )}

      <div style={{
        padding: "var(--pad-kartu-lega)", borderTop: `1px solid ${C.border}`,
        display: "flex", gap: 8, flexWrap: "wrap",
      }}>
        {t.status === "active" && bolehTerap && (
          <TombolAksi ikon={<Play size={13} />} utama onKlik={onTerapkan} sibuk={sibuk}>
            Terapkan ke proyek
          </TombolAksi>
        )}
        {t.status === "draft" && bolehKelola && !t.milik_bersama && (
          <TombolAksi
            ikon={<Check size={13} />} utama={!kosong} onKlik={onAktifkan}
            sibuk={sibuk} mati={kosong}
            judul={kosong ? "Isi strukturnya lebih dulu" : undefined}
          >
            Aktifkan
          </TombolAksi>
        )}
        {bolehKelola && (
          <TombolAksi ikon={<Copy size={13} />} onKlik={onSalin} sibuk={sibuk}>
            Salin jadi template baru
          </TombolAksi>
        )}
        {t.status === "active" && bolehKelola && !t.milik_bersama && (
          <TombolAksi ikon={<Archive size={13} />} onKlik={onArsipkan} sibuk={sibuk}>
            Tandai digantikan
          </TombolAksi>
        )}
      </div>
    </div>
  );
}

function TombolAksi({ ikon, children, onKlik, sibuk, utama, mati, judul }: {
  ikon: React.ReactNode;
  children: React.ReactNode;
  onKlik: () => void;
  sibuk: boolean;
  utama?: boolean;
  mati?: boolean;
  judul?: string;
}) {
  const nonaktif = sibuk || mati;
  return (
    <button
      type="button" onClick={onKlik} disabled={nonaktif} title={judul}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "6px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: 600,
        border: utama ? "none" : `1px solid ${C.border}`,
        background: utama ? "var(--aksen)" : "var(--surface)",
        color: utama ? "var(--on-aksen)" : C.text,
        cursor: nonaktif ? "not-allowed" : "pointer",
        opacity: nonaktif ? 0.5 : 1,
      }}
    >
      {ikon}
      {children}
    </button>
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

function FormBuat({ salinDari, onTutup, onSelesai }: {
  salinDari: Template | null;
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [kode, setKode] = useState(salinDari ? `${salinDari.code}-BARU` : "");
  const [nama, setNama] = useState(salinDari ? `${salinDari.name} (salinan)` : "");
  const [keterangan, setKeterangan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  const boleh = kode.trim() !== "" && nama.trim() !== "";

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      const r = await api.post<{ template: { code: string; version_number: number }; node_tersalin: number }>(
        "/api/v1/template-wbs", {
          code: kode.trim(),
          name: nama.trim(),
          description: keterangan.trim() || null,
          salin_dari: salinDari?.id ?? null,
        });
      const t = r.data.template;
      onSelesai(
        `${t.code} v${t.version_number} dibuat sebagai draf`
        + (r.data.node_tersalin > 0
            ? ` dengan ${r.data.node_tersalin} baris struktur tersalin.`
            : ". Susun strukturnya, lalu aktifkan."),
      );
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal membuat template.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul={salinDari ? `Salin ${salinDari.code}` : "Template WBS baru"}
      keterangan={
        salinDari
          ? `${salinDari.jumlahNode} baris struktur akan disalin ke template baru. Yang lama tak berubah.`
          : "Template lahir sebagai draf — strukturnya bisa disusun dulu, dan baru terkunci setelah diaktifkan."
      }
      lebar={520}
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
            type="button" onClick={() => void kirim()} disabled={sibuk || !boleh}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || !boleh ? "not-allowed" : "pointer",
              opacity: sibuk || !boleh ? 0.5 : 1,
            }}
          >
            {sibuk ? "Menyimpan…" : salinDari ? "Salin" : "Buat draf"}
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
        <Label htmlFor="tpl-kode" wajib>Kode</Label>
        <input className="isian-fokus"
          id="tpl-kode" value={kode} onChange={(e) => setKode(e.target.value)}
          placeholder="cth: RUMAH-2LT"
          style={GAYA_ISIAN}
        />
        <div style={{ fontSize: "var(--t-kecil)", color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          Kode yang sama menghasilkan <strong>versi berikutnya</strong>, bukan galat — itulah
          cara merevisi template yang sudah aktif.
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="tpl-nama" wajib>Nama</Label>
        <input className="isian-fokus"
          id="tpl-nama" value={nama} onChange={(e) => setNama(e.target.value)}
          placeholder="cth: Rumah tinggal 2 lantai"
          style={GAYA_ISIAN}
        />
      </div>

      <div>
        <Label htmlFor="tpl-ket">Keterangan</Label>
        <textarea className="isian-fokus"
          id="tpl-ket" rows={2} value={keterangan} onChange={(e) => setKeterangan(e.target.value)}
          placeholder="cth: Untuk rumah tinggal dengan struktur beton, tanpa basement"
          style={{ ...GAYA_ISIAN, resize: "vertical" }}
        />
      </div>
    </DialogBersama>
  );
}

function FormTerapkan({ template, proyek, onTutup, onSelesai }: {
  template: Template;
  proyek: Proyek[];
  onTutup: () => void;
  onSelesai: (pesan: string) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      const r = await api.post<{ dibuat: number; pesan: string }>(
        `/api/v1/template-wbs/${template.id}/terapkan`, { project_id: projectId });
      onSelesai(r.data.pesan);
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menerapkan template.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul={`Terapkan ${template.code} v${template.version_number}`}
      keterangan={`${template.jumlahNode} baris struktur akan dibuat sebagai RAB proyek. Hanya proyek yang RAB-nya masih kosong yang bisa menerimanya.`}
      lebar={520}
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
            type="button" onClick={() => void kirim()} disabled={sibuk || projectId === ""}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--grad-aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || projectId === "" ? "not-allowed" : "pointer",
              opacity: sibuk || projectId === "" ? 0.5 : 1,
            }}
          >
            {sibuk ? "Menerapkan…" : "Terapkan"}
          </button>
        </>
      }
    >
      {galat && (
        <div role="alert" style={{
          marginBottom: 14, padding: "8px 12px", borderRadius: 6,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          color: "var(--danger)", fontSize: 12.5, lineHeight: 1.55,
        }}>
          {galat}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Label htmlFor="terap-proyek" wajib>Proyek tujuan</Label>
        <Pilihan
          id="terap-proyek" value={projectId} onChange={(e) => setProjectId(e.target.value)}
          style={GAYA_ISIAN}
        >
          <option value="">— pilih proyek —</option>
          {proyek.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Pilihan>
      </div>

      {/* Yang TIDAK ikut — disebut di depan, bukan sesudah orang mengira
          anggarannya sudah jadi. */}
      <div style={{
        padding: "10px 12px", borderRadius: 8,
        border: `1px solid ${C.border}`, background: "var(--surface-subtle)",
        color: C.mid, fontSize: 12.5, lineHeight: 1.6,
      }}>
        Yang dibuat hanya <strong>kerangkanya</strong>: nama pekerjaan dan susunannya.
        Harga satuan, volume, dan bobot <strong>tidak</strong> ikut — harga berubah tiap
        proyek, dan template yang membawa harga lama membuat anggaran baru lahir dengan
        angka tahun lalu.
      </div>
    </DialogBersama>
  );
}
