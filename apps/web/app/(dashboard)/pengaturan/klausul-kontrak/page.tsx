"use client";

/**
 * KLAUSUL DOKUMEN — menyunting bunyi pasal tanpa rilis kode.
 *
 * ⚠ Sejak 2026-08-19 (migrasi 465) layar ini melayani TIGA jenis kertas:
 * kontrak, SPK, dan berita acara. Sebelumnya hanya kontrak.
 *
 * Diukur saat itu: `spk.ts` punya NOL rujukan ke klausul, sementara
 * `contracts.ts` sudah membacanya dari tenant di empat tempat sejak migrasi
 * 450. Akibatnya tiap perusahaan menerbitkan SPK dengan syarat yang ditulis
 * pembuat aplikasi, bukan penasihat hukumnya.
 *
 * Satu layar untuk tiga jenis, bukan tiga layar: yang membedakan klausul
 * kontrak dari klausul SPK bukan cara menyuntingnya — keduanya nomor, judul,
 * isi — melainkan untuk kertas apa ia dicetak. Tiga layar berarti tiga tempat
 * memperbaiki bug yang sama, dan yang ketiga selalu tertinggal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA LAYAR INI ADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Migrasi 450 memindahkan klausul dari kode ke basis. Tapi "kolom DB sudah
 * ada" BUKAN selesai (CHARTER §8): tanpa layar, satu-satunya cara mengubah
 * bunyi pasal tetap SQL langsung ke basis produksi — persis yang hendak
 * dihindari saat memindahkannya dari kode.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * DUA HAL YANG HARUS TERLIHAT, DAN KENAPA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 1. ASAL tiap pasal — bawaan produk atau sudah ditimpa perusahaan ini.
 *    Tanpa itu, "sudah saya ubah kok tak berubah di kontrak" jadi keluhan
 *    yang tak bisa dijawab tanpa membuka basis.
 *
 * 2. Pasal yang DIRAKIT SISTEM disebutkan, bukan didiamkan. Yang membuka
 *    layar ini akan mencari "PASAL 3 NILAI KONTRAK" dan tak menemukannya;
 *    tanpa penjelasan ia menyimpulkan pasalnya hilang dari kontrak.
 *
 * ── Kenapa "Pulihkan bawaan", bukan "Hapus"
 *
 * Menghapus pasal sama sekali tidak disediakan. Menyembunyikan pasal
 * penyelesaian sengketa dari kontrak harus jadi tindakan yang disengaja dan
 * terlihat — bukan efek samping dari menekan tombol berlabel "hapus".
 *
 * Yang terjadi saat dipulihkan: timpaan dinonaktifkan, bunyi bawaan kembali
 * dipakai, riwayatnya tetap tersimpan.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Scale, Pencil, RotateCcw, Lock, Info, Loader2, Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, Rangka, Galat, Tombol, Medan, gayaInput, Lencana,
} from "@/components/dasar";
import { DialogBersama } from "@/components/dialog-bersama";

interface Klausul {
  nomor: string;
  judul: string;
  isi: string;
  urutan: number;
  asal: "bawaan" | "tenant";
  id: string | null;
  versi: number | null;
  bisa_diubah: boolean;
}

interface Muatan {
  klausul: Klausul[];
  jenis: JenisDokumen;
  dirakit_kode: readonly string[];
  /** `null` untuk SPK & berita acara — keduanya tak punya pasal dirakit kode. */
  catatan_dirakit: string | null;
}

/**
 * Jenis dokumen yang punya klausul (migrasi 465).
 *
 * ── Kenapa layar ini melayani tiga jenis, bukan tiga layar
 *
 * Yang membedakan klausul kontrak dari klausul SPK bukan cara menyuntingnya —
 * keduanya: nomor, judul, isi. Yang berbeda cuma untuk kertas apa ia
 * dicetak. Tiga layar berarti tiga tempat memperbaiki bug yang sama, dan
 * yang ketiga selalu tertinggal.
 */
type JenisDokumen = "kontrak" | "spk" | "berita_acara";

const JENIS: { nilai: JenisDokumen; label: string; kertas: string }[] = [
  { nilai: "kontrak", label: "Kontrak", kertas: "kontrak kerja dengan pemberi kerja" },
  { nilai: "spk", label: "SPK", kertas: "surat perintah kerja ke subkontraktor" },
  { nilai: "berita_acara", label: "Berita Acara", kertas: "berita acara pemeriksaan pekerjaan" },
];

