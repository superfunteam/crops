import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { Snapshot } from "./types";
export function useCrops() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [teamId, setTeamId] = useState(
    sessionStorage.getItem("crops.team") || "",
  );
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const sequence = useRef(0),
    generation = useRef(0),
    teamRef = useRef(teamId),
    clockOffset = useRef(0),
    mutating = useRef(false);
  const refresh = useCallback(async () => {
    // A mutation may finish after its original workspace has been left.
    if (teamRef.current !== teamId) return;
    const seq = ++sequence.current,
      context = generation.current;
    const current = () =>
      seq === sequence.current && context === generation.current;
    try {
      const data = await api<Snapshot>(
        `/state${teamId ? `?teamId=${encodeURIComponent(teamId)}` : ""}`,
      );
      if (!current()) return;
      clockOffset.current = Date.parse(data.serverTime) - Date.now();
      setState(data);
      setAuthenticated(true);
      setOnline(true);
      setLastSync(Date.now());
    } catch (e) {
      if (!current()) return;
      if (e instanceof ApiError && e.status === 403 && teamId) {
        teamRef.current = "";
        generation.current++;
        sequence.current++;
        setState(null);
        setTeamId("");
        setLoading(true);
        sessionStorage.removeItem("crops.team");
      } else if (e instanceof ApiError && e.status === 401) {
        generation.current++;
        setState(null);
        setAuthenticated(false);
        setLoading(false);
        setError("");
      } else {
        setOnline(false);
        setError((e as Error).message);
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [teamId]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(poll, 5000);
    };
    timer = setTimeout(poll, 5000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [authenticated, refresh]);
  useEffect(() => {
    const id = setInterval(
      () => setNow(Date.now() + clockOffset.current),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  const mutate = async <T = unknown>(
    path: string,
    body?: unknown,
    method = "POST",
  ): Promise<T> => {
    if (mutating.current)
      throw new Error("Please wait for the current change to finish.");
    const context = generation.current;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<T>(path, method, body);
      if (context === generation.current) await refresh();
      return result;
    } catch (e) {
      if (context === generation.current) {
        setError((e as Error).message);
        if (e instanceof ApiError && e.status === 409) await refresh();
      }
      throw e;
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  };
  const switchTeam = (id: string) => {
    generation.current++;
    sequence.current++;
    teamRef.current = id;
    setState(null);
    setLoading(true);
    setTeamId(id);
    sessionStorage.setItem("crops.team", id);
  };
  const signOut = async () => {
    if (mutating.current) return;
    await api("/auth/logout", "POST");
    generation.current++;
    sequence.current++;
    teamRef.current = "";
    setState(null);
    setAuthenticated(false);
    setTeamId("");
    sessionStorage.removeItem("crops.team");
    setError("");
  };
  return {
    state,
    loading,
    authenticated,
    error,
    setError,
    online,
    busy,
    now,
    lastSync,
    refresh,
    mutate,
    switchTeam,
    signOut,
  };
}
export type Crops = ReturnType<typeof useCrops>;
