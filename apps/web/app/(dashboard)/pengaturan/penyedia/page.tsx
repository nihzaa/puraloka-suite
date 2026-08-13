"use client";

/**
 * PENGATURAN → PENYEDIA LAYANAN
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI: "SAMBUNGANNYA HIDUP TIDAK?"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Bukan "apa setelannya" — itu halaman lain. Yang membuka halaman ini hampir
 * selalu sedang menghadapi sesuatu yang DIAM: notifikasi tak sampai, asisten
 * menjawab "sedang tak bisa dihubungi", pesan WhatsApp tak terkirim.
 *
 * Karena itu kolom KESEHATAN ada di posisi yang tak bisa dilewati mata, dan
 * tombol Uji ada di tiap baris — bukan tersembunyi di halaman detail.
 *
 * ── Melampaui TJS, dan bedanya terukur
 *
 * `automation-tjs/.../lib/ai/registry.ts` menuliskan sendiri cara menambah
 * penyedia: buat berkas adaptor, tambahkan baris di konstanta. Penyedia di
 * sana adalah KODE — menambahnya butuh deploy.
 *
 * Di sini penyedianya DATA: baris tabel yang diisi dari halaman ini. Yang
 * tetap kode hanya ADAPTOR (bentuk muatan HTTP memang tak bisa dikarang dari
 * UI), dan daftarnya diambil dari server supaya UI tak pernah menawarkan
 * pilihan yang tak punya adaptor.
 *
 * Status kesehatan TIDAK ADA di TJS sama sekali (diukur 2026-08-10: nol
 * berkas yang menyebut health/kesehatan/status_check di seluruh settings/).
 *
 * ── Kunci API tidak diisi di sini, dan itu disengaja
 *
 * Registry menyimpan NAMA kunci, bukan nilainya. Nilainya diisi di halaman
 * Kredensial yang tersandi dan dijaga penjaga berambang NOL. Dua tempat
 * rahasia berarti satu yang tak terjaga — dan server MENOLAK field yang
 * namanya tampak rahasia.
 *
 * ── Warna (ARAH-VISUAL-2026 §3d: satu aksen per layar)
 *
 * Navy hanya untuk tombol simpan. Kesehatan memakai lencana bernada — sukses
 * / bahaya / netral — karena itu STATUS, bukan penonjolan.
 */

import { useCallback, useEffect, useState } from "react";
import { useIzin } from "@/lib/use-izin";
import { Plug, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Lencana, Tabel, Tombol } from "@/components/dasar";
import { Kosong, Panel } from "@/components/ui-dasar";
import { BarisRail, KartuRail } from "@/components/shell/rail-kartu";
import { RailIsi } from "@/components/shell/rail-isi";
import { usePasangRail } from "@/lib/rail-context";

interface Penyedia {
  id: string;
  jenis: string;
  adaptor: string;
  nama: string;
  aktif: boolean;
  prioritas: number;
  konfigurasi: Record<string, unknown>;
  kunci_kredensial: string | null;
  kesehatan: string;
  kesehatan_pesan: string | null;
  kesehatan_pada: string | null;
  kesehatan_ms: number | null;
}

interface Adaptor {
  kunci: string;
  label: string;
  keterangan: string;
  butuh: readonly string[];
}

interface KatalogAdaptor {
  wa: Adaptor[];
  ai: Adaptor[];
}

interface JejakUji {
  hasil: string;
  pesan: string | null;
  durasi_ms: number | null;
  dibuat_pada: string;
}

const LABEL_JENIS: Record<string, string> = { wa: "WhatsApp", ai: "AI" };

/** Kunci kredensial bawaan per adaptor — supaya orang tak menebak namanya. */
const KUNCI_BAWAAN: Record<string, string> = {
  evolution: "WA_API_KEY",
  fonnte: "WA_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  "openai-compatible": "AI_PROVIDER_API_KEY",
};

function nadaKesehatan(k: string): "sukses" | "bahaya" | "netral" {
  if (k === "sehat") return "sukses";
  if (k === "gagal") return "bahaya";
  return "netral";
}

