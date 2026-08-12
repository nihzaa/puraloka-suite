"use client";

/**
 * CHECKLIST INSPEKSI — butir pemeriksaan satu permintaan inspeksi.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KOMPONEN INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Endpoint checklist hidup sejak G1d (migrasi 279, 17 test terhadap Postgres
 * nyata): `GET/POST /inspeksi/:id/checklist` dan `PATCH /checklist/:id`.
 *
 * Diukur 2026-08-12: **nol halaman memanggilnya**. Butirnya tersimpan dan
 * dijaga constraint, tetapi tak ada satu pun cara mengisinya dari layar —
 * jadi inspeksi diputuskan lolos/tidak lolos tanpa daftar yang diperiksa.
 *
 * ── TIGA keadaan, bukan dua
 *
 * `null` (belum diperiksa) ≠ `false` (tidak lolos). Menyamakannya membuat
 * butir yang belum dicek terhitung lolos — dan itulah yang membuat checklist
 * berhenti berarti. Aturan ini sudah ditegakkan basis; komponen ini
 * menampilkannya, bukan menerjemahkannya jadi dua keadaan.
 *
 * ── Butir GAGAL wajib beralasan
 *
 * Constraint `checklist_gagal_beralasan` menolak `lolos = false` tanpa
 * catatan. Tombolnya di sini menuntut alasan LEBIH DULU — supaya penolakan
 * basis tak datang sesudah orang mengira pekerjaannya selesai.
 */

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Circle, Plus, ListChecks } from "lucide-react";
import { api, makeAbortController } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { DialogBersama } from "@/components/dialog-bersama";

export interface ButirChecklist {
  id: string;
  urutan: number;
  butir: string;
  acuan: string | null;
  /** `null` = BELUM diperiksa. Bukan "tidak lolos". */
  lolos: boolean | null;
  catatan: string | null;
  diperiksa_pada: string | null;
  pemeriksa?: { id: string; name: string } | null;
}

interface Ringkasan {
  total: number;
  lolos: number;
  gagal: number;
  belum: number;
}

