"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/api";

export default function RootPage() {
  const router = useRouter();
  const redirected = useRef(false);
  useEffect(() => {
    if (redirected.current) return;
    redirected.current = true;
    const user = getStoredUser();
    if (user?.role === "client") {
      router.replace("/portal");
    } else {
      router.replace("/dashboard");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