const LABEL_KESEHATAN: Record<string, string> = {
  sehat: "Sehat",
  gagal: "Gagal",
  belum_diuji: "Belum diuji",
};

function sejak(iso: string | null): string {
  if (!iso) return "—";
  const detik = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (detik < 60) return "baru saja";
  if (detik < 3600) return `${Math.floor(detik / 60)} mnt lalu`;
  if (detik < 86400) return `${Math.floor(detik / 3600)} jam lalu`;
  return `${Math.floor(detik / 86400)} hr lalu`;
}


const input: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 14,
  background: "var(--surface)",
  color: C.text,
  boxSizing: "border-box",
  fontFamily: "inherit",
  width: "100%",
};

interface Draf {
  jenis: string;
  adaptor: string;
  nama: string;
  baseUrl: string;
  instance: string;
  kunci_kredensial: string;
  aktif: boolean;
}

const DRAF_KOSONG: Draf = {
  jenis: "wa",
  adaptor: "",
  nama: "",
  baseUrl: "",
  instance: "",
  kunci_kredensial: "",
  aktif: true,
};

export default function PenyediaPage() {
  const bolehKelola = useIzin("settings:penyedia:manage");

  const [daftar, setDaftar] = useState<Penyedia[]>([]);
  const [katalog, setKatalog] = useState<KatalogAdaptor | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [menguji, setMenguji] = useState<string | null>(null);
  const [draf, setDraf] = useState<Draf | null>(null);
  const [simpan, setSimpan] = useState(false);
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);
  const [jejak, setJejak] = useState<JejakUji[]>([]);

  const muat = useCallback(async () => {
    try {
      const [d, k] = await Promise.all([
        api.get<{ data: Penyedia[] }>("/api/v1/penyedia"),
        api.get<KatalogAdaptor>("/api/v1/penyedia/adaptor"),
      ]);
      const baris = d.data.data ?? [];
      setDaftar(baris);
      setKatalog(k.data);

      /*
       * Jejak yang ditampilkan: penyedia yang PALING perlu diperiksa.
       *
       * Bukan semuanya (rail jadi daftar panjang tanpa fokus), bukan yang
       * pertama menurut abjad (tak ada hubungannya dengan yang bermasalah).
       * Yang gagal lebih dulu; kalau semua sehat, yang terakhir diuji.
       */
      const fokus =
        baris.find((b) => b.aktif && b.kesehatan === "gagal") ??
        baris.find((b) => b.kesehatan_pada) ??
        baris[0];
      if (fokus) {
        try {
          const j = await api.get<{ data: JejakUji[] }>(`/api/v1/penyedia/${fokus.id}/log`);
          setJejak(j.data.data ?? []);
        } catch {
          // Jejak yang gagal dimuat TIDAK menjatuhkan halaman: daftar
          // penyedianya jauh lebih penting, dan rail kosong lebih baik
          // daripada layar galat.
          setJejak([]);
        }
      }
    } catch {
      setToast({ tipe: "err", pesan: "Gagal memuat daftar penyedia" });
    } finally {
      setMemuat(false);
    }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: `muat()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect
  // memicu render kedua sebelum yang pertama selesai
  // (react-hooks/set-state-in-effect). Menunda satu microtask
  // memindahkannya keluar dari fase render tanpa jeda yang terlihat.
  //
  // Pola yang sama sudah dipakai 131 tempat di aplikasi ini.
  useEffect(() => {
    queueMicrotask(() => { void muat(); });
  }, [muat]);

  async function uji(p: Penyedia) {
    setMenguji(p.id);
    try {
      const r = await api.post<{ ok: boolean; pesan: string; durasi_ms: number }>(
        `/api/v1/penyedia/${p.id}/uji`,
        {},
      );
      setToast({
        tipe: r.data.ok ? "ok" : "err",
        pesan: `${p.nama}: ${r.data.pesan} (${r.data.durasi_ms} ms)`,
      });
      await muat();
    } catch {
      setToast({ tipe: "err", pesan: `Gagal menguji ${p.nama}` });
    } finally {
      setMenguji(null);
    }
  }

  async function kirimDraf() {
    if (!draf) return;
    if (!draf.adaptor || !draf.nama.trim()) {
      setToast({ tipe: "err", pesan: "Adaptor dan nama wajib diisi" });
      return;
    }
    setSimpan(true);
    try {
      // Konfigurasi HANYA yang non-rahasia. Server menolak field yang namanya
      // tampak rahasia — jadi kunci tak akan pernah lolos ke sini meski
      // seseorang menambahkan input-nya.
      const konfigurasi: Record<string, unknown> = {};
      if (draf.baseUrl.trim()) konfigurasi.baseUrl = draf.baseUrl.trim();
      if (draf.instance.trim()) konfigurasi.instance = draf.instance.trim();

      await api.post("/api/v1/penyedia", {
        jenis: draf.jenis,
        adaptor: draf.adaptor,
        nama: draf.nama.trim(),
        aktif: draf.aktif,
        konfigurasi,
        kunci_kredensial: draf.kunci_kredensial.trim() || KUNCI_BAWAAN[draf.adaptor] || null,
      });
      setToast({ tipe: "ok", pesan: `${draf.nama} tersimpan. Tekan Uji untuk memeriksa sambungannya.` });
      setDraf(null);
      await muat();
    } catch (e) {
      const pesan =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        "Gagal menyimpan penyedia";
      setToast({ tipe: "err", pesan });
    } finally {
      setSimpan(false);
    }
  }

  /*
   * Rail kanan: JEJAK uji, bukan ringkasan kedua dari tabel.
   *
   * Tabel menjawab "sekarang bagaimana". Yang tak terjawab di sana: "sejak
   * kapan" dan "sesering apa". Penyedia yang gagal 3 dari 10 percobaan adalah
   * masalah yang berbeda dari yang gagal 10 dari 10 — dan keduanya terlihat
   * sama persis di kolom status.
   */
  const fokusJejak =
    daftar.find((b) => b.aktif && b.kesehatan === "gagal") ??
    daftar.find((b) => b.kesehatan_pada) ??
    daftar[0];

  usePasangRail(
    <RailIsi
      konteks={
        <>
          <KartuRail
            judul={fokusJejak ? `Jejak: ${fokusJejak.nama}` : "Jejak uji"}
            kosong="Belum ada uji koneksi. Tekan Uji pada salah satu penyedia."
          >
            {jejak.slice(0, 8).map((j, i) => (
              <BarisRail
                key={`${j.dibuat_pada}-${i}`}
                pertama={i === 0}
                utama={j.hasil === "sehat" ? "Sehat" : "Gagal"}
                sub={j.pesan ?? (j.durasi_ms != null ? `${j.durasi_ms} ms` : "")}
                kanan={sejak(j.dibuat_pada)}
                nadaKanan={j.hasil === "sehat" ? "normal" : "bahaya"}
              />
            ))}
          </KartuRail>

          <KartuRail judul="Kredensial" tautan="/pengaturan/kredensial" kosong="">
            <BarisRail
              pertama
              utama="Nilai kunci diisi di sana"
              sub="Halaman ini hanya menyimpan namanya"
              href="/pengaturan/kredensial"
            />
          </KartuRail>
        </>
      }
    />,
    [daftar, jejak],
  );

  const adaptorUntuk = (jenis: string): Adaptor[] =>
    jenis === "wa" ? (katalog?.wa ?? []) : (katalog?.ai ?? []);

  const adaptorTerpilih = draf ? adaptorUntuk(draf.jenis).find((a) => a.kunci === draf.adaptor) : undefined;

  return (
    <div style={{
      // --w-page — satu tabel penyedia, bukan tabel padat kolom. Tanpa container, isi halaman ini melebar
      // mengikuti induknya: diukur 1080px di layar 1600px sementara
      // halaman lain 1380px — terlihat seperti dua aplikasi berbeda.
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
      display: "grid", gap: 16,
    }}>
      <KepalaHalaman
        judul="Penyedia Layanan"
        keterangan="Sambungan ke layanan luar — AI dan WhatsApp. Uji koneksinya di sini sebelum menduga yang lain."
        aksi={
          bolehKelola ? (
            <Tombol jenis="utama" onClick={() => setDraf(DRAF_KOSONG)} ikon={<Plug size={14} />}>
              Tambah penyedia
            </Tombol>
          ) : undefined
        }
      />

      {/* Penjelasan yang menahan salah paham paling mahal di halaman ini. */}
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          fontSize: 13,
          color: C.muted,
          lineHeight: 1.65,
        }}
      >
        <strong style={{ color: C.text }}>Kunci API tidak diisi di halaman ini.</strong>{" "}
        Yang disimpan hanya NAMA kuncinya; nilainya diisi di halaman Kredensial supaya
        tersandi dan terjaga. Menyimpan rahasia di dua tempat berarti satu di antaranya
        tidak terjaga.
      </div>

      <Panel judul="Terdaftar">
        {memuat ? (
          <div style={{ padding: 20, color: C.muted, fontSize: 14 }}>Memuat…</div>
        ) : daftar.length === 0 ? (
          <Kosong
            ikon={<Plug size={20} />}
            judul="Belum ada penyedia"
            sebab="Tambahkan sambungan AI atau WhatsApp supaya asisten dan notifikasi bisa bekerja."
          />
        ) : (
          <Tabel
            caption="Penyedia AI dan WhatsApp yang terdaftar beserta status kesehatannya."
            data={daftar}
            kunciBaris={(p) => p.id}
            kolom={[
              {
                kunci: "nama",
                judul: "Nama",
                // Nama penyedia adalah yang MEMILIKI baris ini. Tanpa
                // `kepalaBaris`, lencana kesehatan dibacakan tanpa menyebut
                // penyedia mana yang sedang bermasalah.
                kepalaBaris: true,
                render: (p) => (
                  <>
                    <div style={{ fontWeight: 500, color: C.text }}>{p.nama}</div>
                    {!p.aktif && <div style={{ fontSize: 12, color: C.muted }}>nonaktif</div>}
                  </>
                ),
              },
              {
                kunci: "jenis",
                judul: "Jenis",
                render: (p) => (
                  <span style={{ color: C.muted, whiteSpace: "nowrap" }}>
                    {LABEL_JENIS[p.jenis] ?? p.jenis}
                  </span>
                ),
              },
              {
                kunci: "adaptor",
                judul: "Adaptor",
                render: (p) => (
                  <span style={{ color: C.muted, whiteSpace: "nowrap" }}>{p.adaptor}</span>
                ),
              },
              {
                kunci: "kesehatan",
                judul: "Kesehatan",
                render: (p) => (
                  <>
                    <Lencana nada={nadaKesehatan(p.kesehatan)}>
                      {LABEL_KESEHATAN[p.kesehatan] ?? p.kesehatan}
                    </Lencana>
                    {p.kesehatan_pesan && (
                      <div style={{ fontSize: 12, color: C.muted, marginTop: 3, maxWidth: 320 }}>
                        {p.kesehatan_pesan}
                      </div>
                    )}
                  </>
                ),
              },
              {
                kunci: "diuji",
                judul: "Diuji",
                render: (p) => (
                  <span style={{ color: C.muted, whiteSpace: "nowrap", fontSize: 13 }}>
                    {sejak(p.kesehatan_pada)}
                    {p.kesehatan_ms != null && (
                      <span style={{ fontSize: 12 }}> · {p.kesehatan_ms} ms</span>
                    )}
                  </span>
                ),
              },
              {
                kunci: "aksi",
                judul: "",
                render: (p) =>
                  bolehKelola ? (
                    <Tombol
                      kecil
                      onClick={() => uji(p)}
                      disabled={menguji === p.id}
                      ikon={<RefreshCw size={13} />}
                    >
                      {menguji === p.id ? "Menguji…" : "Uji"}
                    </Tombol>
                  ) : null,
              },
            ]}
          />
        )}
      </Panel>

      {draf && (
        <Panel judul="Penyedia baru">
          <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
            {/*
              `htmlFor`+`id` eksplisit, bukan hanya <label> pembungkus.
              Keduanya sah menurut HTML, tetapi label implisit membuat nama
              kontrol bergantung pada struktur DOM yang bisa berubah saat
              layout dirapikan — dan `a11y-ratchet` memang tak melihatnya.
            */}
            <label htmlFor="penyedia-jenis" style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Jenis</span>
              <select
                id="penyedia-jenis"
                aria-label="Jenis penyedia layanan"
                style={input}
                value={draf.jenis}
                onChange={(e) =>
                  // Adaptor DIKOSONGKAN saat jenis berubah: adaptor WA tak
                  // pernah sah untuk AI, dan menyisakannya membuat form
                  // terkirim dengan pasangan yang server tolak.
                  setDraf({ ...draf, jenis: e.target.value, adaptor: "" })
                }
              >
                <option value="wa">WhatsApp</option>
                <option value="ai">AI</option>
              </select>
            </label>

            <label htmlFor="penyedia-adaptor" style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Adaptor</span>
              <select
                id="penyedia-adaptor"
                aria-label="Adaptor penyedia layanan"
                style={input}
                value={draf.adaptor}
                onChange={(e) => setDraf({ ...draf, adaptor: e.target.value })}
              >
                <option value="">— pilih —</option>
                {adaptorUntuk(draf.jenis).map((a) => (
                  <option key={a.kunci} value={a.kunci}>
                    {a.label}
                  </option>
                ))}
              </select>
              {adaptorTerpilih && (
                <span style={{ fontSize: 12, color: C.muted }}>{adaptorTerpilih.keterangan}</span>
              )}
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: C.muted }}>Nama</span>
              <input
                style={input}
                value={draf.nama}
                placeholder="mis. Evolution Utama"
                onChange={(e) => setDraf({ ...draf, nama: e.target.value })}
              />
            </label>

            {/* Field non-rahasia yang DIBUTUHKAN adaptor terpilih — bukan
                semua field selalu ditampilkan, karena field yang tak relevan
                membuat orang mengisinya asal. */}
            {adaptorTerpilih?.butuh.includes("baseUrl") && (
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, color: C.muted }}>Base URL</span>
                <input
                  style={input}
                  value={draf.baseUrl}
                  placeholder="http://localhost:8081"
                  onChange={(e) => setDraf({ ...draf, baseUrl: e.target.value })}
                />
              </label>
            )}

            {adaptorTerpilih?.butuh.includes("instance") && (
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 13, color: C.muted }}>Instance</span>
                <input
                  style={input}
                  value={draf.instance}
                  placeholder="puraloka-bot"
                  onChange={(e) => setDraf({ ...draf, instance: e.target.value })}
                />
              </label>
            )}

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: C.muted }}>
                Nama kunci di halaman Kredensial
              </span>
              <input
                style={input}
                value={draf.kunci_kredensial}
                placeholder={KUNCI_BAWAAN[draf.adaptor] ?? "mis. WA_API_KEY"}
                onChange={(e) => setDraf({ ...draf, kunci_kredensial: e.target.value })}
              />
              <span style={{ fontSize: 12, color: C.muted }}>
                Nama, bukan nilainya. Nilainya diisi di halaman Kredensial.
              </span>
            </label>

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input
                type="checkbox"
                checked={draf.aktif}
                onChange={(e) => setDraf({ ...draf, aktif: e.target.checked })}
              />
              <span style={{ color: C.text }}>Aktifkan</span>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <Tombol jenis="utama" onClick={kirimDraf} disabled={simpan}>
                {simpan ? "Menyimpan…" : "Simpan"}
              </Tombol>
              <Tombol jenis="hantu" onClick={() => setDraf(null)}>
                Batal
              </Tombol>
            </div>
          </div>
        </Panel>
      )}

      {toast && (
        <div
          role="status"
          onClick={() => setToast(null)}
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            padding: "12px 16px",
            borderRadius: 10,
            background: toast.tipe === "ok" ? C.aksen : C.danger,
            color: "#fff",
            fontSize: 13,
            maxWidth: 420,
            boxShadow: "var(--naik-2)",
            cursor: "pointer",
            zIndex: 50,
          }}
        >
          {toast.pesan}
        </div>
      )}
    </div>
  );
}
