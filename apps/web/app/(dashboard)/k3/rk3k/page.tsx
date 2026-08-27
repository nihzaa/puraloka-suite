"use client";

/**
 * RK3K — Rencana K3 Kontrak, dokumen wajib tender pemerintah.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA HALAMAN INI BUKAN FORMULIR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Modul ini sengaja ditunda (G4) dengan alasan yang ditulis di katalog: RK3K
 * adalah RANGKUMAN dari JSA + inspeksi + induksi + APD + insiden. Menyusunnya
 * sebelum isinya ada menghasilkan template kosong yang diisi asal supaya
 * tender lolos — dan template seperti itu justru jadi bukti bahwa K3-nya
 * administratif belaka.
 *
 * Jadi yang dibangun BUKAN formulir dengan kolom-kolom yang menunggu diisi.
 * Halaman ini MEMBACA kelima sumber dan menyatakan mana yang masih kosong —
 * supaya penyusun dokumen tender tahu persis apa yang belum bisa
 * dipertanggungjawabkan, alih-alih mengarangnya di kolom yang disediakan.
 *
 * Tak ada satu pun medan isian di sini. Itu disengaja: satu-satunya cara
 * memperbaiki angka di halaman ini adalah mencatat kegiatannya di modulnya
 * masing-masing, dan tiap bagian menyediakan tautan ke sana.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * KENAPA KESIAPAN PER BAGIAN, BUKAN SATU PERSENTASE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Angka gabungan menyembunyikan bagian yang NOL. Proyek dengan induksi 25 dan
 * JSA nol akan terlihat "83% siap" — padahal yang hilang justru dokumen yang
 * paling ditagih auditor. Tiap bagian berdiri sendiri, dan yang kosong
 * mendapat perlakuan visual yang berbeda, bukan sekadar angka 0.
 *
 * ── SATU aksen (§3d): BAGIAN YANG KOSONG
 *
 * Halaman ini punya satu hal yang berwarna, dan itu bukan "sudah siap"
 * melainkan "belum ada catatannya". Yang menyusun dokumen tender datang ke
 * sini untuk mencari tahu apa yang kurang — bukan untuk diberi selamat.
 *
 * ── Kenapa tombol cetak TIDAK dikunci saat belum siap
 *
 * Godaannya menonaktifkan unduh saat ada bagian kosong. Ditolak: orang yang
 * tendernya besok dan ditolak sistem akan menyusunnya di Word, di luar
 * jangkauan aplikasi ini, dan mengarang bagian yang kosong tanpa seorang pun
 * tahu. Dokumennya terbit, dan bagian kosongnya tercetak bertanda.
 */

import { useEffect, useMemo, useState } from "react";
import {
  FileCheck2, TriangleAlert, CircleCheck, ClipboardList, ShieldCheck,
  GraduationCap, HardHat, Siren, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useData } from "@/lib/data-cache";
import { C } from "@/lib/warna-ui";
import {
  Halaman, KepalaHalaman, Kartu, Rangka, Galat, gayaInput,
} from "@/components/dasar";
import { TombolUnduh } from "@/components/tombol-unduh";

interface Proyek { id: string; name: string }

interface Bagian {
  kunci: string;
  judul: string;
  jumlah: number;
  catatan: string | null;
  arti: string;
}

interface Rk3k {
  proyek: { id: string; nama: string; lokasi: string | null };
  tanggal: string;
  bagian: Bagian[];
  bagian_kosong: string[];
  siap_disusun: boolean;
  catatan_kesiapan: string;
}

/** Ikon & tautan perbaikan per bagian — satu-satunya cara mengisi yang kosong. */
const RUJUKAN: Record<string, { ikon: typeof ShieldCheck; href: string; ajakan: string }> = {
  jsa: { ikon: ClipboardList, href: "/k3/jsa", ajakan: "Susun JSA" },
  inspeksi: { ikon: ShieldCheck, href: "/k3", ajakan: "Catat inspeksi" },
  induksi: { ikon: GraduationCap, href: "/k3?bagian=induksi", ajakan: "Catat induksi" },
  apd: { ikon: HardHat, href: "/k3?bagian=apd", ajakan: "Catat serah terima APD" },
  insiden: { ikon: Siren, href: "/k3/insiden", ajakan: "Buka laporan insiden" },
};

