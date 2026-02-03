import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

// Marketing pages
import Home from "./pages/marketing/Home";
import Publishers from "./pages/marketing/Publishers";
import Crawlers from "./pages/marketing/Crawlers";
import Contact from "./pages/marketing/Contact";
import Privacy from "./pages/marketing/Privacy";
import Terms from "./pages/marketing/Terms";
import Radar from "./pages/Radar";

// Portal pages
import Login from "./pages/portal/Login";
import Setup from "./pages/portal/Setup";
import EditProfile from "./pages/portal/EditProfile";
import Registry from "./pages/portal/Registry";
import NotFound from "./pages/NotFound";
import ConfirmUsername from "./pages/portal/ConfirmUsername";
import Index from "./pages/Index";
import MyAgents from "./pages/portal/MyAgents";
import AgentDetail from "./pages/portal/AgentDetail";
import Tokens from "./pages/portal/Tokens";
import PublicProfile from "./pages/portal/PublicProfile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Marketing routes - public */}
            <Route path="/" element={<Home />} />
            <Route path="/publishers" element={<Publishers />} />
            <Route path="/crawlers" element={<Crawlers />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/radar" element={<Radar />} />
            
            {/* Portal routes - authenticated */}
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/confirm-username" element={<ConfirmUsername />} />
            <Route path="/profile/edit" element={<EditProfile />} />
            <Route path="/registry" element={<Registry />} />
            <Route path="/my-agents" element={<MyAgents />} />
            <Route path="/agents/:agentId" element={<AgentDetail />} />
            <Route path="/tokens" element={<Tokens />} />
            
            {/* Legacy route - redirect to registry */}
            <Route path="/portal" element={<Index />} />
            
            {/* Public profile - must be after all other routes */}
            <Route path="/:username" element={<PublicProfile />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
