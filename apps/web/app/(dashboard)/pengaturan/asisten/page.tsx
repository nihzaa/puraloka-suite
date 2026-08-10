"use client";

/**
 * PENGATURAN → PERILAKU ASISTEN
 *
 * ══════════════════════════════════════════════════════════════════════════
 * "SEMUANYA BISA DIKONFIGURASI DI UI, GAADA YANG HARDCODE"
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Arahan founder 2026-08-10. Tiga hal yang sebelumnya dipaku di kode dan kini
 * ada di sini:
 *
 *   PROMPT      dulu di `routes/v1/ai-chat.ts` — mengubah cara asisten
 *               menjawab menuntut deploy, dan seluruh tenant ikut berubah
 *   MAKS RONDE  dulu konstanta di `lib/ai-loop.ts`
 *   TOOL AKTIF  dulu seluruh katalog selalu ditawarkan
 *
 * Yang ketiga paling menggigit. Sebelum ini, "matikan akses stok untuk
 * asisten" hanya bisa dilakukan dengan mencabut `gudang:view` — yang sekaligus
 * menyembunyikan halaman Gudang dari orangnya. Konfigurasi yang memaksa
 * merusak hal lain bukan konfigurasi.
 *
 * ── Yang SENGAJA tidak bisa diatur, dan itu bukan kelalaian
 *
 * Sifat READ-ONLY. Tak ada kotak centang "izinkan menulis", dan tak boleh
 * pernah ada — CLAUDE.md §5.3 ember [C]. Itu satu-satunya pertahanan prompt
 * injection yang tak bergantung pada model berperilaku baik (spec §5.3 I-1),
 * dan pertahanan yang bisa dimatikan dari UI akan dimatikan orang yang tak
 * tahu apa yang ia matikan.
 *
 * Halaman ini MENYATAKANNYA, bukan menyembunyikannya. Batas yang tak
 * dijelaskan terbaca sebagai fitur yang belum jadi.
 *
 * ── Warna
 *
 * `ARAH-VISUAL-2026.md` §3d: navy hanya untuk tombol simpan. Merah hanya untuk
 * saklar mati yang benar-benar dimatikan.
 */

import { useCallback, useEffect, useState } from "react";
import { useIzin } from "@/lib/use-izin";
import { api } from "@/lib/api";
import { Bot, Info, Loader2, Power, Save, ShieldCheck } from "lucide-react";

import { C } from "@/lib/warna-ui";
import { KepalaHalaman } from "@/components/dasar";
import { GAYA_KARTU } from "@/components/ui-dasar";
import { GAYA_ISIAN } from "@/components/isian";



interface ToolTersedia {
  nama: string;
  keterangan: string;
  izin: string;
}

interface Konfigurasi {
  asisten: string;
  prompt_sistem: string | null;
  maks_ronde: number;
  tool_aktif: string[] | null;
  tersimpan: boolean;
  penyedia: string;
  model: string;
  max_token: number;
  aktif: boolean;
  batas_bulanan_idr: number | null;
  mode_batas: "blokir" | "peringatkan";
}

interface Muatan {
  data: Konfigurasi[];
  tool_tersedia: ToolTersedia[];
}

interface PengaturanTenant {
  ai_aktif: boolean;
  retensi_hari: number | null;
}

const PERAN: Record<string, string> = {
  insight: "Wawasan portofolio",
  owner: "Asisten pemilik",
  staff: "Asisten staf",
  web: "Asisten web",
};

/** Asisten yang benar-benar memakai tool. `insight` tidak. */
const PAKAI_TOOL = new Set(["owner", "staff", "web"]);

/*
 * Tanpa penjaga `mounted` — `useIzin` memakai `useSyncExternalStore`, jadi
 * React sendiri yang menangani beda server/klien. Penjaga manual yang dulu
 * ada di sini membuat halaman merender NULL pada putaran pertama: layar
 * kosong sepersekian detik yang terlihat seperti aplikasi lambat.
 */
