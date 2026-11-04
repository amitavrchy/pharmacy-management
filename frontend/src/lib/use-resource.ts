"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
export function useResource<T = any>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    try {
      const value = await api<T>(path);
      setData(value);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setLoading(true);
    setData(null);
    reload();
    const on = () => reload();
    window.addEventListener("pharmacy:refresh", on);
    return () => window.removeEventListener("pharmacy:refresh", on);
  }, [reload]);
  return { data, error, loading, reload };
}
