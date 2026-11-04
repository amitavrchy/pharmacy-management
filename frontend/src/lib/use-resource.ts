"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { api } from "./api";
export function useResource<T = any>(path: string) {
  const activePath = useRef(path);
  activePath.current = path;
  const sequence = useRef(0);
  const [resolvedPath, setResolvedPath] = useState(path);
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const value = await api<T>(path);
      if (activePath.current !== path || request !== sequence.current) return;
      setData(value);
      setError("");
    } catch (e) {
      if (activePath.current !== path || request !== sequence.current) return;
      setError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      if (activePath.current === path && request === sequence.current) {
        setResolvedPath(path);
        setLoading(false);
      }
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
  return {
    data: resolvedPath === path ? data : null,
    error: resolvedPath === path ? error : "",
    loading: resolvedPath !== path || loading,
    reload,
  };
}
