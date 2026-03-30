import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export function RefreshTimer() {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <RefreshCw className={`w-3.5 h-3.5 ${countdown <= 5 ? "text-primary animate-spin" : ""}`} />
      <span className="font-mono-code">
        {countdown <= 5 ? "Refreshing..." : `Next update: ${countdown}s`}
      </span>
    </div>
  );
}
