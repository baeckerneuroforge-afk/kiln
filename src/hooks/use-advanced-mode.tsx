"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface AdvancedModeContextValue {
  advancedMode: boolean;
  setAdvancedMode: (value: boolean) => void;
  loading: boolean;
}

const AdvancedModeContext = createContext<AdvancedModeContextValue>({
  advancedMode: false,
  setAdvancedMode: () => {},
  loading: true,
});

export function AdvancedModeProvider({ children }: { children: React.ReactNode }) {
  const [advancedMode, setAdvancedModeState] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/user/preferences")
      .then((res) => res.json())
      .then((data) => setAdvancedModeState(data.advancedMode ?? false))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setAdvancedMode = useCallback((value: boolean) => {
    setAdvancedModeState(value);
    // Persist im Hintergrund
    fetch("/api/user/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ advancedMode: value }),
    }).catch(() => {});
  }, []);

  return (
    <AdvancedModeContext.Provider value={{ advancedMode, setAdvancedMode, loading }}>
      {children}
    </AdvancedModeContext.Provider>
  );
}

export function useAdvancedMode() {
  return useContext(AdvancedModeContext);
}
