import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";

// Public Website
import Home from "./apps/public-website/pages/Home";
import PublicMenu from "./apps/public-website/pages/Menu";
import TrackOrder from "./apps/public-website/pages/TrackOrder";
import RestaurantProfile from "./apps/public-website/pages/RestaurantProfile";
import QrResolver from "./apps/public-website/pages/QrResolver";

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
import { SuperAdminLayout } from "./apps/super-admin/components/SuperAdminLayout";
import SuperAdminDashboard from "./apps/super-admin/pages/Dashboard";
import SuperAdminRestaurants from "./apps/super-admin/pages/Restaurants";
import SuperAdminRestaurantDetails from "./apps/super-admin/pages/RestaurantDetails";
import SuperAdminPlans from "./apps/super-admin/pages/Plans";
import SuperAdminSubscriptions from "./apps/super-admin/pages/Subscriptions";
import SuperAdminInvoices from "./apps/super-admin/pages/Invoices";
import SuperAdminActivity from "./apps/super-admin/pages/Activity";
import SuperAdminAbuse from "./apps/super-admin/pages/Abuse";
import SuperAdminSettings from "./apps/super-admin/pages/Settings";

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
          <Route path="/r/:restaurantSlug" element={<RestaurantProfile />} />
          <Route path="/q/:code" element={<QrResolver />} />
          <Route path="/r/:restaurantSlug/menu" element={<PublicMenu />} />
          <Route path="/track" element={<TrackOrder />} />

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
          {/* Canonical: /superadmin */}
          <Route path="/superadmin/auth" element={<SuperAdminAuth />} />
          <Route path="/superadmin" element={<SuperAdminLayout />}>
            <Route index element={<Navigate to="/superadmin/dashboard" replace />} />
            <Route path="dashboard" element={<SuperAdminDashboard />} />
            <Route path="restaurants" element={<SuperAdminRestaurants />} />
            <Route path="restaurants/:id" element={<SuperAdminRestaurantDetails />} />
            <Route path="plans" element={<SuperAdminPlans />} />
            <Route path="subscriptions" element={<SuperAdminSubscriptions />} />
            <Route path="invoices" element={<SuperAdminInvoices />} />
            <Route path="activity" element={<SuperAdminActivity />} />
            <Route path="abuse" element={<SuperAdminAbuse />} />
            <Route path="settings" element={<SuperAdminSettings />} />
          </Route>

          {/* Legacy redirects: /super-admin -> /superadmin */}
          <Route path="/super-admin/auth" element={<Navigate to="/superadmin/auth" replace />} />
          <Route path="/super-admin" element={<Navigate to="/superadmin/dashboard" replace />} />
          <Route path="/super-admin/dashboard" element={<Navigate to="/superadmin/dashboard" replace />} />
          <Route path="/super-admin/restaurants" element={<Navigate to="/superadmin/restaurants" replace />} />
          <Route path="/super-admin/subscriptions" element={<Navigate to="/superadmin/subscriptions" replace />} />
          <Route path="/super-admin/invoices" element={<Navigate to="/superadmin/invoices" replace />} />
          <Route path="/super-admin/activity" element={<Navigate to="/superadmin/activity" replace />} />
          <Route path="/super-admin/abuse" element={<Navigate to="/superadmin/abuse" replace />} />
          <Route path="/super-admin/settings" element={<Navigate to="/superadmin/settings" replace />} />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
