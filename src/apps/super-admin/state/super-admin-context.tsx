import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

type SuperAdminContextValue = {
  loading: boolean;
  accessDenied: boolean;
  userEmail?: string;
  refresh: () => Promise<void>;
};

const SuperAdminContext = createContext<SuperAdminContextValue | null>(null);

export function SuperAdminProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

  const load = async () => {
    setLoading(true);
    setAccessDenied(false);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      navigate("/superadmin/auth", { replace: true });
      setLoading(false);
      return;
    }

    setUserEmail(session.user.email ?? undefined);

    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "super_admin")
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setAccessDenied(true);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/superadmin/auth", { replace: true });
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const value = useMemo<SuperAdminContextValue>(
    () => ({ loading, accessDenied, userEmail, refresh: load }),
    [loading, accessDenied, userEmail],
  );

  return <SuperAdminContext.Provider value={value}>{children}</SuperAdminContext.Provider>;
}

export function useSuperAdminContext() {
  const ctx = useContext(SuperAdminContext);
  if (!ctx) throw new Error("useSuperAdminContext must be used within SuperAdminProvider");
  return ctx;
}
