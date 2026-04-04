import { useEffect, useState } from "react";

export function LiveIndicator({ minute }: { minute?: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
      </span>
      LIVE {minute != null && `${minute}'`}
    </span>
  );
}

export function LiveClock({ kickoffTime, minute }: { kickoffTime: string; minute?: number | null }) {
  const [elapsed, setElapsed] = useState<string>("");

  useEffect(() => {
    function computeElapsed() {
      if (minute != null) {
        setElapsed(`${minute}'`);
        return;
      }
      const kickoff = new Date(kickoffTime).getTime();
      const now = Date.now();
      const diffMin = Math.floor((now - kickoff) / 60000);
      if (diffMin < 0) {
        setElapsed("");
      } else if (diffMin <= 45) {
        setElapsed(`${diffMin}'`);
      } else if (diffMin <= 60) {
        setElapsed("HT");
      } else if (diffMin <= 105) {
        setElapsed(`${diffMin - 15}'`);
      } else {
        setElapsed("FT");
      }
    }
    computeElapsed();
    const interval = setInterval(computeElapsed, 30000);
    return () => clearInterval(interval);
  }, [kickoffTime, minute]);

  if (!elapsed) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
      </span>
      <span className="font-mono-code text-sm font-bold text-green-500">{elapsed}</span>
    </div>
  );
}
