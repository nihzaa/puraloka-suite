"use client";

/**
 * Isi halaman satu asisten — dipakai keempat sub-halaman.
 *
 * Dibuat sebagai komponen, bukan disalin empat kali: sebelum pemecahan,
 * keempat asisten dirender dari SATU `.map()`, jadi perilakunya dijamin sama.
 * Menyalin JSX-nya ke empat berkas akan membuang jaminan itu — dan cacat yang
 * lahir dari situ (satu halaman lupa `disabled`, satu lagi memakai label
 * berbeda) tak akan terlihat sampai seseorang membandingkannya berdampingan.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { PanduanHalaman } from "@/components/panduan-halaman";
import {
  PAKAI_TOOL,
  PERAN,
  type Konfigurasi,
  type Muatan,
} from "./tipe";

export function KartuAsisten({ asisten }: { asisten: string }) {
  const bolehKelola = useIzin("settings:ai:manage");

  const [muatan, setMuatan] = useState<Muatan | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [draf, setDraf] = useState<Partial<Konfigurasi>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [toast, setToast] = useState<{ tipe: "ok" | "salah"; pesan: string } | null>(null);

  const ambil = useCallback(async () => {
    setMemuat(true);
    setGalat(null);
    try {
      const r = await api.get<Muatan>("/api/v1/ai/config");
      setMuatan(r.data);
    } catch {
      // Kegagalan muat DITAMPILKAN, bukan jadi halaman kosong: kartu kosong
      // tak bisa dibedakan dari "belum pernah diatur", dan orang akan mengira
      // pengaturannya hilang.
      setGalat("Konfigurasi asisten tidak bisa dimuat.");
    } finally {
      setMemuat(false);
    }
  }, []);

  // `queueMicrotask`, bukan panggilan langsung: `ambil()` menyetel state
  // pemuatan di baris pertamanya, dan setState SINKRON di dalam effect memicu
  // render kedua sebelum yang pertama selesai (react-hooks/set-state-in-effect).
  useEffect(() => { queueMicrotask(() => { void ambil(); }); }, [ambil]);

  const asli = (muatan?.data ?? []).find((k) => k.asisten === asisten);
  const k = asli ? { ...asli, ...draf } : null;
  const berubah = Object.keys(draf).length > 0;
  const nama = PERAN[asisten] ?? asisten;
  const pakaiTool = PAKAI_TOOL.has(asisten);

  async function simpan() {
    if (!asli || !k) return;
    setMenyimpan(true);
    try {
      await api.put(`/api/v1/ai/config/${asisten}`, {
        prompt_sistem: k.prompt_sistem,
        maks_ronde: k.maks_ronde,
        tool_aktif: k.tool_aktif,
      });
      setDraf({});
      await ambil();
      setToast({ tipe: "ok", pesan: `Perilaku ${nama} tersimpan` });
    } catch (e) {
      const p = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setToast({ tipe: "salah", pesan: p ?? "Gagal menyimpan" });
    } finally {
      setMenyimpan(false);
    }
  }

  if (memuat) {
    return (
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
        Memuat…
      </div>
    );
  }

  if (galat || !k) {
    return (
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", color: C.danger, fontSize: 13 }}>
        {galat ?? `Asisten "${asisten}" tidak ditemukan dalam konfigurasi.`}
      </div>
    );
  }

  // NULL = semua tool yang berizin. Ditampilkan tercentang semua supaya
  // keadaan "belum diatur" terlihat sebagaimana ia berlaku.
  const aktif = k.tool_aktif;
  const semuaAktif = aktif === null;

  const jmlTool = muatan?.tool_tersedia?.length ?? 0;
  const jmlAktif = semuaAktif ? jmlTool : (aktif?.length ?? 0);

  return (
    <>
      {/*
        Panduan mendahului kontrol.

        Sebelumnya halaman ini dibuka langsung dengan textarea "Instruksi
        tambahan" yang kosong — kontrol paling abstrak di seluruh halaman
        berdiri paling depan, tanpa satu kalimat pun yang menyatakan apa yang
        sedang diatur. Founder menyebutnya "menerka-nerka", dan itu tepat.
      */}
      <PanduanHalaman
        untuk={
          <>
            Halaman ini mengatur <strong>cara {nama} menjawab</strong>: gaya bahasanya, seberapa
            dalam ia boleh menggali data, dan data mana yang boleh ia baca.
            {pakaiTool
              ? " Modelnya sendiri (dan batas biayanya) diatur di halaman Penyedia AI."
              : " Asisten ini tidak memakai tool — ia hanya mengolah angka yang sudah dihitung sistem."}
          </>
        }
        langkah={
          pakaiTool
            ? [
                { teks: "Tulis instruksi tambahan bila ada gaya jawaban yang Anda inginkan — boleh dikosongkan", selesai: Boolean(k.prompt_sistem) },
                { teks: "Tentukan batas langkah: makin banyak, makin dalam galiannya, makin mahal tiap pertanyaan" },
                {
                  teks: `Centang data yang boleh dibaca — sekarang ${jmlAktif} dari ${jmlTool}`,
                  selesai: jmlAktif > 0,
                },
              ]
            : [
                { teks: "Tulis instruksi tambahan bila ada gaya jawaban yang Anda inginkan — boleh dikosongkan", selesai: Boolean(k.prompt_sistem) },
              ]
        }
        catatan={
          pakaiTool
            ? "Mencentang data di sini tidak memberi wewenang baru kepada siapa pun: penanya tetap hanya melihat yang memang boleh ia lihat. Yang tak dicentang tak akan dibaca asisten sama sekali."
            : undefined
        }
      />

    <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
      {/*
        Nama & keterangan asisten TIDAK diulang di sini — keduanya sudah jadi
        judul halaman (`layout.tsx` memilihnya dari rute). Versi pertama
        menampilkan keduanya, dan hasilnya "Asisten web" berikut kalimat yang
        sama persis muncul dua kali berjarak 40px. Pengulangan sedekat itu
        membuat pembaca mengira ia salah lihat, bukan memperjelas.
      */}
      <div style={{ marginBottom: 14 }}>
        <label htmlFor="prompt" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
          Instruksi tambahan
        </label>
        <textarea
          className="isian-fokus"
          id="prompt"
          aria-label={`Instruksi tambahan untuk ${nama}`}
          rows={3}
          maxLength={8000}
          placeholder="Mis. sebut nilai dalam jutaan rupiah, dan selalu urutkan dari yang paling mendesak."
          value={k.prompt_sistem ?? ""}
          disabled={!bolehKelola}
          onChange={(e) => setDraf((d) => ({ ...d, prompt_sistem: e.target.value || null }))}
          style={{ ...GAYA_ISIAN, resize: "vertical", lineHeight: 1.6 }}
        />
        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
          Ditambahkan di bawah instruksi bawaan, tidak menggantikannya. Dikirim ulang tiap
          langkah — instruksi panjang menambah biaya tiap pertanyaan.
        </p>
      </div>

      {pakaiTool ? (
        <>
          {/*
            Isian dan penjelasnya BERDAMPINGAN, bukan bertumpuk dalam kolom
            200px.

            Bentuk sebelumnya membungkus label, input, DAN kalimat penjelas
            dalam satu kotak selebar 200px. Di halaman selebar `--w-page`,
            hasilnya terlihat di tangkapan layar: kalimat tiga baris sempit
            berdiri sendirian di kiri dengan pita kosong selebar layar di
            sampingnya — dan pita itu membuat "Batas langkah" tampak terputus
            dari "Data yang boleh dibaca" di bawahnya.

            Yang memang perlu sempit hanya kotak angkanya. Penjelasnya
            mengambil sisa ruang, dengan batas baca ~60ch supaya ia tak ikut
            memanjang melewati kenyamanan mata.
          */}
          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ronde" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
              Batas langkah
            </label>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              <input
                className="isian-fokus"
                id="ronde"
                aria-label={`Batas langkah untuk ${nama}`}
                type="number"
                min={1}
                max={12}
                value={k.maks_ronde}
                disabled={!bolehKelola}
                onChange={(e) => setDraf((d) => ({ ...d, maks_ronde: Number(e.target.value) }))}
                style={{ ...GAYA_ISIAN, width: 110, flexShrink: 0 }}
              />
              <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 0", maxWidth: "60ch" }}>
                Berapa kali asisten boleh membaca data sebelum wajib menjawab. Tiap langkah
                ditagih.
              </p>
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 550, color: C.mid, margin: "0 0 6px" }}>
              Data yang boleh dibaca
            </p>
            {/*
              Daftar 15 tool jadi DUA KOLOM di layar lebar.

              Satu kolom di halaman selebar `--w-page` berarti 15 baris
              menuntut gulir panjang sementara separuh layar kosong — dan
              memutuskan tool mana yang dimatikan justru menuntut melihat
              daftarnya sekaligus, bukan sepotong demi sepotong.

              `auto-fit` + `minmax(340px, 1fr)`: turun sendiri jadi satu kolom
              di layar sempit, tanpa media query. 340px adalah lebar terkecil
              yang masih memuat nama tool + keterangannya tanpa membungkus
              tiap dua kata.
            */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
                gap: "10px 24px",
                alignItems: "start",
              }}
            >
              {(muatan?.tool_tersedia ?? []).map((tool) => {
                const dicentang = semuaAktif || (aktif?.includes(tool.nama) ?? false);
                return (
                  <label
                    key={tool.nama}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 8,
                      fontSize: 12.5, color: C.text, lineHeight: 1.55,
                      cursor: bolehKelola ? "pointer" : "default",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={dicentang}
                      disabled={!bolehKelola}
                      onChange={(e) => {
                        // Dari NULL, pencentangan pertama harus MEMBEKUKAN
                        // keadaan "semua" jadi daftar nyata — kalau tidak,
                        // mematikan satu tool terbaca sebagai mematikan
                        // semuanya.
                        const dasar = semuaAktif
                          ? (muatan?.tool_tersedia ?? []).map((x) => x.nama)
                          : [...(aktif ?? [])];
                        const baru = e.target.checked
                          ? [...new Set([...dasar, tool.nama])]
                          : dasar.filter((n) => n !== tool.nama);
                        setDraf((d) => ({ ...d, tool_aktif: baru }));
                      }}
                      style={{ marginTop: 3, cursor: bolehKelola ? "pointer" : "default" }}
                    />
                    {/*
                      LABEL manusia jadi judul, kunci teknis turun jadi
                      keterangan kecil.

                      Sebelumnya `tool.nama` mentah (`daftar_proyek`,
                      `ringkas_keuangan`) yang berdiri di posisi judul —
                      pembacanya harus menerjemahkan snake_case lebih dulu
                      sebelum bisa memutuskan mencentang atau tidak. Untuk
                      pengguna berliterasi digital rendah itu bukan
                      ketidaknyamanan kecil, itu pintu yang tak bisa dibuka.

                      Kuncinya TIDAK dibuang: yang membaca audit log atau
                      dokumentasi API masih butuh jembatannya.
                    */}
                    <span>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 550, color: C.text }}>
                        {tool.label ?? tool.nama}
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, color: C.muted, lineHeight: 1.5, marginTop: 1 }}>
                        {tool.keterangan}
                      </span>
                      {/*
                        TANPA `opacity`. Versi pertama memakai `opacity: 0.75`
                        di atas `--text-muted`, dan audit a11y runtime
                        menolaknya: 6 node gagal kontras WCAG AA di tiga
                        halaman asisten.

                        Yang salah bukan ukurannya melainkan cara
                        meredupkannya — `opacity` menurunkan kontras terhadap
                        latar tanpa memberi tahu siapa pun. Kunci teknis boleh
                        tampil lebih tenang dari judulnya, tetapi tetap harus
                        terbaca oleh mata yang membutuhkannya.
                      */}
                      <code style={{ fontSize: 11, color: C.muted }}>{tool.nama}</code>
                    </span>
                  </label>
                );
              })}
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
              Mematikan semuanya membuat asisten tetap menjawab, tetapi tanpa membaca data apa
              pun. Pengguna juga tetap butuh izinnya masing-masing — mencentang di sini tidak
              memberi akses baru.
            </p>
          </div>
        </>
      ) : (
        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: 0 }}>
          Asisten ini tidak memakai tool — ia menulis dari angka yang sudah dihitung sistem,
          jadi batas langkah dan pilihan data tidak berlaku.
        </p>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 14 }}>
        {toast && (
          <span
            role="status"
            style={{ fontSize: 12, color: toast.tipe === "ok" ? C.green : C.danger }}
          >
            {toast.pesan}
          </span>
        )}
        <button
          type="button"
          onClick={simpan}
          disabled={!bolehKelola || !berubah || menyimpan}
          style={tombolSimpan(bolehKelola && berubah)}
        >
          {menyimpan ? <Loader2 size={14} className="berputar" /> : <Save size={14} />}
          Simpan
        </button>
      </div>
    </section>
    </>
  );
}

function tombolSimpan(hidup: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "8px 14px", borderRadius: "var(--radius-sm)",
    border: "none",
    background: hidup ? C.navy : "var(--surface-subtle)",
    color: hidup ? "#fff" : C.muted,
    fontSize: 13, fontWeight: 600,
    cursor: hidup ? "pointer" : "not-allowed",
    fontFamily: "inherit",
  };
}
