"use client";

/**
 * PENGATURAN → INGATAN ASISTEN
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA ORANG KE HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "apa saja yang bisa diingat" — melainkan **"asisten ini tahu apa
 * tentang perusahaan saya, dan bagaimana saya menghapusnya?"**
 *
 * Ingatan disisipkan langsung ke prompt setiap kali asisten menjawab. Tanpa
 * halaman ini, satu-satunya cara mengetahui isinya adalah bertanya kepada
 * asistennya sendiri — dan jawaban itu tak bisa diperiksa. Karena itu daftar
 * mendahului formulir: yang dicari orang saat membuka halaman ini adalah
 * ISINYA, bukan kotak tambah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA PENANDA DITAMPILKAN, TIDAK DISEMBUNYIKAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Tiap ingatan bisa menempel pada IZIN (siapa boleh tahu) dan/atau PROYEK
 * (untuk pekerjaan mana). Keduanya menentukan siapa yang akan melihatnya di
 * percakapan — dan itu satu-satunya hal yang benar-benar berbahaya kalau
 * salah.
 *
 * Menyembunyikannya di balik "lanjutan" berarti orang menyimpan catatan
 * bermargin tanpa izin apa pun, lalu menemukannya berbulan-bulan kemudian
 * saat mandor menyebut angka yang tak pernah ia lihat di layar mana pun.
 *
 * ── Warna (ARAH-VISUAL-2026 §3d: satu aksen per layar)
 *
 * Navy hanya untuk tombol simpan. Lencana lapis memakai warna netral —
 * "pribadi" dan "bersama" adalah KEADAAN, bukan peringatan.
 */

