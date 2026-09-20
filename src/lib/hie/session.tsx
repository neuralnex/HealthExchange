import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearSession, getStoredToken, getStoredUser, storeSession } from "./client";
import type { SessionUser } from "./types";

interface SessionCtx {
  user: SessionUser | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<SessionUser>;
  signOut: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    const token = getStoredToken();
    if (stored && token) setUser(stored);
    setReady(true);
  }, []);

  const value = useMemo<SessionCtx>(
    () => ({
      user,
      ready,
      signIn: async (email, password) => {
        const res = await api.login(email, password);
        storeSession(res.token, res.user);
        setUser(res.user);
        return res.user;
      },
      signOut: () => {
        clearSession();
        setUser(null);
      },
    }),
    [user, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession outside provider");
  return ctx;
}
