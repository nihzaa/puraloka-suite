import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabUrl } from "./use-tab-url";

// ── Dudukan Next router ─────────────────────────────────────────────────────
//
// Yang diuji adalah PERILAKUnya: nilai mana yang dipakai, dan URL apa yang
// ditulis. Merender seluruh App Router untuk itu jauh lebih mahal daripada
// yang dijawabnya.
const replace = vi.fn();
let query = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/estimasi",
  useSearchParams: () => query,
}));

const TAB = ["katalog", "harga", "varians"] as const;

beforeEach(() => {
  replace.mockClear();
  query = new URLSearchParams();
});

describe("useTabUrl", () => {
  it("memakai nilai awal saat URL tak menyebut tab", () => {
    const { result } = renderHook(() => useTabUrl(TAB, "katalog"));
    expect(result.current[0]).toBe("katalog");
  });

  it("membaca tab dari URL — inilah yang membuat menu bisa menunjuknya", () => {
    query = new URLSearchParams("tab=harga");
    const { result } = renderHook(() => useTabUrl(TAB, "katalog"));
    expect(result.current[0]).toBe("harga");
  });

  // Nilai tak dikenal TIDAK boleh menggagalkan halaman: URL datang dari luar.
  it("mengabaikan nilai tak dikenal, bukan menampilkan galat", () => {
    query = new URLSearchParams("tab=ngawur");
    const { result } = renderHook(() => useTabUrl(TAB, "katalog"));
    expect(result.current[0]).toBe("katalog");
  });

  it("menulis tab ke URL saat berpindah", () => {
    const { result } = renderHook(() => useTabUrl(TAB, "katalog"));
    act(() => result.current[1]("varians"));
    expect(result.current[0]).toBe("varians");
    expect(replace).toHaveBeenCalledWith("/estimasi?tab=varians", { scroll: false });
  });

  // `replace`, BUKAN `push` — kalau tidak, "back" lima kali hanya memutar
  // ulang tab dan orang mengira aplikasinya macet.
  it("memakai replace supaya tombol back tidak terjebak di riwayat tab", () => {
    const { result } = renderHook(() => useTabUrl(TAB, "katalog"));
    act(() => result.current[1]("harga"));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("mempertahankan parameter lain di URL", () => {
    query = new URLSearchParams("proyek=abc");
    const { result } = renderHook(() => useTabUrl(TAB, "katalog"));
    act(() => result.current[1]("harga"));
    expect(replace).toHaveBeenCalledWith("/estimasi?proyek=abc&tab=harga", { scroll: false });
  });

  it("nama parameter bisa diganti", () => {
    query = new URLSearchParams("bagian=varians");
    const { result } = renderHook(() => useTabUrl(TAB, "katalog", "bagian"));
    expect(result.current[0]).toBe("varians");
  });
});
