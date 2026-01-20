import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";


// Public Website
import Home from "./apps/public-website/pages/Home";
import PublicMenu from "./apps/public-website/pages/Menu";

// Admin Panel
import AdminAuth from "./apps/admin-panel/pages/Auth";
import { AdminLayout } from "./apps/admin-panel/components/AdminLayout";
import AdminDashboard from "./apps/admin-panel/pages/Dashboard";
import AdminOrders from "./apps/admin-panel/pages/Orders";
import AdminMenu from "./apps/admin-panel/pages/Menu";
import AdminQrMenu from "./apps/admin-panel/pages/QrMenu";
import AdminStaff from "./apps/admin-panel/pages/Staff";
import AdminBranding from "./apps/admin-panel/pages/Branding";
import AdminBilling from "./apps/admin-panel/pages/Billing";

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
          <Route path="/menu" element={<PublicMenu />} />

          {/* Admin Panel Routes */}
          <Route path="/admin/auth" element={<AdminAuth />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="menu" element={<AdminMenu />} />
            <Route path="qr" element={<AdminQrMenu />} />
            {/* Backwards compatible */}
            <Route path="qr-menu" element={<Navigate to="/admin/qr" replace />} />
            <Route path="staff" element={<AdminStaff />} />
            <Route path="branding" element={<AdminBranding />} />
            <Route path="billing" element={<AdminBilling />} />
          </Route>

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
