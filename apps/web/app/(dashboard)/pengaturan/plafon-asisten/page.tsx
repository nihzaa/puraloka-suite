"use client";

/**
 * PENGATURAN → PLAFON PERSETUJUAN ASISTEN
 *
 * ══════════════════════════════════════════════════════════════════════════
 * PERTANYAAN YANG DIBAWA KE HALAMAN INI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * "Sampai berapa orang ini boleh menyetujui lewat WhatsApp tanpa membuka
 * aplikasi?" — dan jawabannya harus terbaca sekali pandang untuk SEMUA orang,
 * bukan satu per satu.
 *
 * Karena itu bentuknya daftar seluruh anggota, termasuk yang belum diatur.
 * Daftar yang hanya memuat yang sudah punya plafon menyembunyikan justru
 * orang-orang yang perlu diputuskan — dan yang tak terlihat tak akan diputuskan.
 *
 * ── "Belum diatur" DIBEDAKAN dari "Rp 0"
 *
 * Keduanya berperilaku sama di gerbang (nol, fail-closed), tetapi berbeda
 * artinya bagi manusia: satu berarti belum dipikirkan, satu berarti sudah
 * diputuskan tidak boleh. Menyamakan tampilannya membuat admin tak bisa tahu
 * mana pekerjaan yang tersisa.
 *
 * ── Kenapa halaman ini ada sama sekali
 *
 * CHARTER §7: "kolom DB sudah ada" bukan selesai. Plafon yang hanya bisa diisi
 * lewat SQL tak akan pernah diisi, dan gerbang uang yang tak pernah diisi
 * bernilai nol untuk semua orang — fail-closed berarti fiturnya mati, bukan
 * berarti aman.
 *
 * ── Warna (ARAH-VISUAL-2026 §3d)
 *
 * Satu aksen per layar. Navy hanya untuk angka plafon yang aktif dan tombol
 * simpan. Baris "belum diatur" netral — ia keadaan, bukan peringatan.
 */

import { useCallback, useEffect, useState } from "react";
import { useIzin } from "@/lib/use-izin";
import { api } from "@/lib/api";
// `Info` dilepas bersama kartu penjelas yang digantikan `PanduanHalaman` —
// panduan tak memakai ikon, dan impor mati menaikkan lint-ratchet.
import { ShieldCheck } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman, Tabel } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { PanduanHalaman } from "@/components/panduan-halaman";


const input: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 14,
  background: "var(--surface)",
  color: C.text,
  boxSizing: "border-box",
  fontFamily: "inherit",
  textAlign: "right",
  width: 160,
};

interface Baris {
  user_id: string;
  nama: string;
  email: string;
  peran: string;
  batas_idr: number | null;
  sudah_diatur: boolean;
}


const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

