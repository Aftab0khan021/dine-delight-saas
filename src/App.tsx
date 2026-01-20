import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import NotFound from "./pages/NotFound";

// Public Website
import Home from "./apps/public-website/pages/Home";

// Admin Panel
import AdminAuth from "./apps/admin-panel/pages/Auth";
import AdminDashboard from "./apps/admin-panel/pages/Dashboard";

// Super Admin
import SuperAdminAuth from "./apps/super-admin/pages/Auth";
import SuperAdminDashboard from "./apps/super-admin/pages/Dashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public Website */}
          <Route path="/" element={<Home />} />
          
          {/* Admin Panel Routes */}
          <Route path="/admin/auth" element={<AdminAuth />} />
          <Route path="/admin" element={<AdminDashboard />} />
          
          {/* Super Admin Routes */}
          <Route path="/super-admin/auth" element={<SuperAdminAuth />} />
          <Route path="/super-admin" element={<SuperAdminDashboard />} />
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
