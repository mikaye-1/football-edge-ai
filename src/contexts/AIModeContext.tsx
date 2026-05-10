import { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface AIModeContextValue {
  aiMode: boolean;
  setAiMode: (v: boolean) => void;
}

const AIModeContext = createContext<AIModeContextValue>({ aiMode: false, setAiMode: () => {} });

export function AIModeProvider({ children }: { children: ReactNode }) {
  const [aiMode, setAiModeState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("predictiq.aiMode") === "true";
  });

  useEffect(() => {
    localStorage.setItem("predictiq.aiMode", String(aiMode));
  }, [aiMode]);

  return (
    <AIModeContext.Provider value={{ aiMode, setAiMode: setAiModeState }}>
      {children}
    </AIModeContext.Provider>
  );
}

export function useAIMode() {
  return useContext(AIModeContext);
}
