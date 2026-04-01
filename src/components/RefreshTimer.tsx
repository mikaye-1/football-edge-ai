import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export function RefreshTimer() {
  const [countdown, setCountdown] = useState(30);
  const [fetching, setFetching] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleFetch = async () => {
    setFetching(true);
    try {
      const { error } = await supabase.functions.invoke("fetch-odds");
      if (error) console.error("Fetch odds error:", error);
      queryClient.invalidateQueries();
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setFetching(false);
      setCountdown(30);
    }
  };

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className={`w-3.5 h-3.5 ${countdown <= 5 ? "text-primary animate-spin" : ""}`} />
        <span className="font-mono-code">
          {countdown <= 5 ? "Refreshing..." : `${countdown}s`}
        </span>
      </div>
      <button
        onClick={handleFetch}
        disabled={fetching}
        className="px-2.5 sm:px-3 py-1 rounded-md text-xs font-semibold gradient-primary text-primary-foreground disabled:opacity-50 transition-all"
      >
        {fetching ? "..." : "Fetch Now"}
      </button>
    </div>
  );
}