export default function HalamanKlausulKontrak() {
  const [jenis, setJenis] = useState<JenisDokumen>("kontrak");
  const { data, memuat, galat: galatMuat, muatUlang } =
    useData<Muatan>(`/api/v1/klausul-kontrak?jenis=${jenis}`);

  const [sunting, setSunting] = useState<Klausul | null>(null);
  const [judul, setJudul] = useState("");
  const [isi, setIsi] = useState("");
  const [sibuk, setSibuk] = useState(false);
  // Galat AKSI terpisah dari galat MUAT: gagal menyimpan tak boleh menghapus
  // pesan "gagal memuat", dan sebaliknya.
  const [galatAksi, setGalatAksi] = useState<string | null>(null);
  const [kabar, setKabar] = useState<string | null>(null);

  const klausul = useMemo(() => data?.klausul ?? [], [data]);
  const galat = galatMuat ? "Gagal memuat klausul kontrak." : null;

  const buka = useCallback((k: Klausul) => {
    setSunting(k);
    setJudul(k.judul);
    setIsi(k.isi);
    setGalatAksi(null);
  }, []);

  async function simpan() {
    if (!sunting) return;
    setSibuk(true);
    setGalatAksi(null);
    try {
      // `jenis` IKUT — tanpa itu rutenya jatuh ke bawaan `kontrak`, dan
      // menyunting syarat SPK diam-diam mengubah pasal kontrak yang sudah
      // ditandatangani orang.
      await api.put(`/api/v1/klausul-kontrak/${sunting.nomor}`, {
        judul, isi, urutan: sunting.urutan, jenis,
      });
      setSunting(null);
      setKabar(`Pasal ${sunting.nomor} disimpan. Kontrak baru akan memakai bunyi ini.`);
      void muatUlang();
    } catch (e) {
      setGalatAksi(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal menyimpan klausul.",
      );
    } finally {
      setSibuk(false);
    }
  }

  async function pulihkan(k: Klausul) {
    setSibuk(true);
    setGalatAksi(null);
    try {
      await api.delete(`/api/v1/klausul-kontrak/${k.nomor}?jenis=${jenis}`);
      setKabar(`Pasal ${k.nomor} kembali memakai bunyi bawaan. Riwayat suntingan tetap tersimpan.`);
      void muatUlang();
    } catch (e) {
      setGalatAksi(
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Gagal memulihkan bawaan.",
      );
    } finally {
      setSibuk(false);
    }
  }

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<Scale size={20} aria-hidden="true" />}
        judul="Klausul Dokumen"
        keterangan={<>Bunyi pasal yang tercetak di dokumen resmi perusahaan ini. Yang
          belum disunting memakai <strong>bawaan produk</strong> — dan bawaan itu selalu
          ikut tercetak, jadi dokumen tak pernah terbit tanpa dasar hukumnya.</>}
      />

      {/* Pemilih jenis dokumen (migrasi 465).

          Tiap kertas punya syaratnya sendiri: kontrak mengatur hubungan dengan
          pemberi kerja, SPK memerintah subkontraktor, berita acara mencatat
          pemeriksaan. Meminjamkan pasal kontrak ke SPK menghasilkan kertas yang
          TERLIHAT lengkap dan berbunyi salah. */}
      {/* `aria-pressed`, BUKAN `peran ARIA tab` — ditunjukkan penjaga
          `audit-tab-seragam.mjs`, dan penjaganya benar: ini SARINGAN atas satu
          daftar, bukan navigasi antar-bagian halaman. Memakai `peran ARIA tab`
          menjanjikan panel-per-tab kepada pembaca layar, lalu tak
          menyediakannya. */}
      <div role="group" aria-label="Jenis dokumen"
        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {JENIS.map((j) => {
          const aktif = j.nilai === jenis;
          return (
            <button
              key={j.nilai}
              type="button"
              aria-pressed={aktif}
              onClick={() => { setJenis(j.nilai); setSunting(null); setGalatAksi(null); setKabar(null); }}
              style={{
                padding: "7px 13px", fontSize: 13, borderRadius: 8, cursor: "pointer",
                fontWeight: aktif ? 700 : 500,
                border: `1px solid ${aktif ? C.text : C.border}`,
                background: aktif ? C.text : "transparent",
                color: aktif ? "var(--surface)" : C.text,
                // Penanda aktif tak boleh warna SAJA (WCAG 1.4.1): tebal huruf
                // di atas + tanda centang di bawah menandainya dua kali lagi.
              }}
            >
              {aktif ? `✓ ${j.label}` : j.label}
            </button>
          );
        })}
      </div>

      {/* Kertas yang sedang disunting DINYATAKAN. Tanpa itu, orang yang
          berpindah tab lalu terganggu sejenak akan menyunting pasal kertas yang
          salah — dan tak ada satu pun tanda di layar bahwa ia salah tempat. */}
      <p style={{ margin: 0, fontSize: 12.5, color: C.mid }}>
        Pasal di bawah ini tercetak di{" "}
        <strong style={{ color: C.text }}>
          {JENIS.find((j) => j.nilai === jenis)?.kertas}
        </strong>.
      </p>

      {galat && <Galat pesan={galat} onCobaLagi={() => void muatUlang()} />}
      {galatAksi && (
        <div role="alert" style={{
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
          color: "var(--danger)",
        }}>{galatAksi}</div>
      )}
      {kabar && !galatAksi && (
        <div role="status" style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "10px 14px", borderRadius: 10, fontSize: 13,
          border: "1px solid var(--success-border)", background: "var(--success-bg)",
          color: "var(--success)",
        }}>
          <Check size={15} aria-hidden="true" />{kabar}
        </div>
      )}

      {/* Pasal yang dirakit sistem DISEBUTKAN. Yang mencarinya di daftar dan
          tak menemukannya akan menyimpulkan pasalnya hilang dari kontrak. */}
      {data && data.dirakit_kode.length > 0 && data.catatan_dirakit && (
        <div style={{
          display: "flex", gap: 9, alignItems: "flex-start",
          padding: "11px 14px", borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
          border: `1px solid ${C.border}`, background: "var(--surface-subtle)", color: C.mid,
        }}>
          <Info size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong style={{ color: C.text }}>
              Pasal {data.dirakit_kode.join(", ")} tidak muncul di sini.
            </strong>{" "}
            {data.catatan_dirakit}
          </span>
        </div>
      )}

      {memuat && klausul.length === 0 && <Rangka tinggi={92} jumlah={6} />}

      <div style={{ display: "grid", gap: 12 }}>
        {klausul.map((k) => (
          <Kartu key={k.nomor} pad="sedang">
            <div style={{
              display: "flex", gap: 12, alignItems: "flex-start",
              justifyContent: "space-between", flexWrap: "wrap",
            }}>
              <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                    Pasal {k.nomor} — {k.judul}
                  </h2>
                  {k.asal === "tenant"
                    ? <Lencana nada="info">disunting{k.versi ? ` · v${k.versi}` : ""}</Lencana>
                    : <Lencana nada="netral">bawaan</Lencana>}
                </div>
                <p style={{
                  fontSize: 12.5, color: C.mid, lineHeight: 1.6, margin: "6px 0 0",
                }}>{k.isi}</p>
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {k.bisa_diubah ? (
                  <>
                    <Tombol jenis="sekunder" kecil ikon={<Pencil size={13} />}
                      onClick={() => buka(k)}>Sunting</Tombol>
                    {k.asal === "tenant" && (
                      <Tombol jenis="sekunder" kecil ikon={<RotateCcw size={13} />}
                        disabled={sibuk}
                        onClick={() => void pulihkan(k)}>Pulihkan bawaan</Tombol>
                    )}
                  </>
                ) : (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    fontSize: 12, color: C.muted,
                  }}>
                    <Lock size={13} aria-hidden="true" /> dirakit sistem
                  </span>
                )}
              </div>
            </div>
          </Kartu>
        ))}
      </div>

      <DialogBersama
        terbuka={sunting !== null}
        onTutup={() => setSunting(null)}
        judul={sunting ? `Sunting Pasal ${sunting.nomor}` : ""}
        kaki={
          <Tombol jenis="utama" onClick={() => void simpan()}
            disabled={sibuk || judul.trim() === "" || isi.trim() === ""}
            ikon={sibuk ? <Loader2 size={14} className="animate-spin" /> : undefined}>
            {sibuk ? "Menyimpan…" : "Simpan"}
          </Tombol>
        }
      >
        <div style={{ display: "grid", gap: 12 }}>
          <Medan id="klausul-judul" label="Judul pasal" wajib anak={
            <input id="klausul-judul" value={judul} onChange={(e) => setJudul(e.target.value)}
              style={gayaInput} />
          } />
          <Medan
            id="klausul-isi"
            label="Bunyi pasal"
            wajib
            keterangan={"Yang disimpan menjadi versi baru; versi lama TIDAK dihapus. "
              + "Kontrak yang sudah ditandatangani harus tetap bisa dicetak ulang persis "
              + "seperti saat ditandatangani."}
            anak={
              <textarea id="klausul-isi" value={isi} onChange={(e) => setIsi(e.target.value)}
                rows={9}
                style={{ ...gayaInput, resize: "vertical", lineHeight: 1.6 }} />
            }
          />
        </div>
      </DialogBersama>
    </Halaman>
  );
}
