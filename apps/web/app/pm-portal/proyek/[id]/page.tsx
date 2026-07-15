"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

// Redirect ke halaman detail proyek admin — PM punya akses penuh ke detail proyek
export default function PMProyekDetailRedirect() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) router.replace(`/proyek/${id}`);
  }, [id, router]);

  return null;
}
