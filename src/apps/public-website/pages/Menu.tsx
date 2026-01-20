import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function formatMoney(cents: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format((cents ?? 0) / 100);
  } catch {
    return `$${((cents ?? 0) / 100).toFixed(2)}`;
  }
}

type RestaurantRow = Tables<"restaurants">;
type CategoryRow = Tables<"categories">;
type MenuItemRow = Tables<"menu_items">;

type CategoryWithItems = CategoryRow & { items: MenuItemRow[] };

export default function PublicMenu() {
  const [params] = useSearchParams();
  const slug = (params.get("restaurant") ?? "").trim();

  const restaurantQuery = useQuery({
    queryKey: ["public-menu", "restaurant", slug],
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

  const categoriesQuery = useQuery({
    queryKey: ["public-menu", "categories", slug, restaurantQuery.data?.id],
    enabled: !!restaurantQuery.data?.id,
    queryFn: async (): Promise<CategoryRow[]> => {
      const restaurantId = restaurantQuery.data!.id;
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["public-menu", "items", slug, restaurantQuery.data?.id],
    enabled: !!restaurantQuery.data?.id,
    queryFn: async (): Promise<MenuItemRow[]> => {
      const restaurantId = restaurantQuery.data!.id;
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const categoriesWithItems = useMemo((): CategoryWithItems[] => {
    const categories = categoriesQuery.data ?? [];
    const items = itemsQuery.data ?? [];

    const byCategory = new Map<string, MenuItemRow[]>();
    for (const item of items) {
      const key = item.category_id ?? "__uncategorized__";
      const list = byCategory.get(key) ?? [];
      list.push(item);
      byCategory.set(key, list);
    }

    const result: CategoryWithItems[] = categories
      .map((c) => ({ ...c, items: byCategory.get(c.id) ?? [] }))
      .filter((c) => c.items.length > 0);

    const uncategorized = byCategory.get("__uncategorized__") ?? [];
    if (uncategorized.length > 0) {
      result.push({
        id: "__uncategorized__" as unknown as string,
        restaurant_id: restaurantQuery.data?.id ?? ("" as unknown as string),
        name: "Other",
        description: null,
        is_active: true,
        sort_order: Number.MAX_SAFE_INTEGER,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: uncategorized,
      });
    }

    return result;
  }, [categoriesQuery.data, itemsQuery.data, restaurantQuery.data?.id]);

  const loading =
    (!!slug && restaurantQuery.isLoading) ||
    categoriesQuery.isLoading ||
    itemsQuery.isLoading;

  const errorMessage =
    (restaurantQuery.error as Error | null)?.message ??
    (categoriesQuery.error as Error | null)?.message ??
    (itemsQuery.error as Error | null)?.message ??
    null;

  useEffect(() => {
    const name = restaurantQuery.data?.name;
    document.title = name ? `${name} Menu` : "Menu";
  }, [restaurantQuery.data?.name]);

  if (!slug) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="mt-2 text-muted-foreground">
            Add a restaurant slug in the URL like:{" "}
            <span className="font-mono">/menu?restaurant=your-slug</span>
          </p>
          <Card className="mt-6 p-6">
            <p className="text-sm text-muted-foreground">
              This page is read-only and intended for guests.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-3xl">
          <div className="flex items-center gap-4">
            {restaurantQuery.data?.logo_url ? (
              <img
                src={restaurantQuery.data.logo_url}
                alt={`${restaurantQuery.data.name} logo`}
                className="h-12 w-12 rounded-md object-cover border"
                loading="lazy"
              />
            ) : (
              <div className="h-12 w-12 rounded-md border bg-muted" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight truncate">
                {restaurantQuery.data?.name ?? "Menu"}
              </h1>
              {restaurantQuery.data?.description ? (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {restaurantQuery.data.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {loading ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Loading menu…</p>
          </Card>
        ) : errorMessage ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </Card>
        ) : categoriesWithItems.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              No active menu items yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-10">
            {categoriesWithItems.map((category) => (
              <section key={category.id} aria-labelledby={`cat-${category.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <h2
                      id={`cat-${category.id}`}
                      className="text-lg font-semibold tracking-tight"
                    >
                      {category.name}
                    </h2>
                    {category.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {category.items.map((item) => (
                    <Card key={item.id} className="p-4">
                      <div className="flex gap-4">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-20 w-20 rounded-md object-cover border"
                            loading="lazy"
                          />
                        ) : null}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{item.name}</p>
                              {item.description ? (
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                  {item.description}
                                </p>
                              ) : null}
                            </div>
                            <p className="font-medium tabular-nums whitespace-nowrap">
                              {formatMoney(item.price_cents, item.currency_code)}
                            </p>
                          </div>

                          {item.sku ? (
                            <>
                              <Separator className="my-3" />
                              <p className="text-xs text-muted-foreground font-mono">
                                {item.sku}
                              </p>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