export function ChecklistInspeksi({ inspeksiId, bolehUbah, onBerubah }: {
  inspeksiId: string;
  bolehUbah: boolean;
  /** Dipanggil sesudah checklist berubah — layar induk memuat ulang statusnya. */
  onBerubah?: () => void;
}) {
  const [butir, setButir] = useState<ButirChecklist[]>([]);
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState("");
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [putaran, setPutaran] = useState(0);
  const [formTambah, setFormTambah] = useState(false);
  const [formGagal, setFormGagal] = useState<ButirChecklist | null>(null);

  const muat = useCallback((signal: AbortSignal) => {
    setMemuat(true);
    setGalat("");
    return api.get<{ butir: ButirChecklist[]; ringkasan: Ringkasan }>(
      `/api/v1/inspeksi/${inspeksiId}/checklist`, { signal })
      .then((r) => {
        setButir(r.data.butir ?? []);
        setRingkasan(r.data.ringkasan ?? null);
      })
      .catch((e) => {
        if ((e as { code?: string })?.code === "ERR_CANCELED") return;
        setGalat(
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error
            ?? "Gagal memuat checklist.",
        );
      })
      .finally(() => setMemuat(false));
  }, [inspeksiId]);

  useEffect(() => {
    const ac = makeAbortController();
    queueMicrotask(() => { void muat(ac.signal); });
    return () => ac.abort();
  }, [muat, putaran]);

  async function tandai(b: ButirChecklist, lolos: boolean | null, catatan?: string) {
    setSibuk(b.id);
    setGalat("");
    try {
      await api.patch(`/api/v1/checklist/${b.id}`, {
        lolos,
        ...(catatan !== undefined ? { catatan } : {}),
      });
      setPutaran((x) => x + 1);
      onBerubah?.();
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menyimpan hasil pemeriksaan.",
      );
    } finally {
      setSibuk(null);
    }
  }

  if (memuat) {
    return (
      <div style={{ padding: "14px 0", color: C.muted, fontSize: 12.5 }}>
        Memuat checklist…
      </div>
    );
  }

  return (
    <div>
      {galat && (
        <div role="alert" style={{
          marginBottom: 10, padding: "8px 12px", borderRadius: 6,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          color: "var(--danger)", fontSize: 12.5, lineHeight: 1.55,
        }}>
          {galat}
        </div>
      )}

      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 10, marginBottom: 10, flexWrap: "wrap",
      }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          fontSize: 12.5, color: C.mid,
        }}>
          <ListChecks size={14} aria-hidden="true" />
          {ringkasan && ringkasan.total > 0 ? (
            <span>
              <strong style={{ color: C.text }}>{ringkasan.lolos}</strong> lolos ·{" "}
              <strong style={{ color: ringkasan.gagal > 0 ? "var(--danger)" : C.text }}>
                {ringkasan.gagal}
              </strong>{" "}
              tidak lolos ·{" "}
              {/* Yang BELUM diperiksa disebut terpisah — ia bukan "lolos". */}
              <strong style={{ color: ringkasan.belum > 0 ? "var(--warning-teks)" : C.text }}>
                {ringkasan.belum}
              </strong>{" "}
              belum diperiksa
            </span>
          ) : (
            <span>Belum ada butir pemeriksaan</span>
          )}
        </div>

        {bolehUbah && (
          <button
            type="button" onClick={() => setFormTambah(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: `1px solid ${C.border}`, background: "var(--surface)",
              color: C.text, cursor: "pointer",
            }}
          >
            <Plus size={12} aria-hidden="true" /> Tambah butir
          </button>
        )}
      </div>

      {butir.length === 0 ? (
        <div style={{
          padding: "12px 14px", borderRadius: 8,
          border: `1px dashed ${C.border}`, background: "var(--surface-subtle)",
          fontSize: 12.5, color: C.muted, lineHeight: 1.6,
        }}>
          Inspeksi tanpa butir pemeriksaan diputuskan lolos atau tidak lolos berdasarkan
          ingatan pemeriksanya. Tambahkan butir yang harus dicek — beserta acuannya, bila
          ada standar yang mengikat.
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {butir.map((b, i) => (
            <li key={b.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "9px 0",
              borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
            }}>
              <StatusButir lolos={b.lolos} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                  {b.butir}
                </div>
                {b.acuan && (
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                    Acuan: {b.acuan}
                  </div>
                )}
                {b.catatan && (
                  <div style={{
                    fontSize: 12, marginTop: 3, lineHeight: 1.5,
                    color: b.lolos === false ? "var(--danger)" : C.mid,
                  }}>
                    {b.catatan}
                  </div>
                )}
                {b.pemeriksa?.name && b.diperiksa_pada && (
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {b.pemeriksa.name} · {b.diperiksa_pada.slice(0, 10)}
                  </div>
                )}
              </div>

              {bolehUbah && (
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <TombolTandai
                    aktif={b.lolos === true}
                    warna="var(--success)"
                    judul="Tandai lolos"
                    sibuk={sibuk === b.id}
                    onKlik={() => void tandai(b, true)}
                  >
                    <CheckCircle2 size={14} aria-hidden="true" />
                  </TombolTandai>
                  <TombolTandai
                    aktif={b.lolos === false}
                    warna="var(--danger)"
                    judul="Tandai tidak lolos (wajib beralasan)"
                    sibuk={sibuk === b.id}
                    onKlik={() => setFormGagal(b)}
                  >
                    <XCircle size={14} aria-hidden="true" />
                  </TombolTandai>
                  <TombolTandai
                    aktif={b.lolos === null}
                    warna={C.muted}
                    judul="Kembalikan ke belum diperiksa"
                    sibuk={sibuk === b.id}
                    onKlik={() => void tandai(b, null, "")}
                  >
                    <Circle size={14} aria-hidden="true" />
                  </TombolTandai>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {formTambah && (
        <FormTambahButir
          inspeksiId={inspeksiId}
          urutanBerikut={butir.length > 0 ? Math.max(...butir.map((x) => x.urutan)) + 1 : 1}
          onTutup={() => setFormTambah(false)}
          onSelesai={() => {
            setFormTambah(false);
            setPutaran((x) => x + 1);
            onBerubah?.();
          }}
        />
      )}

      {formGagal && (
        <FormTidakLolos
          butir={formGagal}
          onTutup={() => setFormGagal(null)}
          onKirim={async (alasan) => {
            await tandai(formGagal, false, alasan);
            setFormGagal(null);
          }}
        />
      )}
    </div>
  );
}

/** Tiga keadaan, tiga tampilan — `null` tak pernah terlihat seperti lolos. */
function StatusButir({ lolos }: { lolos: boolean | null }) {
  if (lolos === true) {
    return <CheckCircle2 size={16} aria-label="Lolos" style={{ color: "var(--success)", marginTop: 1, flexShrink: 0 }} />;
  }
  if (lolos === false) {
    return <XCircle size={16} aria-label="Tidak lolos" style={{ color: "var(--danger)", marginTop: 1, flexShrink: 0 }} />;
  }
  return <Circle size={16} aria-label="Belum diperiksa" style={{ color: C.muted, marginTop: 1, flexShrink: 0 }} />;
}

function TombolTandai({ aktif, warna, judul, sibuk, onKlik, children }: {
  aktif: boolean; warna: string; judul: string; sibuk: boolean;
  onKlik: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onKlik} disabled={sibuk} title={judul} aria-label={judul}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 7,
        border: `1px solid ${aktif ? warna : C.border}`,
        background: aktif ? "var(--surface-subtle)" : "var(--surface)",
        color: aktif ? warna : C.muted,
        cursor: sibuk ? "not-allowed" : "pointer", opacity: sibuk ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const GAYA_ISIAN: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 6,
  border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box",
  background: "var(--surface)", color: C.text,
};

function FormTambahButir({ inspeksiId, urutanBerikut, onTutup, onSelesai }: {
  inspeksiId: string;
  urutanBerikut: number;
  onTutup: () => void;
  onSelesai: () => void;
}) {
  const [butir, setButir] = useState("");
  const [acuan, setAcuan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState("");

  async function kirim() {
    setSibuk(true);
    setGalat("");
    try {
      await api.post(`/api/v1/inspeksi/${inspeksiId}/checklist`, {
        butir: butir.trim(),
        acuan: acuan.trim() || undefined,
        urutan: urutanBerikut,
      });
      onSelesai();
    } catch (e) {
      setGalat(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
          ?? "Gagal menambah butir.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul="Tambah butir pemeriksaan"
      keterangan="Satu butir satu hal yang dicek. Butir yang menggabungkan beberapa pemeriksaan tak bisa dijawab lolos atau tidak."
      lebar={470}
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
            type="button" onClick={() => void kirim()}
            disabled={sibuk || butir.trim() === ""}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--aksen)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || butir.trim() === "" ? "not-allowed" : "pointer",
              opacity: sibuk || butir.trim() === "" ? 0.5 : 1,
            }}
          >
            {sibuk ? "Menyimpan…" : "Tambah"}
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

      <label htmlFor="cl-butir" style={{
        display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4,
      }}>
        Butir yang diperiksa <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
      </label>
      <textarea
        id="cl-butir" rows={2} value={butir} onChange={(e) => setButir(e.target.value)}
        placeholder="cth: Selimut beton kolom minimal 40 mm di seluruh sisi"
        style={{ ...GAYA_ISIAN, resize: "vertical", marginBottom: 14 }}
      />

      <label htmlFor="cl-acuan" style={{
        display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4,
      }}>
        Acuan
      </label>
      <input
        id="cl-acuan" value={acuan} onChange={(e) => setAcuan(e.target.value)}
        placeholder="cth: SNI 2847:2019 pasal 20.6.1"
        style={GAYA_ISIAN}
      />
      <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
        Acuan membuat butir ini bisa diperdebatkan dengan standar, bukan dengan pendapat.
      </div>
    </DialogBersama>
  );
}

function FormTidakLolos({ butir, onTutup, onKirim }: {
  butir: ButirChecklist;
  onTutup: () => void;
  onKirim: (alasan: string) => Promise<void>;
}) {
  const [alasan, setAlasan] = useState(butir.catatan ?? "");
  const [sibuk, setSibuk] = useState(false);

  return (
    <DialogBersama
      terbuka
      onTutup={onTutup}
      judul="Tandai tidak lolos"
      keterangan="Butir yang gagal wajib beralasan — basis menolaknya tanpa itu, dan yang memperbaiki berhak tahu apa yang salah."
      lebar={470}
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
            type="button"
            onClick={() => {
              setSibuk(true);
              void onKirim(alasan.trim()).finally(() => setSibuk(false));
            }}
            disabled={sibuk || alasan.trim() === ""}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: "var(--danger)", color: "var(--on-aksen)", fontSize: 13, fontWeight: 600,
              cursor: sibuk || alasan.trim() === "" ? "not-allowed" : "pointer",
              opacity: sibuk || alasan.trim() === "" ? 0.5 : 1,
            }}
          >
            {sibuk ? "Menyimpan…" : "Tandai tidak lolos"}
          </button>
        </>
      }
    >
      <div style={{
        padding: "9px 12px", borderRadius: 7, marginBottom: 14,
        background: "var(--surface-subtle)", border: `1px solid ${C.border}`,
        fontSize: 12.5, color: C.text, lineHeight: 1.55,
      }}>
        {butir.butir}
        {butir.acuan && (
          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
            Acuan: {butir.acuan}
          </div>
        )}
      </div>

      <label htmlFor="cl-alasan" style={{
        display: "block", fontSize: 12, fontWeight: 500, color: C.mid, marginBottom: 4,
      }}>
        Apa yang tak sesuai{" "}
        <span style={{ color: "var(--danger)" }} aria-hidden="true">*</span>
      </label>
      <textarea
        id="cl-alasan" rows={4} value={alasan} onChange={(e) => setAlasan(e.target.value)}
        placeholder="cth: Selimut beton sisi timur terukur 25 mm, kurang 15 mm dari syarat"
        style={{ ...GAYA_ISIAN, resize: "vertical" }}
      />
    </DialogBersama>
  );
}
