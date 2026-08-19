"use client";

/**
 * MITRA — satu identitas, banyak peran, dua BENTUK.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LAYAR INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Founder menjawab R-017 pada 2026-08-19. Pertanyaan saya *"subkon itu
 * perusahaan ATAU orang?"* dijawab: **bisa dua-duanya** — dan pertanyaan
 * sayalah yang salah. Mandor borongan diikat ORANGNYA, spesialis ME/lift
 * diikat BADAN USAHANYA.
 *
 * ── Cacat yang ditutup, DIUKUR bukan diduga
 *
 * Sampai migrasi 461, identitas mitra terpecah tiga tabel. Diukur 2026-08-19:
 * kedelapan penawaran tender datang lewat `workers`, sementara penanda daftar
 * hitam hanya bisa menunjuk `suppliers` — dan rute tendernya tak memeriksanya
 * sama sekali. Pihak yang di-blacklist bisa menawar DAN MENANG.
 *
 * ── Kenapa daftar hitam butuh layar, bukan cuma kolom
 *
 * CHARTER §8: "kolom DB sudah ada" BUKAN selesai. Penanda yang cuma bisa
 * diubah lewat SQL adalah penanda yang tak pernah dipakai — dan gerbang
 * kelayakan yang tak pernah diisi sama saja dengan tak ada.
 *
 * ── Kenapa daftar hitam TIDAK di form sunting
 *
 * Ia keputusan, bukan penyuntingan. Menaruhnya di form yang sama dengan nomor
 * telepon membuatnya bisa berubah sambil lalu — dan jejak auditnya tercatat
 * sebagai "mitra diperbarui", kalimat yang tak akan pernah dicari siapa pun
 * yang menyelidiki kenapa sebuah PT tiba-tiba dilarang menawar.
 */

import { useState } from "react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { Tabel, type Kolom } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { LayarKosong } from "@/components/layar-kosong";
import { Plus, RefreshCw, Search, Ban, ShieldCheck, Building2, User } from "lucide-react";
import { C } from "@/lib/warna-ui";
import { useTutupEsc } from "@/lib/use-tutup-esc";

interface Mitra {
  id: string;
  bentuk: "orang" | "badan_usaha";
  nama: string;
  npwp: string | null;
  bentuk_badan: string | null;
  telepon: string | null;
  email: string | null;
  alamat: string | null;
  catatan: string | null;
  daftar_hitam: boolean;
  alasan_daftar_hitam: string | null;
  daftar_hitam_sejak: string | null;
  aktif: boolean;
}

interface Balasan {
  mitra: Mitra[];
  ringkasan: { total: number; orang: number; badan_usaha: number; daftar_hitam: number };
}

