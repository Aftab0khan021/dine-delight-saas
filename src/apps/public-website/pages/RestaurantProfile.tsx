import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type RestaurantRow = Tables<"restaurants">;

function normalizeSettings(settings: any | null) {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
}

export default function RestaurantProfile() {
  const { restaurantSlug } = useParams();
  const slug = (restaurantSlug ?? "").trim();

  const restaurantQuery = useQuery({
    queryKey: ["public", "restaurant-profile", slug],
    enabled: !!slug,
    queryFn: async (): Promise<RestaurantRow> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data;
    },
  });

  const coverImageUrl = useMemo(() => {
    const s = normalizeSettings(restaurantQuery.data?.settings ?? null);
    return (s.cover_image_url as string | null) ?? null;
  }, [restaurantQuery.data?.settings]);

  useEffect(() => {
    const name = restaurantQuery.data?.name;
    document.title = name ? `${name} — Restaurant` : "Restaurant";
  }, [restaurantQuery.data?.name]);

  if (!slug) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Restaurant</h1>
          <p className="mt-2 text-muted-foreground">
            Missing restaurant slug. Try: <span className="font-mono">/r/your-slug</span>
          </p>
        </div>
      </main>
    );
  }

  const isLoading = restaurantQuery.isLoading;
  const errorMessage = (restaurantQuery.error as Error | null)?.message ?? null;
  const restaurant = restaurantQuery.data ?? null;

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 max-w-4xl flex items-center justify-between gap-4">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <Link to={`/menu?restaurant=${encodeURIComponent(slug)}`}>
            <Button size="sm" variant="secondary">View Menu</Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {isLoading ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Loading restaurant…</p>
          </Card>
        ) : errorMessage ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </Card>
        ) : !restaurant ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Restaurant not found.</p>
          </Card>
        ) : (
          <section className="space-y-6">
            {coverImageUrl ? (
              <div className="overflow-hidden rounded-xl border bg-muted">
                <img
                  src={coverImageUrl}
                  alt={`${restaurant.name} cover image`}
                  className="h-48 w-full object-cover sm:h-64"
                  loading="lazy"
                />
              </div>
            ) : null}

            <Card className="p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-4">
                  {restaurant.logo_url ? (
                    <img
                      src={restaurant.logo_url}
                      alt={`${restaurant.name} logo`}
                      className="h-14 w-14 rounded-lg object-cover border"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-lg border bg-muted" aria-hidden="true" />
                  )}

                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight">{restaurant.name}</h1>
                    {restaurant.description ? (
                      <p className="mt-2 text-muted-foreground whitespace-pre-line">
                        {restaurant.description}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No description provided.</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/menu?restaurant=${encodeURIComponent(slug)}`}>
                    <Button size="lg">View Menu</Button>
                  </Link>
                </div>
              </div>
            </Card>
          </section>
        )}
      </div>
    </main>
  );
}
