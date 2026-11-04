import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import MatchDetail from "./pages/MatchDetail.tsx";
import Performance from "./pages/Performance.tsx";
import Standings from "./pages/Standings.tsx";
import DailyTop20 from "./pages/DailyTop20.tsx";
import NotFound from "./pages/NotFound.tsx";
import { AIModeProvider } from "./contexts/AIModeContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AIModeProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/match/:matchId" element={<MatchDetail />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/standings" element={<Standings />} />
            <Route path="/daily-top20" element={<DailyTop20 />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AIModeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
