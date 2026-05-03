import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CartItem } from "./useRestaurantCart";

export type CollabPresence = { token: string; name?: string; joinedAt: number };

type CollabCartState = {
  items: CartItem[];
  tableLabel: string;
  sessionKey: string;
  sessionId: string;
  leaderToken: string;
  isLeader: boolean;
  participants: CollabPresence[];
};

const DEVICE_TOKEN_KEY = "dine:device_token";

function getDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

export function useCollaborativeCart(restaurantId: string, tableLabel: string) {
  const deviceToken = getDeviceToken();
  const [session, setSession] = useState<CollabCartState | null>(null);
  const [initialized, setInitialized] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Initialize or join session
  useEffect(() => {
    if (!restaurantId || !tableLabel) return;

    let mounted = true;

    const init = async () => {
      const { data, error } = await supabase.rpc("get_or_create_table_session", {
        p_restaurant_id: restaurantId,
        p_table_label: tableLabel,
        p_leader_token: deviceToken,
      });

      if (error || !data || !mounted) return;

      const sess = data as any;
      const cart = sess.cart_state as { items: CartItem[] };

      setSession({
        items: cart?.items ?? [],
        tableLabel,
        sessionKey: sess.session_key,
        sessionId: sess.id,
        leaderToken: sess.leader_token,
        isLeader: sess.leader_token === deviceToken,
        participants: [{ token: deviceToken, joinedAt: Date.now() }],
      });
      setInitialized(true);
    };

    init();
    return () => { mounted = false; };
  }, [restaurantId, tableLabel, deviceToken]);

  // Set up Realtime channel for cart sync + presence
  useEffect(() => {
    if (!session?.sessionKey) return;

    const channelName = `cart:${session.sessionKey}`;

    const channel = supabase.channel(channelName, {
      config: { presence: { key: deviceToken } }
    });

    channel
      .on("broadcast", { event: "cart_update" }, ({ payload }) => {
        if (payload.sender === deviceToken) return; // ignore own broadcasts
        setSession(prev => prev ? { ...prev, items: payload.items } : prev);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name?: string }>();
        const participants: CollabPresence[] = Object.entries(state).map(([token, presences]) => ({
          token,
          name: (presences as any)[0]?.name,
          joinedAt: (presences as any)[0]?.joinedAt ?? Date.now(),
        }));
        setSession(prev => prev ? { ...prev, participants } : prev);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: undefined, joinedAt: Date.now() });
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.sessionKey, deviceToken]);

  // Persist cart state to DB and broadcast to peers
  const syncCart = useCallback(async (newItems: CartItem[]) => {
    if (!session) return;
    setSession(prev => prev ? { ...prev, items: newItems } : prev);

    // Broadcast to channel peers
    channelRef.current?.send({
      type: "broadcast",
      event: "cart_update",
      payload: { items: newItems, sender: deviceToken },
    });

    // Persist to DB
    await supabase
      .from("table_sessions")
      .update({ cart_state: { items: newItems }, last_activity_at: new Date().toISOString() })
      .eq("id", session.sessionId);
  }, [session, deviceToken]);

  const addItem = useCallback((item: CartItem) => {
    if (!session) return;
    const existing = session.items.find(i => i.cart_id === item.cart_id);
    const newItems = existing
      ? session.items.map(i => i.cart_id === item.cart_id ? { ...i, quantity: i.quantity + (item.quantity || 1) } : i)
      : [...session.items, { ...item, quantity: item.quantity || 1 }];
    syncCart(newItems);
  }, [session, syncCart]);

  const removeItem = useCallback((cart_id: string) => {
    if (!session) return;
    syncCart(session.items.filter(i => i.cart_id !== cart_id));
  }, [session, syncCart]);

  const increment = useCallback((cart_id: string) => {
    if (!session) return;
    syncCart(session.items.map(i => i.cart_id === cart_id ? { ...i, quantity: i.quantity + 1 } : i));
  }, [session, syncCart]);

  const decrement = useCallback((cart_id: string) => {
    if (!session) return;
    const newItems = session.items
      .map(i => i.cart_id === cart_id ? { ...i, quantity: i.quantity - 1 } : i)
      .filter(i => i.quantity > 0);
    syncCart(newItems);
  }, [session, syncCart]);

  const clear = useCallback(() => syncCart([]), [syncCart]);

  // ── Split Bill Methods ──────────────────────────────────────
  const claimItem = useCallback((cart_id: string) => {
    if (!session) return;
    syncCart(session.items.map(i => i.cart_id === cart_id ? { ...i, claimedBy: deviceToken } : i));
  }, [session, syncCart, deviceToken]);

  const unclaimItem = useCallback((cart_id: string) => {
    if (!session) return;
    syncCart(session.items.map(i => i.cart_id === cart_id ? { ...i, claimedBy: undefined } : i));
  }, [session, syncCart]);

  const splitEvenly = useCallback(() => {
    if (!session || session.participants.length === 0) return;
    const tokens = session.participants.map(p => p.token);
    let idx = 0;
    const newItems = session.items.map(item => {
      if (!item.claimedBy) {
        const assignee = tokens[idx % tokens.length];
        idx++;
        return { ...item, claimedBy: assignee };
      }
      return item;
    });
    syncCart(newItems);
  }, [session, syncCart]);

  const getMyBill = useCallback(() => {
    const myItems = (session?.items ?? []).filter(i => i.claimedBy === deviceToken);
    const total = myItems.reduce((s, i) => s + i.price_cents * i.quantity, 0);
    return { items: myItems, totalCents: total };
  }, [session, deviceToken]);

  const getBillByParticipant = useCallback(() => {
    const bills: Record<string, { items: CartItem[]; totalCents: number; name?: string }> = {};
    const unclaimed: CartItem[] = [];
    for (const item of session?.items ?? []) {
      if (item.claimedBy) {
        if (!bills[item.claimedBy]) {
          const p = session?.participants.find(pp => pp.token === item.claimedBy);
          bills[item.claimedBy] = { items: [], totalCents: 0, name: p?.name };
        }
        bills[item.claimedBy].items.push(item);
        bills[item.claimedBy].totalCents += item.price_cents * item.quantity;
      } else {
        unclaimed.push(item);
      }
    }
    return { bills, unclaimed };
  }, [session]);

  const itemCount = session?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const subtotalCents = session?.items.reduce((s, i) => s + i.price_cents * i.quantity, 0) ?? 0;

  return {
    initialized,
    session,
    items: session?.items ?? [],
    isLeader: session?.isLeader ?? false,
    participants: session?.participants ?? [],
    deviceToken,
    addItem,
    removeItem,
    increment,
    decrement,
    clear,
    claimItem,
    unclaimItem,
    splitEvenly,
    getMyBill,
    getBillByParticipant,
    itemCount,
    subtotalCents,
    tableLabel,
  };
}