import { useCallback, useEffect, useState } from "react";
import { Brain, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { PanduanHalaman } from "@/components/panduan-halaman";
import { PilihanKartu } from "@/components/pilihan-kartu";
import { Pilihan } from "@/components/pilihan";

interface Ingatan {
  id: string;
  lapis: "pribadi" | "bersama";
  kunci: string;
  nilai: string;
  izin_minimum: string | null;
  project_id: string | null;
  diperbarui_pada: string;
}

interface Muatan {
  data: Ingatan[];
  boleh_kelola: boolean;
  batas: { kunci: number; nilai: number };
}

interface IzinKatalog {
  key: string;
  label: string;
  module: string;
}

interface Proyek {
  id: string;
  name: string;
}

export default function IngatanPage() {
  const bolehLihat = useIzin("ai:ingatan:lihat");

  const [menyimpan, setMenyimpan] = useState(false);
  const [menghapus, setMenghapus] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipe: "ok" | "salah"; pesan: string } | null>(null);

  // Formulir tambah
  const [lapis, setLapis] = useState<"pribadi" | "bersama">("pribadi");
  const [kunci, setKunci] = useState("");
  const [nilai, setNilai] = useState("");
  const [izinMin, setIzinMin] = useState("");
  const [projectId, setProjectId] = useState("");

  /*
    ── PINDAH KE LAPIS CACHE BERSAMA (F4-2), 2026-08-16

    `useData` menggantikan `ambil()` + dua fetch sekunder yang lama.
    Kegagalan MUAT tetap ditampilkan lewat `galat` (bukan dihapus diam-diam) —
    daftar kosong tak bisa dibedakan dari "asisten belum mengingat apa pun".
  */
  const { data: muatan, memuat, galat: galatMuat, muatUlang } = useData<Muatan>("/api/v1/ai/ingatan");
  const ambil = useCallback(async () => { await muatUlang(); }, [muatUlang]);
  const galat = galatMuat ? "Daftar ingatan tidak bisa dimuat." : null;

  // Katalog izin & proyek datang dari SERVER, tak dipaku di sini: daftar yang
  // disalin ke web akan basi diam-diam begitu katalognya bertambah.
  // Kegagalannya SENGAJA tak memunculkan galat merah — lihat catatan lama:
  // halaman ini tetap berguna tanpa keduanya (default `?? []` di bawah).
  const { data: dataIzinKatalog } = useData<{ data: IzinKatalog[] }>("/api/v1/ai/ingatan/izin-tersedia");
  const izinKatalog = dataIzinKatalog?.data ?? [];
  const { data: dataProyek } = useData<{ data?: Proyek[]; projects?: Proyek[] }>("/api/v1/projects");
  const proyek = dataProyek?.data ?? dataProyek?.projects ?? [];

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const bolehKelola = muatan?.boleh_kelola ?? false;
  const bisaSimpan = kunci.trim().length > 0 && nilai.trim().length > 0 && !menyimpan;

  async function simpan() {
    if (!bisaSimpan) return;
    setMenyimpan(true);
    try {
      await api.post("/api/v1/ai/ingatan", {
        kunci: kunci.trim(),
        nilai: nilai.trim(),
        lapis,
        // Ingatan pribadi tak memakai izin — server menolaknya 422, dan
        // mengirimnya dari sini hanya menghasilkan galat yang membingungkan.
        izin_minimum: lapis === "bersama" ? izinMin || null : null,
        project_id: projectId || null,
      });
      setKunci("");
      setNilai("");
      setIzinMin("");
      setProjectId("");
      await ambil();
      setToast({ tipe: "ok", pesan: "Ingatan tersimpan" });
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ tipe: "salah", pesan: p ?? "Gagal menyimpan ingatan" });
    } finally {
      setMenyimpan(false);
    }
  }

  async function hapus(i: Ingatan) {
    setMenghapus(i.id);
    try {
      await api.delete(`/api/v1/ai/ingatan/${i.id}`);
      await ambil();
      setToast({ tipe: "ok", pesan: `"${i.kunci}" dilupakan` });
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ tipe: "salah", pesan: p ?? "Gagal menghapus" });
    } finally {
      setMenghapus(null);
    }
  }

  if (!bolehLihat) {
    return (
      <div style={{ padding: "var(--pad-atas) var(--pad-x)", maxWidth: "var(--w-page)", margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Ingatan Asisten</h1>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
          Peran Anda belum memiliki izin untuk melihat ingatan asisten.
        </p>
      </div>
    );
  }

  const daftar = muatan?.data ?? [];
  const pribadi = daftar.filter((d) => d.lapis === "pribadi");
  const bersama = daftar.filter((d) => d.lapis === "bersama");

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-page)",
        margin: "0 auto",
      }}
    >
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 60,
            padding: "var(--pad-kartu)", borderRadius: 8, fontSize: 13,
            background: toast.tipe === "ok" ? "var(--success-bg)" : "var(--danger-bg)",
            color: toast.tipe === "ok" ? "var(--success)" : "var(--danger)",
            border: `1px solid ${toast.tipe === "ok" ? "var(--success)" : "var(--danger)"}`,
          }}
        >
          {toast.pesan}
        </div>
      )}

      <div style={{ marginBottom: "var(--gap-bagian)" }}>
        <KepalaHalaman
          judul="Ingatan Asisten"
          keterangan="Catatan yang diingat asisten di luar percakapan — dan siapa saja yang boleh melihatnya."
          ikon={<Brain size={19} />}
        />
      </div>

      <PanduanHalaman
        untuk={
          <>
            Asisten membawa catatan ini <strong>tiap kali menjawab</strong>. Yang tercantum di sini
            ikut dibaca modelnya, jadi halaman ini juga tempat Anda memeriksa — dan menghapus —
            apa yang ia ingat.
          </>
        }
        langkah={[
          { teks: "Periksa daftar di bawah: itulah yang asisten bawa ke tiap percakapan", selesai: daftar.length > 0 },
          { teks: "Catatan pribadi hanya Anda yang melihat; catatan bersama dibaca satu perusahaan" },
          { teks: "Beri penanda izin untuk catatan yang tak semua orang boleh tahu" },
        ]}
        catatan="Asisten juga bisa MENGUSULKAN catatan dari percakapan, tetapi usulannya baru tersimpan setelah Anda menekan tombol konfirmasi — ia tak pernah mencatat sendiri."
      />

      {/* ── Daftar mendahului formulir ────────────────────────────────────
          Yang dicari orang saat membuka halaman ini adalah ISINYA, bukan
          kotak tambah. */}
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: "0 0 12px" }}>
          Yang diingat sekarang
        </h2>

        {memuat ? (
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Memuat…</p>
        ) : galat ? (
          <p style={{ fontSize: 13, color: C.danger, margin: 0 }}>{galat}</p>
        ) : daftar.length === 0 ? (
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, margin: 0, maxWidth: "60ch" }}>
            Belum ada catatan. Asisten tetap mengingat percakapan yang sedang berjalan —
            yang di sini adalah catatan yang bertahan <strong>lintas</strong> percakapan.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {[
              { judul: "Pribadi — hanya Anda", isi: pribadi },
              { judul: "Bersama — satu perusahaan", isi: bersama },
            ].map((grup) =>
              grup.isi.length === 0 ? null : (
                <div key={grup.judul}>
                  <p style={{ fontSize: "var(--t-kecil)", fontWeight: 550, color: C.mid, margin: "0 0 8px" }}>
                    {grup.judul} <span style={{ color: C.muted, fontWeight: 400 }}>({grup.isi.length})</span>
                  </p>
                  <div style={{ display: "grid", gap: 6 }}>
                    {grup.isi.map((i) => {
                      const bolehHapus = i.lapis === "pribadi" || bolehKelola;
                      const namaProyek = proyek.find((p) => p.id === i.project_id)?.name;
                      return (
                        <div
                          key={i.id}
                          style={{
                            display: "flex", alignItems: "flex-start", gap: 10,
                            padding: "10px 12px", borderRadius: "var(--radius-sm, 10px)",
                            border: `1px solid ${C.border}`, background: "var(--surface)",
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                              {i.kunci}
                            </span>
                            <span style={{ display: "block", fontSize: 12.5, color: C.mid, lineHeight: 1.55, marginTop: 2 }}>
                              {i.nilai}
                            </span>
                            {/* Penanda DITAMPILKAN — merekalah yang menentukan
                                siapa melihat catatan ini di percakapan. */}
                            {(i.izin_minimum || i.project_id) && (
                              <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                                {i.izin_minimum && (
                                  <span style={{ fontSize: "var(--t-kecil)", color: C.mid, background: "var(--surface-subtle)", padding: "2px 7px", borderRadius: 999 }}>
                                    hanya yang punya izin <code>{i.izin_minimum}</code>
                                  </span>
                                )}
                                {i.project_id && (
                                  <span style={{ fontSize: "var(--t-kecil)", color: C.mid, background: "var(--surface-subtle)", padding: "2px 7px", borderRadius: 999 }}>
                                    proyek {namaProyek ?? i.project_id.slice(0, 8)}
                                  </span>
                                )}
                              </span>
                            )}
                          </div>
                          {bolehHapus && (
                            <button
                              type="button"
                              onClick={() => void hapus(i)}
                              disabled={menghapus === i.id}
                              aria-label={`Lupakan catatan ${i.kunci}`}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 5,
                                background: "none", border: `1px solid ${C.border}`,
                                borderRadius: 8, padding: "5px 9px", fontSize: "var(--t-kecil)",
                                color: C.mid, cursor: menghapus === i.id ? "wait" : "pointer",
                                flexShrink: 0,
                              }}
                            >
                              {menghapus === i.id
                                ? <Loader2 size={12} className="berputar" />
                                : <Trash2 size={12} />}
                              Lupakan
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      {/* ── Tambah ───────────────────────────────────────────────────────── */}
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: "0 0 14px" }}>
          Tambah catatan
        </h2>

        <PilihanKartu
          nama="lapis-ingatan"
          label="Siapa yang boleh melihat"
          nilai={lapis}
          onUbah={(v) => setLapis(v as "pribadi" | "bersama")}
          opsi={[
            {
              nilai: "pribadi",
              label: "Hanya saya",
              ringkas: "Catatan pribadi",
              detail: "Dipakai saat asisten menjawab Anda saja. Tak terbaca siapa pun, termasuk admin.",
            },
            {
              nilai: "bersama",
              label: "Satu perusahaan",
              ringkas: "Fakta pekerjaan",
              detail: bolehKelola
                ? "Dibaca semua orang yang berizin. Beri penanda di bawah kalau tak semua boleh tahu."
                : "Butuh izin Kelola ingatan asisten — peran Anda belum memilikinya.",
              terkunci: false,
            },
          ]}
        />

        <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
          <div>
            <label htmlFor="ingatan-kunci" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
              Nama catatan
            </label>
            <input
              className="isian-fokus"
              id="ingatan-kunci"
              value={kunci}
              maxLength={muatan?.batas.kunci ?? 80}
              placeholder="Mis. kebiasaan klien Cimahi"
              onChange={(e) => setKunci(e.target.value)}
              style={{ ...GAYA_ISIAN, maxWidth: 420 }}
            />
            <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "6px 0 0", maxWidth: "60ch" }}>
              Nama yang sama akan <strong>menimpa</strong> catatan lama, bukan menumpuk — supaya
              tak ada dua catatan yang saling membantah.
            </p>
          </div>

          <div>
            <label htmlFor="ingatan-nilai" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
              Isi catatan
            </label>
            <textarea
              className="isian-fokus"
              id="ingatan-nilai"
              rows={2}
              value={nilai}
              maxLength={muatan?.batas.nilai ?? 500}
              placeholder="Mis. minta laporan progres tiap Jumat sore, lewat WhatsApp."
              onChange={(e) => setNilai(e.target.value)}
              style={{ ...GAYA_ISIAN, resize: "vertical", lineHeight: 1.6 }}
            />
            <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "6px 0 0", maxWidth: "60ch" }}>
              Dikirim ulang tiap kali asisten menjawab — catatan panjang menambah biaya tiap
              pertanyaan.
            </p>
          </div>

          {/* Penanda hanya relevan untuk catatan bersama. Menampilkannya pada
              catatan pribadi berarti menawarkan pilihan yang server tolak. */}
          {lapis === "bersama" && (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <div>
                <label htmlFor="ingatan-izin" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                  Butuh izin khusus? <span style={{ fontWeight: 400, color: C.muted }}>(opsional)</span>
                </label>
                <Pilihan
                  className="isian-fokus"
                  id="ingatan-izin"
                  value={izinMin}
                  onChange={(e) => setIzinMin(e.target.value)}
                  style={{ ...GAYA_ISIAN }}
                >
                  <option value="">Semua orang boleh tahu</option>
                  {izinKatalog.map((z) => (
                    <option key={z.key} value={z.key}>
                      {z.label} ({z.key})
                    </option>
                  ))}
                </Pilihan>
                <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                  Yang tak punya izin ini tak akan pernah melihat catatannya — asisten diam
                  soal itu.
                </p>
              </div>

              <div>
                <label htmlFor="ingatan-proyek" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                  Khusus satu proyek? <span style={{ fontWeight: 400, color: C.muted }}>(opsional)</span>
                </label>
                <Pilihan
                  className="isian-fokus"
                  id="ingatan-proyek"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  style={{ ...GAYA_ISIAN }}
                >
                  <option value="">Berlaku lintas proyek</option>
                  {proyek.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Pilihan>
                <p style={{ fontSize: "var(--t-kecil)", color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                  Catatan berproyek hanya ikut saat proyek itu yang sedang dibicarakan.
                </p>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void simpan()}
          disabled={!bisaSimpan}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            padding: "9px 16px", borderRadius: 8, border: "none",
            fontSize: 13, fontWeight: 600,
            background: bisaSimpan ? C.navy : "var(--surface-subtle)",
            color: bisaSimpan ? C.onNavy : C.muted,
            cursor: bisaSimpan ? "pointer" : "default",
          }}
        >
          {menyimpan ? <Loader2 size={14} className="berputar" /> : null}
          Simpan catatan
        </button>
      </section>
    </div>
  );
}
