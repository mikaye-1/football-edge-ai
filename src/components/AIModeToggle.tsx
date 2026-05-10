import { useAIMode } from "@/contexts/AIModeContext";
import { Sparkles } from "lucide-react";

export function AIModeToggle() {
  const { aiMode, setAiMode } = useAIMode();
  return (
    <button
      onClick={() => setAiMode(!aiMode)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-all ${
        aiMode
          ? "bg-primary/15 text-primary border-primary/40 glow-primary"
          : "bg-secondary text-muted-foreground border-border hover:text-foreground"
      }`}
      title="Toggle AI-enhanced predictions"
    >
      <Sparkles className="w-3.5 h-3.5" />
      AI Mode: {aiMode ? "ON" : "OFF"}
    </button>
  );
}
