"use client";

import { useEffect } from "react";

// Liest kiln_ref Cookie und wendet den Referral-Code an
export function ReferralApply() {
  useEffect(() => {
    const cookies = document.cookie.split(";").map((c) => c.trim());
    const refCookie = cookies.find((c) => c.startsWith("kiln_ref="));
    if (!refCookie) return;

    const referralCode = refCookie.split("=")[1];
    if (!referralCode) return;

    // Code anwenden und Cookie löschen
    fetch("/api/referral", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referralCode }),
    })
      .then(() => {
        // Cookie löschen unabhängig vom Ergebnis
        document.cookie = "kiln_ref=; path=/; max-age=0";
      })
      .catch(() => {
        document.cookie = "kiln_ref=; path=/; max-age=0";
      });
  }, []);

  return null;
}
