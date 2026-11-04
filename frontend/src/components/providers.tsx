"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { api, post } from "@/lib/api";
import { clearLocal } from "@/lib/offline";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
type Context = {
  user: any;
  loading: boolean;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};
const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function Providers({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    );
  const reload = useCallback(async () => {
    try {
      setUser(await api("auth/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [reload]);
  useEffect(() => {
    if (!user) return;
    const source = new EventSource("/api/events");
    source.onmessage = () =>
      window.dispatchEvent(new Event("pharmacy:refresh"));
    return () => source.close();
  }, [user?.id]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  async function logout() {
    await post("auth/logout");
    await clearLocal();
    setUser(null);
    location.href = "/login";
  }
  return (
    <AppContext.Provider value={{ user, loading, reload, logout, notify }}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <AlertCircle size={21} /> : <CheckCircle2 size={21} />}
          <span>{toast.message}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
