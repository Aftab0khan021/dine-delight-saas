import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Reads platform_config branding settings and applies them as CSS custom properties
 * on the document root. This enables the WhiteLabel settings to actually take effect.
 */
export function usePlatformBranding() {
  const { data: branding } = useQuery({
    queryKey: ["platform-config", "branding"],
    queryFn: async () => {
      const { data } = await supabase
        .from("platform_config")
        .select("value")
        .eq("key", "branding")
        .maybeSingle();
      return data?.value || null;
    },
    staleTime: 600000, // Cache for 10 minutes
    retry: false,
  });

  useEffect(() => {
    if (!branding) return;

    const root = document.documentElement;

    // Apply platform name to document title if set
    if (branding.platform_name && branding.platform_name !== "Dine Delight") {
      const currentTitle = document.title;
      if (currentTitle.includes("Dine Delight")) {
        document.title = currentTitle.replace("Dine Delight", branding.platform_name);
      }
    }

    // Apply favicon if set
    if (branding.favicon_url) {
      let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
    }

    // Apply brand colors as CSS custom properties
    if (branding.primary_color) {
      root.style.setProperty("--brand-primary", branding.primary_color);
    }
    if (branding.accent_color) {
      root.style.setProperty("--brand-accent", branding.accent_color);
    }

    return () => {
      root.style.removeProperty("--brand-primary");
      root.style.removeProperty("--brand-accent");
    };
  }, [branding]);

  return branding;
}