export default function MitraPage() {
  const [cari, setCari] = useState("");
  const [bentuk, setBentuk] = useState("");
  const [status, setStatus] = useState("");

  const kueri = new URLSearchParams();
  if (bentuk) kueri.set("bentuk", bentuk);
  if (status) kueri.set("status", status);
  const url = `/api/v1/mitra${kueri.toString() ? `?${kueri}` : ""}`;

  const { data, memuat, galat: galatMuat, muatUlang } = useData<Balasan>(url);

  /*
    Galat AKSI terpisah dari galat MUAT — dijaga `uji-galat-muat-terpisah.mjs`.

    Kalau keduanya berbagi satu state, gagal menyimpan akan MENGHAPUS pesan
    "gagal memuat", dan pemakai kehilangan satu-satunya keterangan kenapa
    layarnya kosong. Ditemukan di 11 halaman pada 2026-08-11.
  */
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Mitra> | null>(null);
  const [hitamUntuk, setHitamUntuk] = useState<Mitra | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  useTutupEsc(form && !menyimpan ? () => setForm(null) : null);
  useTutupEsc(hitamUntuk && !menyimpan ? () => setHitamUntuk(null) : null);

  const daftar = (data?.mitra ?? []).filter((m) =>
    !cari || m.nama.toLowerCase().includes(cari.toLowerCase()));

  const kolom: Kolom<Mitra>[] = [
    {
      kunci: "nama",
      judul: "Nama",
      render: (m) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Ikon DIDAMPINGI teks, bukan menggantikannya. Bentuk mitra
              menentukan bunyi kontrak; menyandikannya hanya lewat gambar
              membuatnya hilang bagi pembaca layar. */}
          {m.bentuk === "badan_usaha"
            ? <Building2 size={14} style={{ color: C.muted, flexShrink: 0 }} aria-hidden="true" />
            : <User size={14} style={{ color: C.muted, flexShrink: 0 }} aria-hidden="true" />}
          <span style={{ fontWeight: 600 }}>
            {m.bentuk === "badan_usaha" && m.bentuk_badan ? `${m.bentuk_badan} ` : ""}{m.nama}
          </span>
          {m.daftar_hitam && (
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
              background: "var(--danger-bg)", color: "var(--danger)",
              border: "1px solid var(--danger-border)", whiteSpace: "nowrap",
            }}>
              DAFTAR HITAM
            </span>
          )}
          {!m.aktif && !m.daftar_hitam && (
            <span style={{ fontSize: 10.5, color: C.muted }}>nonaktif</span>
          )}
        </div>
      ),
    },
    {
      kunci: "bentuk",
      judul: "Bentuk",
      render: (m) => (
        <span style={{ fontSize: 12.5, color: C.mid }}>
          {m.bentuk === "orang" ? "Orang" : "Badan usaha"}
        </span>
      ),
    },
    {
      kunci: "telepon",
      judul: "Kontak",
      render: (m) => (
        <span style={{ fontSize: 12.5, color: C.mid }}>{m.telepon ?? "—"}</span>
      ),
    },
    {
      kunci: "alasan_daftar_hitam",
      judul: "Sebab dilarang",
      render: (m) => (
        // Sebabnya ditampilkan DI DAFTAR, bukan disembunyikan di balik klik.
        // Larangan tanpa sebab yang terbaca jadi hukuman yang tak seorang pun
        // ingat alasannya — dan karena itu tak pernah ditinjau ulang.
        <span style={{ fontSize: 12, color: m.daftar_hitam ? "var(--danger)" : C.muted }}>
          {m.daftar_hitam ? (m.alasan_daftar_hitam ?? "alasan tak tercatat") : "—"}
        </span>
      ),
    },
    {
      kunci: "id",
      judul: "Aksi",
      render: (m) => (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => { setGalatAksi(null); setForm(m); }}
            style={{
              fontSize: 12, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
              background: "transparent", border: `1px solid ${C.border}`, color: C.text,
            }}
          >
            Sunting
          </button>
          <button
            type="button"
            onClick={() => { setGalatAksi(null); setHitamUntuk(m); }}
            style={{
              fontSize: 12, padding: "4px 9px", borderRadius: 6, cursor: "pointer",
              background: "transparent",
              border: `1px solid ${m.daftar_hitam ? "var(--success-border)" : "var(--danger-border)"}`,
              color: m.daftar_hitam ? "var(--success)" : "var(--danger)",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {m.daftar_hitam
              ? <><ShieldCheck size={12} aria-hidden="true" /> Cabut</>
              : <><Ban size={12} aria-hidden="true" /> Daftar hitam</>}
          </button>
        </div>
      ),
    },
  ];

  const r = data?.ringkasan;

  return (
    <div>
      {/* Kenapa layar ini ada, dinyatakan di layar — bukan cuma di kode.
          Pemakai yang tak tahu bedanya "Mitra" dan "Tukang" akan mengira ini
          duplikat, lalu memasukkan orang yang sama dua kali. */}
      <div style={{
        display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px",
        background: "var(--info-bg)", border: "1px solid var(--info-border)",
        borderRadius: 8, fontSize: 12.5, color: "var(--info)",
        marginBottom: 14, lineHeight: 1.55,
      }}>
        <span>
          Satu identitas untuk pihak yang bisa muncul sebagai <strong>tukang</strong>,{" "}
          <strong>pemasok</strong>, maupun <strong>penawar tender</strong> sekaligus.
          Subkontraktor bisa berupa <strong>orang</strong> (mandor borongan) atau{" "}
          <strong>badan usaha</strong> (spesialis ME, lift, waterproofing) — keduanya sah.
          Status daftar hitam di sini menutup <strong>semua</strong> pintu itu sekaligus.
        </span>
      </div>

      {r && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 8, marginBottom: 14,
        }}>
          {[
            { l: "Total mitra", v: r.total, w: C.text },
            { l: "Orang", v: r.orang, w: C.text },
            { l: "Badan usaha", v: r.badan_usaha, w: C.text },
            { l: "Daftar hitam", v: r.daftar_hitam, w: r.daftar_hitam > 0 ? "var(--danger)" : C.text },
          ].map((k) => (
            <div key={k.l} style={{ ...GAYA_KARTU, padding: "12px 14px" }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>{k.l}</div>
              <div style={{
                fontSize: "var(--teks-kpi)", fontWeight: 700, marginTop: 4,
                lineHeight: 1.1, color: k.w,
              }}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <label style={{ position: "relative", flex: "1 1 200px" }}>
          <span className="sr-only">Cari nama mitra</span>
          <Search size={14} aria-hidden="true" style={{
            position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)",
            color: C.muted, pointerEvents: "none",
          }} />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama…"
            style={{
              width: "100%", padding: "7px 10px 7px 28px", fontSize: 13,
              border: `1px solid ${C.border}`, borderRadius: 7,
              background: C.surface, color: C.text,
            }}
          />
        </label>

        <label>
          <span className="sr-only">Saring bentuk mitra</span>
          <select aria-label="Saring bentuk mitra" value={bentuk} onChange={(e) => setBentuk(e.target.value)} style={{
            padding: "7px 10px", fontSize: 13, border: `1px solid ${C.border}`,
            borderRadius: 7, background: C.surface, color: C.text,
          }}>
            <option value="">Semua bentuk</option>
            <option value="orang">Orang</option>
            <option value="badan_usaha">Badan usaha</option>
          </select>
        </label>

        <label>
          <span className="sr-only">Saring status mitra</span>
          <select aria-label="Saring status mitra" value={status} onChange={(e) => setStatus(e.target.value)} style={{
            padding: "7px 10px", fontSize: 13, border: `1px solid ${C.border}`,
            borderRadius: 7, background: C.surface, color: C.text,
          }}>
            <option value="">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
            <option value="hitam">Daftar hitam</option>
          </select>
        </label>

        <button type="button" onClick={() => muatUlang()} style={{
          padding: "7px 11px", fontSize: 13, borderRadius: 7, cursor: "pointer",
          background: "transparent", border: `1px solid ${C.border}`, color: C.text,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <RefreshCw size={13} aria-hidden="true" /> Muat ulang
        </button>

        <button
          type="button"
          onClick={() => { setGalatAksi(null); setForm({ bentuk: "orang" }); }}
          style={{
            padding: "7px 11px", fontSize: 13, borderRadius: 7, cursor: "pointer",
            background: C.text, border: `1px solid ${C.text}`, color: C.surface,
            display: "flex", alignItems: "center", gap: 6, fontWeight: 600,
          }}
        >
          <Plus size={13} aria-hidden="true" /> Mitra baru
        </button>
      </div>

      {galatMuat && (
        <div role="alert" style={{
          padding: "10px 12px", marginBottom: 12, fontSize: 12.5,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          borderRadius: 8, color: "var(--danger)",
        }}>
          Gagal memuat daftar mitra: {galatMuat.message}
        </div>
      )}

      {galatAksi && (
        <div role="alert" style={{
          padding: "10px 12px", marginBottom: 12, fontSize: 12.5,
          background: "var(--danger-bg)", border: "1px solid var(--danger-border)",
          borderRadius: 8, color: "var(--danger)",
        }}>
          {galatAksi}
        </div>
      )}

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: 40, textAlign: "center", color: C.mid, fontSize: 13 }}>
          Memuat…
        </div>
      ) : daftar.length === 0 ? (
        <LayarKosong
          ikon={<Building2 size={21} />}
          judul="Belum ada mitra yang cocok"
          apa="Mitra adalah satu identitas untuk pihak yang bisa muncul sebagai tukang, pemasok, maupun penawar tender — berbentuk orang maupun badan usaha."
          kenapa="Saringan di atas mungkin terlalu sempit. Tukang dan pemasok yang sudah ada ikut tertaut otomatis saat migrasi, jadi daftar yang benar-benar kosong berarti belum ada keduanya."
          aksi={{ label: "Lihat daftar tukang", href: "/mandor/tukang" }}
        />
      ) : (
        <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
          <Tabel<Mitra>
            caption="Daftar identitas mitra: nama, bentuk badan, kontak, dan sebab larangan bila ada."
            data={daftar}
            kunciBaris={(m) => m.id}
            kolom={kolom}
          />
        </div>
      )}

      {form && (
        <FormMitra
          awal={form}
          menyimpan={menyimpan}
          tutup={() => setForm(null)}
          simpan={async (isi) => {
            setMenyimpan(true);
            setGalatAksi(null);
            try {
              if (form.id) await api.patch(`/api/v1/mitra/${form.id}`, isi);
              else await api.post("/api/v1/mitra", isi);
              setForm(null);
              await muatUlang();
            } catch (e) {
              setGalatAksi(
                (e as { response?: { data?: { error?: string } } })?.response?.data?.error
                ?? "Gagal menyimpan mitra");
            } finally {
              setMenyimpan(false);
            }
          }}
        />
      )}

      {hitamUntuk && (
        <DialogDaftarHitam
          mitra={hitamUntuk}
          menyimpan={menyimpan}
          tutup={() => setHitamUntuk(null)}
          kirim={async (alasan) => {
            setMenyimpan(true);
            setGalatAksi(null);
            try {
              await api.patch(`/api/v1/mitra/${hitamUntuk.id}/daftar-hitam`, {
                daftar_hitam: !hitamUntuk.daftar_hitam,
                alasan,
              });
              setHitamUntuk(null);
              await muatUlang();
            } catch (e) {
              setGalatAksi(
                (e as { response?: { data?: { error?: string } } })?.response?.data?.error
                ?? "Gagal mengubah status daftar hitam");
            } finally {
              setMenyimpan(false);
            }
          }}
        />
      )}
    </div>
  );
}

