"use client";

/**
 * PENGATURAN → ASISTEN → LAPISAN AI
 *
 * ══════════════════════════════════════════════════════════════════════════
 * YANG TERSISA DI HALAMAN INI, DAN KENAPA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Sampai 2026-08-11 halaman ini memuat SELURUHNYA — pengaturan global plus
 * keempat asisten berurutan, setinggi **4.566 px**. Founder memilih mengikuti
 * pemisahan TJS ("tetap ikuti TJS biar lebih enak"), dan alasannya bukan
 * selera: keempat asisten adalah kanal berbeda, bukan varian satu sama lain
 * (lihat `_bersama/tipe.ts`).
 *
 * Yang tinggal di sini hanya yang berlaku untuk SEMUANYA:
 *
 *   saklar AI     mematikan seluruh panggilan AI untuk perusahaan ini
 *   retensi       berapa lama riwayat percakapan disimpan
 *
 * Keduanya milik tenant, bukan milik satu asisten — menaruhnya di salah satu
 * halaman asisten akan membuat orang mengira ia hanya mematikan asisten itu.
 *
 * ── "SEMUANYA BISA DIKONFIGURASI DI UI, GAADA YANG HARDCODE"
 *
 * Arahan founder 2026-08-10. Yang dulu dipaku di kode dan kini ada di UI:
 * prompt (dulu di `routes/v1/ai-chat.ts`), maks ronde (dulu konstanta di
 * `lib/ai-loop.ts`), dan tool aktif (dulu seluruh katalog selalu ditawarkan).
 * Ketiganya kini di halaman per-asisten.
 *
 * Yang ketiga paling menggigit: sebelum itu, "matikan akses stok untuk
 * asisten" hanya bisa dilakukan dengan mencabut `gudang:view` — yang sekaligus
 * menyembunyikan halaman Gudang dari orangnya. Konfigurasi yang memaksa
 * merusak hal lain bukan konfigurasi.
 *
 * ── Sifat read-only ada di LAYOUT, bukan di sini
 *
 * Ia berlaku untuk keempat asisten; mengulangnya per-halaman berarti empat
 * salinan yang pelan-pelan berbeda.
 */

