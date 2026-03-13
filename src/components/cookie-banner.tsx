"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = document.cookie
      .split("; ")
      .find((c) => c.startsWith("kiln_cookie_consent="));
    if (!consent) setShow(true);
  }, []);

  function accept() {
    document.cookie = "kiln_cookie_consent=ok; path=/; max-age=31536000; SameSite=Lax";
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm px-4 py-3">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          This website uses only essential cookies for authentication. No tracking.
        </p>
        <Button size="sm" onClick={accept} className="shrink-0">
          OK
        </Button>
      </div>
    </div>
  );
}