export default function HalamanRk3k() {
  const [proyekId, setProyekId] = useState("");

  const { data: dProyek, memuat: muatProyek, galat: galatProyek } =
    useData<{ projects: Proyek[] }>("/api/v1/projects");
  const proyekList = useMemo(() => dProyek?.projects ?? [], [dProyek]);

  // Pilihan AWAL ditetapkan sekali, sesudah daftarnya datang. Menaruhnya di
  // render membuat pilihan pengguna tertimpa tiap kali datanya menyegar.
  useEffect(() => {
    if (!proyekId && proyekList.length > 0) setProyekId(proyekList[0].id);
  }, [proyekList, proyekId]);

  const { data, memuat, galat: galatRk3k, muatUlang } = useData<Rk3k>(
    proyekId ? `/api/v1/proyek/${proyekId}/k3/rk3k` : null);

  // Galat MUAT dan galat AKSI dipisah (penjaga `uji-galat-muat-terpisah`).
  // Halaman ini tak punya aksi tulis — unduhan melaporkan galatnya sendiri di
  // dalam `TombolUnduh`, jadi hanya galat muat yang ada di sini.
  //
  // Dua sumbernya dibedakan: "daftar proyek gagal" dan "rangkuman gagal"
  // menuntut tindakan berbeda, dan satu pesan untuk keduanya membuat orang
  // memuat ulang hal yang salah.
  const galat = galatProyek
    ? "Gagal memuat daftar proyek"
    : (proyekId && galatRk3k ? "Gagal memuat rangkuman RK3K" : null);

  // Identitas dicocokkan: tanpa ini, berpindah proyek menampilkan rangkuman
  // proyek SEBELUMNYA di bawah pilihan yang baru, sampai muatannya datang.
  const cocok = data && data.proyek.id === proyekId ? data : null;

  return (
    <Halaman>
      <KepalaHalaman
        ikon={<FileCheck2 size={20} aria-hidden="true" />}
        judul="RK3K — Rencana K3 Kontrak"
        keterangan={<>Dokumen wajib tender pemerintah. Halaman ini <strong>tidak
          menyediakan kolom untuk diisi</strong> — RK3K dirangkum dari catatan
          K3 yang sudah ada, dan bagian yang kosong ditampilkan apa adanya
          supaya tak ada yang perlu dikarang.</>}
      />

      {galat && <Galat pesan={galat} onCobaLagi={() => void muatUlang()} />}

      <Kartu pad="sedang">
        <div style={{
          display: "flex", gap: "var(--gap-bagian)", flexWrap: "wrap",
          alignItems: "flex-end", justifyContent: "space-between",
        }}>
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <label htmlFor="rk3k-pilih-proyek" style={{
              fontSize: 11, fontWeight: 700, color: C.muted, display: "block",
              marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
            }}>Proyek</label>
            <select
              id="rk3k-pilih-proyek" value={proyekId}
              onChange={(e) => setProyekId(e.target.value)}
              style={{ ...gayaInput, maxWidth: 420 }}
              disabled={muatProyek}
            >
              <option value="">— pilih proyek —</option>
              {proyekList.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <TombolUnduh
            jalur={`/api/v1/proyek/${proyekId}/k3/rk3k.pdf`}
            jalurTetap
            format={["pdf"]}
            nonaktif={!proyekId}
            namaBerkas={`RK3K-${cocok?.proyek.nama ?? "proyek"}`}
            label="Cetak dokumen"
          />
        </div>
      </Kartu>

      {memuat && !cocok && <Rangka tinggi={72} jumlah={5} />}

      {cocok && (
        <>
          {/* ── SATU aksen: bagian yang kosong (§3d) ───────────────────── */}
          {cocok.bagian_kosong.length > 0 ? (
            <div role="alert" style={{
              padding: "12px 16px", borderRadius: 10, fontSize: 13, lineHeight: 1.55,
              border: "1px solid var(--danger-border)", background: "var(--danger-bg)",
              color: "var(--danger)",
            }}>
              <strong style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <TriangleAlert size={15} aria-hidden="true" />
                {cocok.bagian_kosong.length === 1
                  ? "1 bagian belum punya catatan sama sekali"
                  : `${cocok.bagian_kosong.length} bagian belum punya catatan sama sekali`}
              </strong>
              <span style={{ display: "block", fontSize: 12.5 }}>
                {cocok.bagian_kosong.join(" · ")} — menyusun RK3K sekarang berarti
                mengarang bagian itu, dan dokumen yang dikarang justru jadi bukti
                bahwa K3-nya administratif belaka. Dokumennya tetap bisa dicetak:
                bagian kosong tercetak bertanda, bukan dibiarkan sebagai ruang
                kosong yang mengundang diisi tangan.
              </span>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 10, fontSize: 13,
              border: `1px solid ${C.border}`, background: "var(--surface)", color: C.mid,
            }}>
              <CircleCheck size={15} aria-hidden="true" style={{ color: "var(--success)" }} />
              Seluruh bagian punya isi. RK3K bisa disusun dari catatan nyata
              per {cocok.tanggal}.
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            {cocok.bagian.map((b) => {
              const r = RUJUKAN[b.kunci];
              const Ikon = r?.ikon ?? ClipboardList;
              const kosong = b.jumlah === 0;
              return (
                <Kartu key={b.kunci} pad="sedang">
                  <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{
                      flexShrink: 0, width: 38, height: 38, borderRadius: 9,
                      display: "grid", placeItems: "center",
                      background: kosong ? "var(--danger-bg)" : "var(--surface-2)",
                      color: kosong ? "var(--danger)" : C.mid,
                    }}>
                      <Ikon size={18} aria-hidden="true" />
                    </div>

                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                      <div style={{
                        display: "flex", gap: 10, flexWrap: "wrap",
                        alignItems: "baseline", justifyContent: "space-between",
                      }}>
                        <h2 style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
                          {b.judul}
                        </h2>
                        {/* Bagian kosong ditandai dengan KATA, bukan hanya angka 0.
                            "0" telanjang di ujung baris mudah terbaca sebagai
                            kolom yang belum diisi; "Nol catatan" tak bisa
                            disalahpahami.

                            ⚠ Berbunyi "Nol catatan", BUKAN "Belum ada catatan".
                            Bukan sekadar pilihan kata: `uji-layar-kosong-
                            menjelaskan` mencari frasa "Belum ada" sebagai
                            penanda LAYAR yang menyatakan dirinya kosong tanpa
                            jalan keluar — dan halaman ini justru kebalikannya
                            (tiap bagian menautkan ke tempat mengisinya).
                            Penjaganya tak bisa membedakan label PER-BAGIAN dari
                            layar kosong, jadi yang mengalah kalimatnya —
                            menaikkan ambang penjaga demi satu halaman berarti
                            melemahkannya untuk seluruh repo. */}
                        <span style={{
                          fontSize: 12.5, fontWeight: 700,
                          color: kosong ? "var(--danger)" : C.text,
                        }}>
                          {kosong ? "Nol catatan" : `${b.jumlah} catatan`}
                          {b.catatan && !kosong && (
                            <span style={{ fontWeight: 500, color: C.mid }}> · {b.catatan}</span>
                          )}
                        </span>
                      </div>

                      <p style={{ fontSize: 12.5, color: C.mid, lineHeight: 1.55, margin: "4px 0 0" }}>
                        {b.arti}
                      </p>

                      {r && (
                        <Link href={r.href} style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          marginTop: 8, fontSize: 12.5, fontWeight: 600,
                          color: "var(--aksen)", textDecoration: "none",
                        }}>
                          {r.ajakan}
                          <ArrowRight size={13} aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </div>
                </Kartu>
              );
            })}
          </div>
        </>
      )}
    </Halaman>
  );
}