import { useCallback, useState } from "react";
import { Loader2, Power, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/data-cache";
import { useIzin } from "@/lib/use-izin";
import { C } from "@/lib/warna-ui";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";
import { PanduanHalaman } from "@/components/panduan-halaman";
import type { PengaturanTenant } from "./_bersama/tipe";
import { Saklar } from "@/components/saklar";

export default function LapisanAiPage() {
  const bolehKelola = useIzin("settings:ai:manage");

  const [draf, setDraf] = useState<Partial<PengaturanTenant>>({});
  const [menyimpan, setMenyimpan] = useState(false);
  const [toast, setToast] = useState<{ tipe: "ok" | "salah"; pesan: string } | null>(null);

  /*
    PINDAH KE LAPIS CACHE BERSAMA (2026-08-17).

    `useData` menggantikan useState+useCallback+useEffect+queueMicrotask.
    `/ai/pengaturan` dibaca beberapa layar asisten; tanpa lapis cache tiap
    perpindahan mengambilnya ulang, dan dua komponen yang membutuhkannya
    bersamaan mengirim dua permintaan.

    `toast` (hasil AKSI simpan) tetap TERPISAH dari `galat` (gagal MUAT) —
    penjaga `uji-galat-muat-terpisah` menuntutnya, dan alasannya nyata:
    gagal menyimpan yang menimpa pesan gagal memuat membuat orang menekan
    simpan berulang kali pada layar yang datanya memang tak pernah datang.
  */
  const { data: tenant, memuat, galat: galatMuat, muatUlang } =
    useData<PengaturanTenant>("/api/v1/ai/pengaturan");
  const galat = galatMuat ? "Pengaturan AI tidak bisa dimuat." : null;

  const ambil = useCallback(async () => { await muatUlang(); }, [muatUlang]);

  const t = tenant ? { ...tenant, ...draf } : null;
  const berubah = Object.keys(draf).length > 0;

  async function simpan() {
    if (!t) return;
    setMenyimpan(true);
    try {
      await api.put("/api/v1/ai/pengaturan", {
        ai_aktif: t.ai_aktif,
        retensi_hari: t.retensi_hari,
      });
      setDraf({});
      await ambil();
      setToast({ tipe: "ok", pesan: "Pengaturan tersimpan" });
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

  if (galat || !t) {
    return (
      <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", color: C.danger, fontSize: 13 }}>
        {galat ?? "Pengaturan tidak tersedia."}
      </div>
    );
  }

  return (
    <>
      <PanduanHalaman
        untuk={
          <>
            Dua pengaturan di halaman ini berlaku untuk <strong>semua asisten</strong> sekaligus —
            asisten pemilik, staf, web, dan wawasan portofolio. Perilaku masing-masing diatur di
            tab sebelah.
          </>
        }
        langkah={[
          { teks: "Pastikan asisten dinyalakan di sini", selesai: t.ai_aktif },
          {
            teks: "Tentukan berapa lama riwayat percakapan disimpan",
            selesai: t.retensi_hari != null,
          },
          { teks: "Atur perilaku tiap asisten di tab sebelah — prompt, batas langkah, dan data yang boleh dibaca" },
        ]}
        catatan="Mematikan saklar di sini tidak mencabut izin siapa pun dan tidak menyembunyikan halaman mana pun — asisten hanya berhenti menjawab."
      />

      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Power size={16} style={{ color: C.mid }} />
        <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: 0 }}>
          Lapisan AI
        </h2>
      </div>

      {/* Saklar bersama — hidup/mati, bukan daftar pilihan. Dua bentuk resmi
          sejak 2026-08-15: kartu untuk memilih dari daftar, saklar untuk
          hidup/mati. */}
      <Saklar
        nyala={t.ai_aktif}
        nonaktif={!bolehKelola}
        onUbah={(v) => setDraf((d) => ({ ...d, ai_aktif: v }))}
        label="Asisten AI aktif untuk perusahaan ini"
        ringkas="Mematikannya menghentikan seluruh panggilan AI tanpa menyentuh modul lain — tak ada permission yang dicabut, tak ada halaman yang hilang."
      />

      {t.ai_aktif === false && (
        <div
          style={{
            marginTop: 12, padding: "var(--pad-kartu)", borderRadius: 8,
            background: "var(--danger-bg)", border: "1px solid var(--danger)",
            fontSize: 12.5, color: C.text, lineHeight: 1.6,
          }}
        >
          Asisten sedang <strong>dimatikan</strong>. Halaman tiap asisten tetap bisa dibuka dan
          diatur, tetapi setiap pertanyaan akan ditolak.
        </div>
      )}

      {/*
        `maxWidth` SENGAJA tidak mengurung teksnya. Versi pertama membungkus
        label, input, DAN kalimat penjelas dalam satu kotak selebar 280px — dan
        penjelasnya jadi empat baris sempit yang berdiri sendirian di kiri,
        terlihat seperti kolom yang salah tempat. Yang perlu sempit hanya input
        angkanya.
      */}
      <div style={{ marginTop: 16 }}>
        <label htmlFor="retensi" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
          Simpan riwayat percakapan
        </label>
        {/*
          Isian dan penjelasnya berdampingan — sama alasannya dengan "Batas
          langkah" di `kartu-asisten.tsx`: di halaman lebar, penjelas yang
          berdiri sendiri di bawah kotak sempit meninggalkan pita kosong
          selebar layar.
        */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <input
              className="isian-fokus"
              id="retensi"
              type="number"
              min={1}
              max={3650}
              placeholder="Selamanya"
              value={t.retensi_hari ?? ""}
              disabled={!bolehKelola}
              onChange={(e) =>
                setDraf((d) => ({
                  ...d,
                  retensi_hari: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
              style={{ ...GAYA_ISIAN, width: 120 }}
            />
            <span style={{ fontSize: 13, color: C.mid }}>hari</span>
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 0", maxWidth: "62ch" }}>
            Percakapan memuat kutipan data operasional. Menyimpannya tanpa batas berarti satu
            kebocoran basis membuka riwayat bertahun-tahun. Kosongkan hanya bila Anda memang wajib
            menyimpannya.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginTop: 14 }}>
        {toast && (
          <span role="status" style={{ fontSize: 12, color: toast.tipe === "ok" ? C.green : C.danger }}>
            {toast.pesan}
          </span>
        )}
        <button
          type="button"
          onClick={simpan}
          disabled={!bolehKelola || !berubah || menyimpan}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: "var(--radius-sm)", border: "none",
            background: bolehKelola && berubah ? C.navy : "var(--surface-subtle)",
            color: bolehKelola && berubah ? "#fff" : C.muted,
            fontSize: 13, fontWeight: 600,
            cursor: bolehKelola && berubah ? "pointer" : "not-allowed",
            fontFamily: "inherit",
          }}
        >
          {menyimpan ? <Loader2 size={14} className="berputar" /> : <Save size={14} />}
          Simpan
        </button>
      </div>
      </section>
    </>
  );
}
