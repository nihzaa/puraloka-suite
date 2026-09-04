"use client";

// ============================================================================
// TANYA — pengganti confirm() dan alert() bawaan peramban
//
// Diminta founder 2026-09-04: "semua dialog juga jangan pake bawaan, kaya
// alert atau apapun itu".
//
// Diukur saat itu: 32 pemanggilan confirm()/alert() di 22 berkas — termasuk
// pada keputusan uang (hapus pengeluaran, batalkan transfer kas, hapus
// penagihan mandor).
//
// ── Kenapa dialog bawaan buruk DI SINI, bukan sekadar tak cantik
//
//   · Ia memakai bahasa dan tombol SISTEM OPERASI. Pengguna berbahasa
//     Indonesia membaca "OK / Cancel", dan tombolnya tak pernah bertuliskan
//     "Hapus" atau "Batal".
//   · Ia tak bisa membedakan tindakan merusak dari tindakan biasa. Menghapus
//     invoice dan menutup panel memakai kotak yang sama persis — dan orang
//     yang sudah menekan OK sepuluh kali hari itu menekannya lagi. Di sini
//     tindakan merusak berwarna merah DAN fokus awalnya jatuh ke BATAL, jadi
//     Enter refleks tak menghapus apa pun.
//   · Ia MEMBEKUKAN seluruh tab. Timer, polling notifikasi, dan penyimpanan
//     otomatis berhenti selama kotaknya terbuka.
//   · Peramban modern MENEKAN dialog yang muncul berkali-kali ("jangan
//     tampilkan lagi") — dan confirm() yang ditekan memulangkan false
//     diam-diam. Tindakan yang seharusnya berjalan tak pernah berjalan,
//     tanpa satu pun gejala.
//   · Isinya teks polos: tak bisa menampilkan nama proyek yang tebal,
//     nominal yang diformat, atau peringatan berwarna.
//
// ── Kenapa berbentuk await, bukan komponen
//
// 32 pemanggilan itu tersebar di dalam fungsi async yang sudah ada:
//
//     if (!confirm("Hapus?")) return
//     await api.delete(...)
//
// Kalau penggantinya berupa komponen, tiap satunya menuntut state baru, satu
// elemen dialog di JSX, dan alur yang dipecah jadi dua fungsi — 32 kali
// kesempatan salah pasang, di berkas yang sebagian besar tak disentuh untuk
// alasan lain. Dengan await tanya(...) bentuknya tetap satu baris; yang
// berubah cuma sumber jawabannya, bukan struktur kodenya.
//
// ── Yang SENGAJA tidak dilakukan
//
// Kalau TuanRumahTanya belum terpasang, tanya() MENOLAK — bukan jatuh ke
// confirm() bawaan. Jatuhan diam-diam membuat halaman yang lupa memasangnya
// tetap "bekerja" dengan dialog yang justru sedang dihapus, dan itu bertahan
// berbulan-bulan tanpa ada yang tahu.
//
// Antreannya juga bukan satu slot: dua permintaan beruntun membuat yang kedua
// MENIMPA yang pertama, dan Promise pertama tak pernah selesai — fungsi
// pemanggilnya menggantung selamanya, tanpa galat.
//
// Wadahnya DialogBersama (elemen <dialog> asli): fokus terkunci, Esc menutup,
// dan pembaca layar diberi tahu ini dialog.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, Trash2 } from "lucide-react";
import { DialogBersama } from "@/components/dialog-bersama";

export type NadaTanya = "bahaya" | "peringatan" | "info";

export interface OpsiTanya {
  judul: string;
  /** Kalimat penjelas. Boleh JSX — nama entitas yang tebal, nominal, dsb. */
  pesan?: React.ReactNode;
  /** Label tombol yang MELANJUTKAN. Tulis kata kerjanya ("Hapus", "Kirim"). */
  labelYa?: string;
  /** Label tombol yang membatalkan. */
  labelTidak?: string;
  /**
   * "bahaya" untuk tindakan yang tak bisa dibatalkan (hapus, batalkan
   * pembayaran) — tombolnya merah dan fokus awal jatuh ke BATAL.
   */
  nada?: NadaTanya;
  /** Hanya memberi tahu: satu tombol, tak ada pilihan. Pengganti alert(). */
  hanyaKabar?: boolean;
}

type Permintaan = OpsiTanya & { selesai: (jawab: boolean) => void };