export default function PlafonAsistenPage() {
  const bolehUbah = useIzin("settings:ai:batas");

  const [baris, setBaris] = useState<Baris[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [draf, setDraf] = useState<Record<string, string>>({});
  const [sedang, setSedang] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      // axios: `r.data` adalah SELURUH badan respons, dan rute ini membungkus
      // barisnya dalam `{ data: [...] }` — jadi barisnya di `r.data.data`.
      // Salah satu tingkat saja menghasilkan `baris.map is not a function`,
      // yang baru terlihat di tangkapan layar, bukan di log server.
      const r = await api.get<{ data: Baris[] }>("/api/v1/ai/batas-setujui");
      setBaris(r.data.data ?? []);
    } catch {
      setToast({ tipe: "err", pesan: "Gagal memuat daftar plafon" });
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

  async function simpan(b: Baris) {
    const mentah = (draf[b.user_id] ?? "").trim();
    // Kosong = HAPUS plafon (kembali "belum diatur"), bukan nol. Dua hal
    // berbeda, dan tombolnya harus bisa menyatakan keduanya.
    const nilai = mentah === "" ? null : Number(mentah.replace(/[^\d]/g, ""));

    if (nilai !== null && !Number.isFinite(nilai)) {
      setToast({ tipe: "err", pesan: "Plafon harus angka" });
      return;
    }

    setSedang(b.user_id);
    try {
      await api.put("/api/v1/ai/batas-setujui", { user_id: b.user_id, batas_idr: nilai });
      setToast({
        tipe: "ok",
        pesan:
          nilai === null
            ? `Plafon ${b.nama} dikosongkan — ia kembali tak bisa menyetujui lewat asisten.`
            : `Plafon ${b.nama} disetel ${rupiah(nilai)}.`,
      });
      setDraf((d) => {
        const s = { ...d };
        delete s[b.user_id];
        return s;
      });
      await muat();
    } catch {
      setToast({ tipe: "err", pesan: "Gagal menyimpan plafon" });
    } finally {
      setSedang(null);
    }
  }

  return (
    <div style={{
      // --w-page — satu tabel plafon per asisten. Tanpa container, isi halaman ini melebar
      // mengikuti induknya: diukur 1080px di layar 1600px sementara
      // halaman lain 1380px — terlihat seperti dua aplikasi berbeda.
      padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
      width: "100%", maxWidth: "var(--w-page)", margin: "0 auto",
      display: "grid", gap: 16,
    }}>
      <KepalaHalaman
        judul="Plafon Persetujuan Asisten"
        keterangan="Sampai berapa tiap orang boleh menyetujui lewat asisten, tanpa membuka aplikasi."
              ikon={<ShieldCheck size={19} />}
      />

      {/*
        Penjelasan yang menahan salah paham paling mahal di halaman ini —
        kini berbentuk panduan, bukan kartu.

        Isinya tidak berubah (dua salah paham itu tetap yang paling mahal);
        yang berubah: ia mendahului tabel sebagai PEMBUKA, bukan berdiri
        sebagai kartu yang bobot visualnya setara dengan tabel yang harus
        diisi. Ditambah urutan langkah — tabel 20 baris "belum diatur" tak
        menyatakan apa pun tentang siapa yang sebaiknya diisi lebih dulu.
      */}
      <PanduanHalaman
        untuk={
          <>
            <strong>Plafon ini tidak menambah wewenang, ia hanya membatasi.</strong> Orang tetap
            harus berhak menyetujui lewat rantai persetujuan yang biasa — plafon menentukan sampai
            nominal berapa persetujuan itu boleh dilakukan lewat asisten, alih-alih harus membuka
            aplikasi.
          </>
        }
        langkah={[
          { teks: "Isi plafon hanya untuk orang yang memang sudah jadi penyetuju di rantai persetujuan" },
          { teks: "Mulai dari nominal kecil — plafon bisa dinaikkan kapan saja setelah terbiasa" },
          { teks: "Biarkan kosong untuk yang tak perlu menyetujui lewat WhatsApp" },
        ]}
        catatan={
          <>
            Belum diatur berarti <strong>tidak bisa sama sekali</strong>, bukan tak terbatas.
            Dokumen yang nominalnya tidak diketahui juga selalu ditolak — ia harus dibuka di
            aplikasi.
          </>
        }
      />

      <div style={{ ...GAYA_KARTU, overflow: "hidden" }}>
        {memuat ? (
          <div style={{ padding: 24, color: C.muted, fontSize: 14 }}>Memuat…</div>
        ) : baris.length === 0 ? (
          <div style={{ padding: 24, color: C.muted, fontSize: 14 }}>
            Belum ada anggota perusahaan.
          </div>
        ) : (
          <Tabel
            caption="Plafon persetujuan lewat asisten per anggota perusahaan."
            data={baris}
            kunciBaris={(b) => b.user_id}
            kolom={[
              {
                kunci: "nama",
                judul: "Nama",
                // Nama adalah yang MEMILIKI baris ini. Tanpa `kepalaBaris`,
                // pembaca layar membacakan nominal plafon tanpa menyebut
                // plafon siapa — dan angka tanpa pemilik tak bisa dipakai
                // untuk apa pun.
                kepalaBaris: true,
                render: (b) => (
                  <>
                    <div style={{ fontWeight: 500, color: C.text }}>{b.nama}</div>
                    <div style={{ fontSize: 12, color: C.muted }}>{b.email}</div>
                  </>
                ),
              },
              {
                kunci: "peran",
                judul: "Peran",
                render: (b) => (
                  <span style={{ color: C.muted, whiteSpace: "nowrap" }}>{b.peran || "—"}</span>
                ),
              },
              {
                kunci: "plafon",
                judul: "Plafon",
                rata: "kanan",
                render: (b) => {
                  const nilaiDraf = draf[b.user_id];
                  const berubah = nilaiDraf !== undefined;
                  if (!bolehUbah) {
                    return b.batas_idr === null ? (
                      <span style={{ color: C.muted }}>belum diatur</span>
                    ) : (
                      <span style={{ fontWeight: 600, color: C.text }}>{rupiah(b.batas_idr)}</span>
                    );
                  }
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: C.muted, fontSize: 13 }}>Rp</span>
                      <input
                        className="isian-fokus"
                        style={input}
                        inputMode="numeric"
                        aria-label={`Plafon untuk ${b.nama}`}
                        placeholder={b.sudah_diatur ? "" : "belum diatur"}
                        value={
                          berubah
                            ? nilaiDraf
                            : b.batas_idr === null
                              ? ""
                              : b.batas_idr.toLocaleString("id-ID")
                        }
                        onChange={(e) => setDraf((d) => ({ ...d, [b.user_id]: e.target.value }))}
                      />
                    </span>
                  );
                },
              },
              {
                kunci: "aksi",
                judul: "",
                render: (b) => {
                  if (!bolehUbah || draf[b.user_id] === undefined) return null;
                  return (
                    <button
                      onClick={() => simpan(b)}
                      disabled={sedang === b.user_id}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: C.aksen,
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: sedang === b.user_id ? "wait" : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sedang === b.user_id ? "Menyimpan…" : "Simpan"}
                    </button>
                  );
                },
              },
            ]}
          />
        )}
      </div>

      {!bolehUbah && (
        <div style={{ fontSize: 13, color: C.muted, display: "flex", gap: 8, alignItems: "center" }}>
          <ShieldCheck size={14} />
          Anda hanya dapat melihat. Mengubah plafon butuh izin{" "}
          <code style={{ fontSize: 12 }}>settings:ai:batas</code>.
        </div>
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
            maxWidth: 380,
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
