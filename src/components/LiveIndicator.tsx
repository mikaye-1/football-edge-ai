export function LiveIndicator({ minute }: { minute?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
      </span>
      LIVE {minute && `${minute}'`}
    </span>
  );
}
