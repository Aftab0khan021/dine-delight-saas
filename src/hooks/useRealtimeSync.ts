/**
 * useRealtimeSync — Centralized Supabase real-time hook
 *
 * Usage:
 *   useRealtimeSync(restaurantId, [
 *     { table: "menu_items",  queryKey: ["admin", "menu"] },
 *     { table: "categories",  queryKey: ["admin", "menu"] },
 *   ]);
 *
 * Features:
 * - Opens a single Supabase channel per hook call (efficient — no channel-per-table overhead)
 * - Automatically appends restaurant_id filter so we never receive other restaurants' events
 * - Deduplicates invalidations: if two tables share the same queryKey, the cache is only
 *   invalidated once per event burst (50 ms debounce)
 * - Cleans up (removes channel) on component unmount or when restaurantId changes
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RealtimeSyncConfig {
  /** Database table name to watch */
  table: string;
  /** TanStack Query key prefix to invalidate on any change. Partial match — all keys starting with this prefix are invalidated. */
  queryKey: string[];
  /** Optional column to filter on (default: "restaurant_id"). Set to null to skip filter. */
  filterColumn?: string | null;
}

export function useRealtimeSync(
  restaurantId: string | undefined | null,
  configs: RealtimeSyncConfig[]
) {
  const qc = useQueryClient();
  // Store pending invalidations to debounce rapid bursts
  const pendingRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!restaurantId || configs.length === 0) return;

    // Unique, stable channel name scoped to this restaurant + set of tables
    const tableNames = configs.map((c) => c.table).sort().join("-");
    const channelName = `realtime-sync:${restaurantId}:${tableNames}`;

    let channel = supabase.channel(channelName);

    for (const cfg of configs) {
      const filterColumn = cfg.filterColumn === undefined ? "restaurant_id" : cfg.filterColumn;
      const filter = filterColumn ? `${filterColumn}=eq.${restaurantId}` : undefined;

      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: cfg.table,
          ...(filter ? { filter } : {}),
        },
        () => {
          // Collect the query key string for deduplication
          const keyStr = JSON.stringify(cfg.queryKey);
          pendingRef.current.add(keyStr);

          // Debounce: flush all pending invalidations 50 ms after the last event
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            for (const keyStr of pendingRef.current) {
              const queryKey = JSON.parse(keyStr) as string[];
              qc.invalidateQueries({ queryKey });
            }
            pendingRef.current.clear();
          }, 50);
        }
      );
    }

    channel.subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, qc]);
}
