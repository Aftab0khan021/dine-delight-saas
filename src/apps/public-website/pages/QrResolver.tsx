import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";

function normalizeDestination(dest: string) {
  const trimmed = dest.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
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
