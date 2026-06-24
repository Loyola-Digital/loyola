"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

// Epic 37 — callback do OAuth GA4. Espelha google-ads/callback: roda no popup,
// posta o `code` (ou erro) pro window.opener e fecha.
function CallbackHandler() {
  const searchParams = useSearchParams();
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const code = searchParams.get("code");
    const error = searchParams.get("error");
    if (error) {
      window.opener?.postMessage({ type: "ga4-auth", error }, window.location.origin);
      window.close();
      return;
    }
    if (code) {
      window.opener?.postMessage({ type: "ga4-auth", code }, window.location.origin);
      window.close();
    }
  }, [searchParams]);

  return null;
}

export default function Ga4CallbackPage() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Conectando com Google Analytics...</p>
      </div>
      <Suspense><CallbackHandler /></Suspense>
    </div>
  );
}