export default function PerilakuAsistenPage() {
  const bolehKelola = useIzin("settings:ai:manage");

  const [muatan, setMuatan] = useState<Muatan | null>(null);
  const [tenant, setTenant] = useState<PengaturanTenant | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [draf, setDraf] = useState<Record<string, Partial<Konfigurasi>>>({});
  const [drafTenant, setDrafTenant] = useState<Partial<PengaturanTenant>>({});
  const [sedangSimpan, setSedangSimpan] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipe: "ok" | "err"; pesan: string } | null>(null);

  const muat = useCallback(async () => {
    try {
      const [r, t] = await Promise.all([
        api.get<Muatan>("/api/v1/ai/config"),
        api.get<PengaturanTenant>("/api/v1/ai/pengaturan"),
      ]);
      setMuatan(r.data);
      setTenant(t.data);
      setDraf({});
      setDrafTenant({});
    } catch {
      setToast({ tipe: "err", pesan: "Gagal memuat pengaturan asisten" });
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function ubah(asisten: string, tambalan: Partial<Konfigurasi>) {
    setDraf((d) => ({ ...d, [asisten]: { ...d[asisten], ...tambalan } }));
  }

  async function simpan(asli: Konfigurasi) {
    const nilai = { ...asli, ...draf[asli.asisten] };
    setSedangSimpan(asli.asisten);
    try {
      await api.put(`/api/v1/ai/config/${asli.asisten}`, {
        penyedia: nilai.penyedia,
        model: nilai.model,
        max_token: nilai.max_token,
        aktif: nilai.aktif,
        batas_bulanan_idr: nilai.batas_bulanan_idr,
        mode_batas: nilai.mode_batas,
        prompt_sistem: nilai.prompt_sistem,
        maks_ronde: Number(nilai.maks_ronde),
        tool_aktif: nilai.tool_aktif,
      });
      setToast({ tipe: "ok", pesan: `Perilaku ${PERAN[asli.asisten] ?? asli.asisten} tersimpan` });
      await muat();
    } catch (e) {
      setToast({
        tipe: "err",
        pesan:
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal menyimpan",
      });
    } finally {
      setSedangSimpan(null);
    }
  }

  async function simpanTenant() {
    const nilai = { ...tenant, ...drafTenant };
    setSedangSimpan("__tenant__");
    try {
      await api.put("/api/v1/ai/pengaturan", {
        ai_aktif: nilai.ai_aktif,
        retensi_hari: nilai.retensi_hari,
      });
      setToast({ tipe: "ok", pesan: "Pengaturan lapisan AI tersimpan" });
      await muat();
    } catch (e) {
      setToast({
        tipe: "err",
        pesan:
          (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Gagal menyimpan pengaturan",
      });
    } finally {
      setSedangSimpan(null);
    }
  }

  const t = { ...tenant, ...drafTenant } as PengaturanTenant;
  const tenantBerubah = Object.keys(drafTenant).length > 0;

  return (
    <div
      style={{
        padding: "var(--pad-atas) var(--pad-x) var(--pad-bawah)",
        width: "100%",
        maxWidth: "var(--w-form)",
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

      <div style={{ marginBottom: "var(--gap-bagian)", display: "flex", alignItems: "center", gap: 12 }}>
        <KepalaHalaman
          judul="Perilaku Asisten"
          keterangan="Instruksi, batas langkah, dan data apa yang boleh dibaca tiap asisten."
          ikon={<Bot size={19} />}
        />
      </div>

      {!bolehKelola && (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10 }}>
          <Info size={18} style={{ color: C.mid, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: C.mid, lineHeight: 1.6 }}>
            Anda bisa melihat pengaturan ini, tetapi tidak mengubahnya.
            Butuh kapabilitas <code>settings:ai:manage</code>.
          </div>
        </div>
      )}

      {/* ── Batas yang TIDAK bisa diatur — dinyatakan, bukan disembunyikan ── */}
      <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu)", marginBottom: "var(--gap-bagian)", display: "flex", gap: 10 }}>
        <ShieldCheck size={18} style={{ color: "var(--success)", flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.65 }}>
          Asisten <strong style={{ color: C.text }}>hanya bisa membaca</strong>, dan itu tidak
          bisa diubah dari halaman ini — tool untuk menyetujui atau mengubah data memang tidak
          ada di sistem. Instruksi apa pun yang Anda tulis di bawah tunduk pada batas itu.
        </div>
      </section>

      {memuat ? (
        <div style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Memuat…
        </div>
      ) : (
        <>
          {/* ── Saklar mati + retensi (kriteria B1 yang tertunda) ── */}
          <section style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)", marginBottom: "var(--gap-bagian)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Power size={16} style={{ color: C.mid }} />
              <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.muted, margin: 0 }}>
                Lapisan AI
              </h2>
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: C.text, cursor: bolehKelola ? "pointer" : "default" }}>
              <input
                type="checkbox"
                checked={t?.ai_aktif ?? true}
                disabled={!bolehKelola}
                onChange={(e) => setDrafTenant((d) => ({ ...d, ai_aktif: e.target.checked }))}
                style={{ marginTop: 3, cursor: bolehKelola ? "pointer" : "default" }}
              />
              <span>
                Asisten AI aktif untuk perusahaan ini
                <span style={{ display: "block", fontSize: 11.5, color: C.muted, lineHeight: 1.55, marginTop: 2 }}>
                  Mematikannya menghentikan seluruh panggilan AI tanpa menyentuh modul lain —
                  tak ada permission yang dicabut, tak ada halaman yang hilang.
                </span>
              </span>
            </label>

            {t && t.ai_aktif === false && (
              <div
                style={{
                  marginTop: 12, padding: "var(--pad-kartu)", borderRadius: 8,
                  background: "var(--danger-bg)", border: "1px solid var(--danger)",
                  fontSize: 12.5, color: C.text, lineHeight: 1.6,
                }}
              >
                Asisten sedang <strong>dimatikan</strong>. Kartu asisten di panel kanan tetap
                terlihat, tetapi setiap pertanyaan akan ditolak.
              </div>
            )}

            {/*
              `maxWidth` di sini SENGAJA tidak mengurung teksnya.

              Versi pertama membungkus label, input, DAN kalimat penjelas dalam
              satu kotak selebar 280px — dan penjelasnya jadi empat baris
              sempit yang berdiri sendirian di kiri, terlihat seperti kolom
              yang salah tempat. Yang perlu sempit hanya input angkanya.
            */}
            <div style={{ marginTop: 16 }}>
              <label htmlFor="retensi" style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                Simpan riwayat percakapan
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input className="isian-fokus"
                  id="retensi"
                  type="number"
                  min={1}
                  max={3650}
                  placeholder="Selamanya"
                  value={t?.retensi_hari ?? ""}
                  disabled={!bolehKelola}
                  onChange={(e) =>
                    setDrafTenant((d) => ({
                      ...d,
                      retensi_hari: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  style={{ ...GAYA_ISIAN, width: 120 }}
                />
                <span style={{ fontSize: 13, color: C.mid }}>hari</span>
              </div>
              <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                Percakapan memuat kutipan data operasional. Menyimpannya tanpa batas berarti
                satu kebocoran basis membuka riwayat bertahun-tahun. Kosongkan hanya bila
                Anda memang wajib menyimpannya.
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                onClick={simpanTenant}
                disabled={!bolehKelola || !tenantBerubah || sedangSimpan === "__tenant__"}
                style={tombolSimpan(bolehKelola && tenantBerubah)}
              >
                {sedangSimpan === "__tenant__" ? <Loader2 size={14} className="berputar" /> : <Save size={14} />}
                Simpan
              </button>
            </div>
          </section>

          {/* ── Satu kartu per asisten ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(muatan?.data ?? []).map((asli) => {
              const k = { ...asli, ...draf[asli.asisten] };
              const berubah = Boolean(draf[asli.asisten]);
              const nama = PERAN[k.asisten] ?? k.asisten;
              const pakaiTool = PAKAI_TOOL.has(k.asisten);
              const idPrompt = `prompt-${k.asisten}`;
              const idRonde = `ronde-${k.asisten}`;

              // NULL = semua tool yang berizin. Ditampilkan tercentang semua
              // supaya keadaan "belum diatur" terlihat sebagaimana ia berlaku.
              const aktif = k.tool_aktif;
              const semuaAktif = aktif === null;

              return (
                <section key={k.asisten} style={{ ...GAYA_KARTU, padding: "var(--pad-kartu-lega)" }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: "0 0 14px" }}>
                    {nama}
                  </h3>

                  <div style={{ marginBottom: 14 }}>
                    <label htmlFor={idPrompt} style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                      Instruksi tambahan
                    </label>
                    <textarea className="isian-fokus"
                      id={idPrompt}
                      aria-label={`Instruksi tambahan untuk ${nama}`}
                      rows={3}
                      maxLength={8000}
                      placeholder="Mis. sebut nilai dalam jutaan rupiah, dan selalu urutkan dari yang paling mendesak."
                      value={k.prompt_sistem ?? ""}
                      disabled={!bolehKelola}
                      onChange={(e) => ubah(k.asisten, { prompt_sistem: e.target.value || null })}
                      style={{ ...GAYA_ISIAN, resize: "vertical", lineHeight: 1.6 }}
                    />
                    <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                      Ditambahkan di bawah instruksi bawaan, tidak menggantikannya. Dikirim ulang
                      tiap langkah — instruksi panjang menambah biaya tiap pertanyaan.
                    </p>
                  </div>

                  {pakaiTool && (
                    <>
                      <div style={{ marginBottom: 14, maxWidth: 200 }}>
                        <label htmlFor={idRonde} style={{ display: "block", fontSize: 12, fontWeight: 550, color: C.mid, marginBottom: 5 }}>
                          Batas langkah
                        </label>
                        <input className="isian-fokus"
                          id={idRonde}
                          aria-label={`Batas langkah untuk ${nama}`}
                          type="number"
                          min={1}
                          max={12}
                          value={k.maks_ronde}
                          disabled={!bolehKelola}
                          onChange={(e) => ubah(k.asisten, { maks_ronde: Number(e.target.value) })}
                          style={GAYA_ISIAN}
                        />
                        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "6px 0 0" }}>
                          Berapa kali asisten boleh membaca data sebelum wajib menjawab.
                          Tiap langkah ditagih.
                        </p>
                      </div>

                      <div>
                        <p style={{ fontSize: 12, fontWeight: 550, color: C.mid, margin: "0 0 6px" }}>
                          Data yang boleh dibaca
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                                    // Dari NULL, pencentangan pertama harus
                                    // membekukan keadaan "semua" jadi daftar
                                    // nyata — kalau tidak, mematikan satu tool
                                    // akan terbaca sebagai mematikan semuanya.
                                    const dasar = semuaAktif
                                      ? (muatan?.tool_tersedia ?? []).map((x) => x.nama)
                                      : [...(aktif ?? [])];
                                    const baru = e.target.checked
                                      ? [...new Set([...dasar, tool.nama])]
                                      : dasar.filter((n) => n !== tool.nama);
                                    ubah(k.asisten, { tool_aktif: baru });
                                  }}
                                  style={{ marginTop: 3, cursor: bolehKelola ? "pointer" : "default" }}
                                />
                                <span>
                                  <code style={{ fontSize: 11.5 }}>{tool.nama}</code>
                                  <span style={{ display: "block", fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
                                    {tool.keterangan}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: "8px 0 0" }}>
                          Mematikan semuanya membuat asisten tetap menjawab, tetapi tanpa membaca
                          data apa pun. Pengguna juga tetap butuh izinnya masing-masing —
                          mencentang di sini tidak memberi akses baru.
                        </p>
                      </div>
                    </>
                  )}

                  {!pakaiTool && (
                    <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, margin: 0 }}>
                      Asisten ini tidak memakai tool — ia menulis dari angka yang sudah dihitung
                      sistem, jadi batas langkah dan pilihan data tidak berlaku.
                    </p>
                  )}

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                    <button
                      type="button"
                      onClick={() => simpan(asli)}
                      disabled={!bolehKelola || !berubah || sedangSimpan === k.asisten}
                      style={tombolSimpan(bolehKelola && berubah)}
                    >
                      {sedangSimpan === k.asisten ? <Loader2 size={14} className="berputar" /> : <Save size={14} />}
                      Simpan
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function tombolSimpan(hidup: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "var(--pad-tombol)", borderRadius: 7, fontSize: 13,
    fontWeight: 550, border: "1px solid transparent",
    background: hidup ? C.aksen : "var(--surface-subtle)",
    color: hidup ? "#fff" : C.muted,
    cursor: hidup ? "pointer" : "not-allowed",
    fontFamily: "inherit",
  };
}
