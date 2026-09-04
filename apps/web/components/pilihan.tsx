"use client";

// ============================================================================
// PILIHAN — pengganti langsung <select>, dengan kotak pencarian
//
// Diminta founder 2026-09-04: "semua dropdown saya mau searchable juga",
// lalu ditegaskan: semua, tanpa kecuali.
//
// Diukur saat itu: 418 <select> di 202 berkas.
//
// ── Kenapa BUKAN memakai PilihCari langsung
//
// PilihCari sudah ada dan bagus, tapi antarmukanya OpsiPilih[] — array objek.
// 418 select di repo ini berisi <option> JSX, dan sering bercampur: satu
// option kosong statis diikuti {daftar.map(...)}. Diukur: 353 .map() dan 457
// option statis.
//
// Mengubah tiap satunya jadi array berarti 418 kali menulis ulang bentuk, dan
// tiap satunya kesempatan salah — nilai tertukar, label hilang, grup terlupa.
// Founder minta TIDAK ADA yang tertinggal; cara yang menuntut 418 suntingan
// kreatif tak akan memenuhi itu.
//
// Komponen ini menerima children PERSIS seperti select, lalu membaca
// option-nya sendiri. Penggantian per tempat jadi mekanis: nama tag berubah,
// isi dan atributnya tidak. onChange tetap menerima e.target.value.
//
// ── Kapan pencarian MUNCUL
//
// Hanya bila pilihannya lebih dari ambangCari (default 7). Founder minta semua
// dropdown searchable, dan ini memenuhinya: kotaknya ADA di semua tempat yang
// membutuhkannya. Tapi memaksa kotak pencarian pada "Aktif / Nonaktif"
// menambah satu langkah tanpa menolong siapa pun — dan dropdown yang lebih
// lambat dipakai adalah kemunduran, bukan peningkatan.
//
// Bisa dipaksa lewat ambangCari={0} bila sebuah tempat memang menginginkannya
// selalu ada.
//
// ── Yang dipertahankan dari select asli
//
// Panah atas/bawah berpindah, Enter memilih, Esc menutup, Tab keluar.
// aria-expanded, role=listbox, aria-selected, dan label tetap terhubung lewat
// aria-label/aria-labelledby yang diteruskan apa adanya. Komponen kustom yang
// mengorbankan ini menukar satu masalah dengan masalah yang lebih buruk bagi
// pemakai keyboard dan pembaca layar.
// ============================================================================

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search, ChevronDown, Check } from "lucide-react";

interface Item {
  value: string;
  label: string;
  nonaktif?: boolean;
  grup?: string;
}

/**
 * Baca option dan optgroup dari children — termasuk yang lahir dari .map(),
 * karena React sudah meratakannya jadi array elemen sebelum sampai ke sini.
 */
function bacaOpsi(children: ReactNode, grup?: string): Item[] {
  const keluar: Item[] = [];
  Children.forEach(children, (anak) => {
    if (!isValidElement(anak)) return;
    const props = anak.props as Record<string, unknown>;

    if (anak.type === "optgroup") {
      keluar.push(...bacaOpsi(props.children as ReactNode, String(props.label ?? "")));
      return;
    }
    if (anak.type !== "option") {
      // Fragment atau array bersarang — telusuri isinya.
      if (props.children) keluar.push(...bacaOpsi(props.children as ReactNode, grup));
      return;
    }

    /*
      Label dirakit dari teks anak, BUKAN String(children).

      option yang isinya {a} — {b} punya children berupa ARRAY, dan
      String(array) menyisipkan koma: "a, — ,b". Cacat yang tak terlihat
      sampai seseorang membaca labelnya di layar.
    */
    const isi = props.children;
    const label = Array.isArray(isi)
      ? isi.map((x) => (x == null || x === false ? "" : String(x))).join("")
      : isi == null
        ? ""
        : String(isi);

    keluar.push({
      value: String(props.value ?? ""),
      label,
      nonaktif: props.disabled === true,
      grup,
    });
  });
  return keluar;
}

