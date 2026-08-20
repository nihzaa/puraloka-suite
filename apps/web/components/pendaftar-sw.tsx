"use client";
import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/register-sw";

export default function PendaftarServiceWorker() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}
