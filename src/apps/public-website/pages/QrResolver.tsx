import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

function normalizeDestination(dest: string): string {
  const trimmed = dest.trim();
  if (!trimmed) return "";
  // Internal paths (start with /) are always safe — use client-side navigate
  if (trimmed.startsWith("/")) return trimmed;
  // H1 — External URLs: only allow our own origin to prevent open redirect attacks.
  // QR codes stored in the DB should only point to internal paths anyway.
  // If a future use case requires external URLs, add domains to this list explicitly.
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const appOrigin = window.location.origin;
      if (url.origin === appOrigin) {
        // Same origin — treat as an internal path
        return url.pathname + url.search + url.hash;
      }
    } catch {
      // malformed URL — reject
    }
    // External domain — reject to prevent open redirect
    return "";
  }
  return `/${trimmed}`;
}

export default function QrResolver() {
  const navigate = useNavigate();
  const { code } = useParams();
  const qrCode = (code ?? "").trim();

  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);

  const title = useMemo(() => (invalid ? "Invalid QR" : "Opening…"), [invalid]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!qrCode) {
        setLoading(false);
        setInvalid(true);
        return;
      }

      setLoading(true);
      setInvalid(false);

      const { data, error } = await supabase.functions.invoke("qr-resolve", {
        body: { code: qrCode },
      });

      if (cancelled) return;

      if (error || !data?.destination_path) {
        setLoading(false);
        setInvalid(true);
        return;
      }

      const destination = normalizeDestination(String(data.destination_path));
      if (!destination) {
        setLoading(false);
        setInvalid(true);
        return;
      }

      // Prefer client-side navigation for internal destinations.
      if (destination.startsWith("/")) {
        navigate(destination, { replace: true });
        return;
      }

      window.location.replace(destination);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [navigate, qrCode]);

  if (!invalid && loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-md">
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Opening…</p>
          </Card>
        </div>
      </main>
    );
  }

  if (invalid) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-md">
          <Card className="p-6">
            <h1 className="text-lg font-semibold tracking-tight">Invalid or expired QR code</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This QR code is not active or could not be found.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return null;
}
