"use client";

// Redirect ke halaman detail proyek dashboard web — admin punya akses
// penuh ke SELURUH tab (`/proyek/[id]`, 2082 baris, CPM/Gantt/Kurva-S/
// Change-Order/dst semuanya tab di sana, bukan halaman terpisah — lihat
// riset Task 6). Pola IDENTIK `pm-portal/proyek/[id]/page.tsx`. Membangun
// versi portal (PortalShell + belasan tab) adalah pekerjaan tersendiri
// yang JAUH melebihi skala satu Task — di luar cakupan Tahap 2.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AdminProyekDetailRedirect() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/proyek/${id}`);
  }, [id, router]);

  return null;
}