let daftarkan: ((p: Permintaan) => void) | null = null;

/**
 * Tanya pengguna, tunggu jawabannya.
 *
 * @returns true bila melanjutkan, false bila membatalkan.
 *          hanyaKabar selalu memulangkan true saat ditutup.
 */
export function tanya(opsi: OpsiTanya): Promise<boolean> {
  if (!daftarkan) {
    return Promise.reject(
      new Error(
        "tanya() dipanggil sebelum TuanRumahTanya terpasang. " +
          "Pasang sekali di layout dashboard.",
      ),
    );
  }
  return new Promise<boolean>((selesai) => {
    daftarkan!({ ...opsi, selesai });
  });
}

/** Pintasan: konfirmasi tindakan merusak. */
export function tanyaHapus(apa: string, pesan?: React.ReactNode): Promise<boolean> {
  return tanya({
    judul: "Hapus " + apa + "?",
    pesan: pesan ?? "Tindakan ini tidak bisa dibatalkan.",
    labelYa: "Hapus",
    nada: "bahaya",
  });
}

/** Pintasan: beri tahu saja (pengganti alert()). */
export function kabari(judul: string, pesan?: React.ReactNode): Promise<boolean> {
  return tanya({ judul, pesan, hanyaKabar: true, nada: "info" });
}


// ── Pengganti prompt(): dialog dengan satu kolom isian ─────────────────────
//
// 13 `window.prompt()` diukur 2026-09-04, dan sebagian pada jalur yang penting:
// alasan pembatalan jurnal, jawaban RFI, usul revisi submittal.
//
// `prompt()` punya semua cacat `confirm()` DITAMBAH satu yang lebih buruk: ia
// tak bisa memvalidasi apa pun. Yang mengetik spasi atau menekan OK dengan
// kolom kosong tetap lolos, dan kodenya harus memeriksa ulang di sisi lain —
// yang sering terlupa. Di sini tombol lanjut MATI selama isiannya kosong.

export interface OpsiIsian extends Omit<OpsiTanya, "hanyaKabar"> {
  /** Nilai awal kolom. */
  awal?: string;
  /** Teks samar di kolom kosong. */
  contoh?: string;
  /** Kolom banyak baris — untuk alasan/jawaban panjang. */
  panjang?: boolean;
  /** Boleh lanjut dengan isian kosong? Default: tidak. */
  bolehKosong?: boolean;
}

type PermintaanIsian = OpsiIsian & { selesaiIsi: (nilai: string | null) => void };

let daftarkanIsian: ((p: PermintaanIsian) => void) | null = null;

/**
 * Minta pengguna mengetik sesuatu.
 *
 * @returns teks yang diketik, atau `null` bila dibatalkan — bentuk yang SAMA
 *          dengan `window.prompt()`, jadi kode pemanggilnya tak berubah
 *          strukturnya.
 */
export function minta(opsi: OpsiIsian): Promise<string | null> {
  if (!daftarkanIsian) {
    return Promise.reject(
      new Error("minta() dipanggil sebelum TuanRumahTanya terpasang."),
    );
  }
  return new Promise<string | null>((selesaiIsi) => {
    daftarkanIsian!({ ...opsi, selesaiIsi });
  });
}

const IKON: Record<NadaTanya, React.ReactNode> = {
  bahaya: <Trash2 size={18} aria-hidden="true" />,
  peringatan: <AlertTriangle size={18} aria-hidden="true" />,
  info: <Info size={18} aria-hidden="true" />,
};

const WARNA: Record<NadaTanya, { bg: string; tepi: string; teks: string }> = {
  bahaya: { bg: "var(--danger-bg)", tepi: "var(--danger)", teks: "var(--on-danger-bg)" },
  peringatan: { bg: "var(--warning-bg)", tepi: "var(--warning)", teks: "var(--on-warning-bg)" },
  info: { bg: "var(--info-bg)", tepi: "var(--info)", teks: "var(--on-info-bg)" },
};