/** Form tambah/sunting. Daftar hitam SENGAJA tak ada di sini. */
function FormMitra({ awal, menyimpan, tutup, simpan }: {
  awal: Partial<Mitra>;
  menyimpan: boolean;
  tutup: () => void;
  simpan: (isi: Record<string, unknown>) => void;
}) {
  const [isi, setIsi] = useState<Partial<Mitra>>(awal);
  const badan = isi.bentuk === "badan_usaha";

  return (
    <dialog open aria-labelledby="judul-form-mitra" style={{
      position: "fixed", inset: 0, zIndex: 60, width: "100%", height: "100%",
      background: "rgba(0,0,0,0.45)", border: "none", padding: 16,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          simpan({
            bentuk: isi.bentuk, nama: isi.nama,
            bentuk_badan: badan ? isi.bentuk_badan : null,
            npwp: isi.npwp ?? null, telepon: isi.telepon ?? null,
            email: isi.email ?? null, alamat: isi.alamat ?? null,
            catatan: isi.catatan ?? null,
          });
        }}
        style={{
          ...GAYA_KARTU, padding: 18, maxWidth: 460, width: "100%",
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <h2 id="judul-form-mitra" style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px", color: C.text }}>
          {awal.id ? "Sunting mitra" : "Mitra baru"}
        </h2>

        <label style={{ display: "block", marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>Bentuk</span>
          <select
            aria-label="Bentuk mitra"
            value={isi.bentuk ?? "orang"}
            // Bentuk TIDAK bisa diubah sesudah tersimpan: mengubahnya berarti
            // pihak yang sama berpindah taksonomi, dan seluruh kontrak yang
            // menyebut "CV" jadi menunjuk seorang individu.
            disabled={!!awal.id}
            onChange={(e) => setIsi({ ...isi, bentuk: e.target.value as Mitra["bentuk"] })}
            style={{
              width: "100%", padding: "7px 9px", fontSize: 13, marginTop: 4,
              border: `1px solid ${C.border}`, borderRadius: 7,
              background: C.surface, color: C.text, opacity: awal.id ? 0.6 : 1,
            }}
          >
            <option value="orang">Orang — mandor borongan, tukang</option>
            <option value="badan_usaha">Badan usaha — PT / CV / UD</option>
          </select>
          {awal.id && (
            <span style={{ fontSize: 11, color: C.muted, display: "block", marginTop: 3 }}>
              Bentuk tak bisa diubah — kontrak yang sudah terbit menyebutnya.
            </span>
          )}
        </label>

        {([
          ["nama", "Nama", true],
          ...(badan ? [["bentuk_badan", "Bentuk badan (PT / CV / UD)", true] as const] : []),
          ...(badan ? [["npwp", "NPWP", false] as const] : []),
          ["telepon", "Telepon", false],
          ["email", "Email", false],
          ["alamat", "Alamat", false],
        ] as [keyof Mitra, string, boolean][]).map(([k, label, wajib]) => (
          <label key={k} style={{ display: "block", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>
              {label}{wajib && <span style={{ color: "var(--danger)" }}> *</span>}
            </span>
            <input
              value={(isi[k] as string) ?? ""}
              required={wajib}
              onChange={(e) => setIsi({ ...isi, [k]: e.target.value })}
              style={{
                width: "100%", padding: "7px 9px", fontSize: 13, marginTop: 4,
                border: `1px solid ${C.border}`, borderRadius: 7,
                background: C.surface, color: C.text,
              }}
            />
          </label>
        ))}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" onClick={tutup} disabled={menyimpan} style={{
            padding: "7px 13px", fontSize: 13, borderRadius: 7, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.border}`, color: C.text,
          }}>Batal</button>
          <button type="submit" disabled={menyimpan} style={{
            padding: "7px 13px", fontSize: 13, borderRadius: 7, cursor: "pointer",
            background: C.text, border: `1px solid ${C.text}`, color: C.surface, fontWeight: 600,
          }}>{menyimpan ? "Menyimpan…" : "Simpan"}</button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * Dialog daftar hitam — TERPISAH dari form sunting.
 *
 * Ini keputusan yang menghentikan sebuah pihak mencari nafkah dari perusahaan
 * ini. Ia tak boleh berubah sambil lalu bersama nomor telepon.
 */
function DialogDaftarHitam({ mitra, menyimpan, tutup, kirim }: {
  mitra: Mitra;
  menyimpan: boolean;
  tutup: () => void;
  kirim: (alasan: string) => void;
}) {
  const [alasan, setAlasan] = useState("");
  const mencabut = mitra.daftar_hitam;

  return (
    <dialog open aria-labelledby="judul-hitam" style={{
      position: "fixed", inset: 0, zIndex: 60, width: "100%", height: "100%",
      background: "rgba(0,0,0,0.45)", border: "none", padding: 16,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <form
        onSubmit={(e) => { e.preventDefault(); kirim(alasan); }}
        style={{ ...GAYA_KARTU, padding: 18, maxWidth: 440, width: "100%" }}
      >
        <h2 id="judul-hitam" style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px", color: C.text }}>
          {mencabut ? "Cabut dari daftar hitam" : "Masukkan ke daftar hitam"}
        </h2>

        <p style={{ fontSize: 12.5, color: C.mid, margin: "0 0 12px", lineHeight: 1.55 }}>
          <strong>{mitra.nama}</strong>{" "}
          {mencabut ? (
            <>akan boleh kembali menawar tender dan menerima pekerjaan.
            Sebab larangan yang tercatat sekarang —{" "}
            <em>{mitra.alasan_daftar_hitam ?? "tak tercatat"}</em> — akan dihapus.</>
          ) : (
            <>tak akan bisa ditetapkan sebagai pemenang tender maupun menerima
            pekerjaan baru, lewat pintu mana pun: sebagai tukang, sebagai
            pemasok, maupun sebagai penawar.</>
          )}
        </p>

        {!mencabut && (
          <label style={{ display: "block", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.mid }}>
              Sebab larangan <span style={{ color: "var(--danger)" }}>*</span>
            </span>
            <textarea
              value={alasan}
              required
              minLength={10}
              rows={3}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Contoh: tiga kali gagal serah terima pada 2026"
              style={{
                width: "100%", padding: "7px 9px", fontSize: 13, marginTop: 4,
                border: `1px solid ${C.border}`, borderRadius: 7,
                background: C.surface, color: C.text, resize: "vertical",
              }}
            />
            {/* Ambangnya DINYATAKAN, bukan cuma ditegakkan. Form yang menolak
                tanpa memberitahu syaratnya membuat pemakai menebak. */}
            <span style={{ fontSize: 11, color: C.muted, display: "block", marginTop: 3 }}>
              Minimal 10 huruf. Tanpa sebab yang bisa dibaca, keputusan ini tak
              bisa ditinjau ulang oleh siapa pun yang tak ada saat ini.
            </span>
          </label>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" onClick={tutup} disabled={menyimpan} style={{
            padding: "7px 13px", fontSize: 13, borderRadius: 7, cursor: "pointer",
            background: "transparent", border: `1px solid ${C.border}`, color: C.text,
          }}>Batal</button>
          <button type="submit" disabled={menyimpan} style={{
            padding: "7px 13px", fontSize: 13, borderRadius: 7, cursor: "pointer",
            background: mencabut ? "var(--success)" : "var(--danger)",
            border: "none", color: "#fff", fontWeight: 600,
          }}>
            {menyimpan ? "Menyimpan…" : mencabut ? "Cabut larangan" : "Masukkan daftar hitam"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
