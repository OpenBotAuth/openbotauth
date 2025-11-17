import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import EditProfile from "./pages/EditProfile";
import Registry from "./pages/Registry";
import NotFound from "./pages/NotFound";
import ConfirmUsername from "./pages/ConfirmUsername";
import Index from "./pages/Index";
import MyAgents from "./pages/MyAgents";
import AgentDetail from "./pages/AgentDetail";
import PublicProfile from "./pages/PublicProfile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/confirm-username" element={<ConfirmUsername />} />
          <Route path="/profile/edit" element={<EditProfile />} />
          <Route path="/registry" element={<Registry />} />
          <Route path="/my-agents" element={<MyAgents />} />
          <Route path="/agents/:agentId" element={<AgentDetail />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="/:username" element={<PublicProfile />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