/** Dipasang SEKALI di layout. Tanpa ini, tanya()/minta() menolak. */
export function TuanRumahTanya() {
  const [antre, setAntre] = useState<Permintaan[]>([]);
  const [antreIsi, setAntreIsi] = useState<PermintaanIsian[]>([]);
  const [teks, setTeks] = useState("");
  const kini = antre[0] ?? null;
  const kiniIsi = antreIsi[0] ?? null;
  const batalRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    daftarkan = (p) => setAntre((a) => [...a, p]);
    daftarkanIsian = (p) => setAntreIsi((a) => [...a, p]);
    return () => { daftarkan = null; daftarkanIsian = null; };
  }, []);

  useEffect(() => {
    if (kini?.nada === "bahaya") batalRef.current?.focus();
  }, [kini]);

  // Isian dimulai dari nilai awalnya tiap kali permintaan berganti.
  useEffect(() => { setTeks(kiniIsi?.awal ?? ""); }, [kiniIsi]);

  const jawab = useCallback((nilai: boolean) => {
    setAntre((a) => {
      const [depan, ...sisa] = a;
      depan?.selesai(nilai);
      return sisa;
    });
  }, []);

  const jawabIsi = useCallback((nilai: string | null) => {
    setAntreIsi((a) => {
      const [depan, ...sisa] = a;
      depan?.selesaiIsi(nilai);
      return sisa;
    });
  }, []);

  // ── Dialog isian (pengganti prompt) ──────────────────────────────────────
  if (kiniIsi) {
    const nadaI = kiniIsi.nada ?? "info";
    const wI = WARNA[nadaI];
    const kosong = teks.trim().length === 0;
    const takBoleh = kosong && !kiniIsi.bolehKosong;
    const gayaIsian: React.CSSProperties = {
      width: "100%", padding: "8px 10px", borderRadius: 6,
      border: "1px solid var(--border)", background: "var(--surface)",
      color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit",
    };

    return (
      <DialogBersama
        terbuka
        onTutup={() => jawabIsi(null)}
        judul={kiniIsi.judul}
        lebar={460}
        kaki={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => jawabIsi(null)}
              style={{
                padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text-secondary)", cursor: "pointer",
              }}
            >
              {kiniIsi.labelTidak ?? "Batal"}
            </button>
            <button
              onClick={() => jawabIsi(teks)}
              disabled={takBoleh}
              style={{
                padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: "1px solid " + wI.tepi,
                background: takBoleh ? "var(--surface-hover)" : "var(--navy)",
                color: takBoleh ? "var(--text-muted)" : "#fff",
                cursor: takBoleh ? "not-allowed" : "pointer",
              }}
            >
              {kiniIsi.labelYa ?? "Simpan"}
            </button>
          </div>
        }
      >
        {kiniIsi.pesan && (
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 10px" }}>
            {kiniIsi.pesan}
          </p>
        )}
        {kiniIsi.panjang ? (
          <textarea
            className="isian-fokus"
            autoFocus
            rows={4}
            value={teks}
            placeholder={kiniIsi.contoh}
            onChange={(e) => setTeks(e.target.value)}
            style={{ ...gayaIsian, resize: "vertical" }}
          />
        ) : (
          <input
            className="isian-fokus"
            autoFocus
            value={teks}
            placeholder={kiniIsi.contoh}
            onChange={(e) => setTeks(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !takBoleh) jawabIsi(teks); }}
            style={gayaIsian}
          />
        )}
      </DialogBersama>
    );
  }

  if (!kini) return null;

  const nada = kini.nada ?? "peringatan";
  const w = WARNA[nada];

  return (
    <DialogBersama
      terbuka
      onTutup={() => jawab(kini.hanyaKabar === true)}
      judul={kini.judul}
      lebar={440}
      kaki={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {!kini.hanyaKabar && (
            <button
              ref={batalRef}
              onClick={() => jawab(false)}
              style={{
                padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
                border: "1px solid var(--border)", background: "var(--surface)",
                color: "var(--text-secondary)", cursor: "pointer",
              }}
            >
              {kini.labelTidak ?? "Batal"}
            </button>
          )}
          <button
            onClick={() => jawab(true)}
            style={{
              padding: "8px 16px", borderRadius: 6, fontSize: 13, fontWeight: 600,
              border: "1px solid " + w.tepi,
              background: nada === "bahaya" ? "var(--danger)" : "var(--navy)",
              color: "#fff", cursor: "pointer",
            }}
          >
            {kini.labelYa ?? (kini.hanyaKabar ? "Mengerti" : "Lanjutkan")}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div
          aria-hidden="true"
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: w.bg, color: w.teks,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {IKON[nada]}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          {kini.pesan ?? "Lanjutkan tindakan ini?"}
        </div>
      </div>
    </DialogBersama>
  );
}