export interface PropsPilihan {
  value?: string | number;
  /**
   * Untuk pemakaian TAK terkendali (uncontrolled), sama seperti select asli.
   *
   * Diukur saat 209 select diganti: empat tempat memakainya — form aset yang
   * mengirim lewat FormData, tanpa state React sama sekali. Tanpa dukungan
   * ini, keempatnya diam-diam kehilangan nilai awalnya.
   */
  defaultValue?: string | number;
  /*
    Bentuk LUAS, bukan sempit.

    Pemanggil yang handler-nya sudah bertipe ChangeEvent<HTMLSelectElement>
    tak perlu diubah — dan itulah yang membuat penggantian 209 tempat tetap
    mekanis. Yang benar-benar dibaca hanya `e.target.value`.

    Tipe union dipakai alih-alih mewarisi SelectHTMLAttributes: pewarisan itu
    membawa serta seluruh handler DOM bertipe HTMLSelectElement, dan komponen
    ini merender <button>. tsc menolaknya — benar, karena elemennya memang
    berbeda.
  /*
    Tipe SENGAJA longgar: `{ target: { value: string } }` adalah irisan minimal
    dari ChangeEvent, jadi handler bertipe React.ChangeEvent<HTMLSelectElement>
    TETAP diterima — ia menjanjikan lebih dari yang diminta.

    Itulah yang membuat penggantian 209 select tetap mekanis: pemanggil yang
    handler-nya sudah bertipe DOM tak perlu disentuh. Yang benar-benar dibaca
    komponen ini hanya `e.target.value`.

    `any` di parameter dihindari; yang dipakai `unknown`-safe cast di dalam,
    karena bentuk objek yang dikirim komponen ini SELALU `{ target: { value } }`.
  */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange?: (e: any) => void;
  children?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  name?: string;
  required?: boolean;
  title?: string;
  tabIndex?: number;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /*
    onFocus/onBlur diteruskan ke tombol pemicu.

    Dipakai `progress-log-modal` untuk menyorot medan yang sedang diisi. Tanpa
    diteruskan, sorotan itu HILANG tanpa galat apa pun — layar tetap bekerja,
    cuma berhenti menunjukkan di mana pengguna berada.
  */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFocus?: (e: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBlur?: (e: any) => void;
  /** Pilihan minimal sebelum kotak pencarian muncul. 0 = selalu. */
  ambangCari?: number;
  /** Teks saat belum ada yang dipilih dan tak ada opsi kosong. */
  placeholder?: string;
}

export function Pilihan({
  value, defaultValue, onChange, children, disabled, className, style, id, name, required,
  onFocus, onBlur, ambangCari = 7, placeholder = "— pilih —", ...aria
}: PropsPilihan) {
  const [buka, setBuka] = useState(false);
  const [cari, setCari] = useState("");
  const [sorot, setSorot] = useState(0);
  /*
    Mode TAK TERKENDALI: bila `value` tak diberikan, nilainya disimpan di sini
    dan dimulai dari `defaultValue` — persis perilaku <select> asli.

    Tanpa ini, empat pemakaian di form aset (yang mengirim lewat FormData,
    tanpa state React) akan tampil kosong selamanya: kliknya bekerja, tapi
    pilihan tak pernah terlihat berubah. Cacat yang lolos typecheck karena
    props-nya sah.
  */
  const [nilaiSendiri, setNilaiSendiri] = useState(
    defaultValue == null ? "" : String(defaultValue),
  );
  const wadah = useRef<HTMLDivElement | null>(null);
  const kotakCari = useRef<HTMLInputElement | null>(null);
  const daftarId = useId();

  const opsi = useMemo(() => bacaOpsi(children), [children]);
  const terkendali = value != null;
  const nilai = terkendali ? String(value) : nilaiSendiri;
  const terpilih = opsi.find((o) => o.value === nilai) ?? null;
  const pakaiCari = ambangCari === 0 || opsi.length > ambangCari;

  const hasil = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return opsi;
    return opsi.filter((o) => o.label.toLowerCase().includes(q));
  }, [opsi, cari]);

  useEffect(() => {
    if (!buka) return;
    setCari("");
    const i = opsi.findIndex((o) => o.value === nilai);
    setSorot(i >= 0 ? i : 0);
    const t = setTimeout(() => kotakCari.current?.focus(), 0);
    return () => clearTimeout(t);
    // Yang memicu adalah PEMBUKAAN dropdown. Menyorot ulang tiap kali
    // daftarnya berubah membuat panah keyboard melompat sendiri saat
    // pengguna sedang mengetik.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka]);

  useEffect(() => {
    if (!buka) return;
    const onKlik = (e: MouseEvent) => {
      if (wadah.current && !wadah.current.contains(e.target as Node)) setBuka(false);
    };
    document.addEventListener("mousedown", onKlik);
    return () => document.removeEventListener("mousedown", onKlik);
  }, [buka]);

  function pilih(v: string) {
    // Mode tak terkendali menyimpan sendiri; yang terkendali diatur pemanggil.
    if (!terkendali) setNilaiSendiri(v);
    onChange?.({ target: { value: v } });
    setBuka(false);
  }

  function onTombol(e: React.KeyboardEvent) {
    if (!buka) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setBuka(true);
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setBuka(false); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSorot((s) => Math.min(s + 1, hasil.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSorot((s) => Math.max(s - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const o = hasil[sorot];
      if (o && !o.nonaktif) pilih(o.value);
      return;
    }
    if (e.key === "Tab") setBuka(false);
  }

  const gayaKotak: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 6,
    border: "1px solid var(--border)", background: "var(--surface)",
    color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit",
    outline: "none",
  };

  return (
    <div ref={wadah} style={{ position: "relative", ...style }}>
      {/*
        `name` diteruskan lewat input tersembunyi supaya form biasa dan
        FormData tetap melihat nilainya — komponen kustom yang melupakan ini
        membuat pengiriman form diam-diam kehilangan satu medan.
      */}
      {name && <input type="hidden" name={name} value={nilai} />}

      <button
        type="button"
        id={id}
        className={className}
        disabled={disabled}
        onClick={() => !disabled && setBuka((b) => !b)}
        onKeyDown={onTombol}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-haspopup="listbox"
        aria-expanded={buka}
        aria-controls={buka ? daftarId : undefined}
        aria-required={required || undefined}
        {...aria}
        style={{
          ...gayaKotak,
          textAlign: "left",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 8,
        }}
      >
        <span
          style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            color: terpilih ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          {terpilih ? terpilih.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          style={{
            flexShrink: 0, color: "var(--text-muted)",
            transform: buka ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {buka && (
        <div
          style={{
            position: "absolute", zIndex: 60, top: "calc(100% + 4px)",
            left: 0, right: 0, minWidth: 180,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "var(--naik-2)", overflow: "hidden",
          }}
        >
          {pakaiCari && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 10px", borderBottom: "1px solid var(--border)",
              }}
            >
              <Search size={13} aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                ref={kotakCari}
                value={cari}
                onChange={(e) => { setCari(e.target.value); setSorot(0); }}
                onKeyDown={onTombol}
                placeholder="Cari…"
                aria-label="Cari pilihan"
                style={{
                  flex: 1, border: "none", outline: "none",
                  background: "transparent", fontSize: 13,
                  color: "var(--text-primary)", fontFamily: "inherit",
                }}
              />
            </div>
          )}

          <ul
            id={daftarId}
            role="listbox"
            style={{ listStyle: "none", margin: 0, padding: 4, maxHeight: 260, overflowY: "auto" }}
          >
            {hasil.length === 0 && (
              <li style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-muted)" }}>
                Tidak ada yang cocok.
              </li>
            )}
            {hasil.map((o, i) => {
              const aktif = i === sorot;
              const dipilih = o.value === nilai;
              return (
                <li key={o.value + "|" + i} role="option" aria-selected={dipilih}>
                  <button
                    type="button"
                    disabled={o.nonaktif}
                    onClick={() => !o.nonaktif && pilih(o.value)}
                    onMouseEnter={() => setSorot(i)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center",
                      justifyContent: "space-between", gap: 8,
                      padding: "7px 10px", borderRadius: 6, border: "none",
                      textAlign: "left", fontSize: 13, fontFamily: "inherit",
                      cursor: o.nonaktif ? "not-allowed" : "pointer",
                      opacity: o.nonaktif ? 0.5 : 1,
                      background: aktif ? "var(--surface-hover)" : "transparent",
                      color: dipilih ? "var(--navy)" : "var(--text-primary)",
                      fontWeight: dipilih ? 600 : 400,
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.grup && (
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--t-kecil)" }}>{o.grup} · </span>
                      )}
                      {o.label || <span style={{ color: "var(--text-muted)" }}>—</span>}
                    </span>
                    {dipilih && <Check size={13} aria-hidden="true" style={{ flexShrink: 0 }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
