import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import NotFound from "./pages/NotFound";

// Public Website
import Home from "./apps/public-website/pages/Home";
import PublicMenu from "./apps/public-website/pages/Menu";
import TrackOrder from "./apps/public-website/pages/TrackOrder";
import RestaurantProfile from "./apps/public-website/pages/RestaurantProfile";
import QrResolver from "./apps/public-website/pages/QrResolver";
import CustomerDashboard from "./apps/public-website/pages/CustomerDashboard";
import TableReservation from "./apps/public-website/pages/TableReservation";
import PrivacyPolicy from "./apps/public-website/pages/PrivacyPolicy";
import TermsOfService from "./apps/public-website/pages/TermsOfService";

// Admin Panel
import AdminAuth from "./apps/admin-panel/pages/Auth";
import SetPassword from "./apps/admin-panel/pages/SetPassword";
import AuthCallback from "./apps/admin-panel/pages/AuthCallback";
import AcceptInvitation from "./apps/admin-panel/pages/AcceptInvitation";
import { AdminLayout } from "./apps/admin-panel/components/AdminLayout";
import AdminDashboard from "./apps/admin-panel/pages/Dashboard";
import AdminOrders from "./apps/admin-panel/pages/Orders";
import AdminMenu from "./apps/admin-panel/pages/Menu";
import AdminQrMenu from "./apps/admin-panel/pages/QrMenu";
import AdminStaff from "./apps/admin-panel/pages/Staff";
import AdminStaffCategories from "./apps/admin-panel/pages/StaffCategories";
import AdminBranding from "./apps/admin-panel/pages/Branding";
import AdminBilling from "./apps/admin-panel/pages/Billing";
import AdminCoupons from "./apps/admin-panel/pages/Coupons";
import AdminMarketing from "./apps/admin-panel/pages/Marketing";
import AdminMenuInsights from "./apps/admin-panel/pages/MenuInsights";
import AdminDeveloperAPI from "./apps/admin-panel/pages/DeveloperAPI";
import AdminKitchenDashboard from "./apps/admin-panel/pages/KitchenDashboard";
import AdminReservations from "./apps/admin-panel/pages/Reservations";
import AdminInventory from "./apps/admin-panel/pages/Inventory";
import AdminOTPSettings from "./apps/admin-panel/pages/OTPSettings";
import AdminReviews from "./apps/admin-panel/pages/Reviews";
import AdminCustomers from "./apps/admin-panel/pages/Customers";
import AdminAnalytics from "./apps/admin-panel/pages/Analytics";
import AdminDeliveryZones from "./apps/admin-panel/pages/DeliveryZones";
import AdminExploreFeatures from "./apps/admin-panel/pages/ExploreFeatures";
import { ProtectedRoute } from "./apps/admin-panel/components/ProtectedRoute";
import { usePermissionContext } from "./apps/admin-panel/state/permission-context";

// Super Admin
import SuperAdminAuth from "./apps/super-admin/pages/Auth";
import { SuperAdminLayout } from "./apps/super-admin/components/SuperAdminLayout";
import SuperAdminDashboard from "./apps/super-admin/pages/Dashboard";
import SuperAdminRestaurants from "./apps/super-admin/pages/Restaurants";
import SuperAdminRestaurantDetails from "./apps/super-admin/pages/RestaurantDetails";
import SuperAdminPlans from "./apps/super-admin/pages/Plans";
import SuperAdminSubscriptions from "./apps/super-admin/pages/Subscriptions";
import SuperAdminFeatureFlags from "./apps/super-admin/pages/FeatureFlags";
import SuperAdminFeatureAccess from "./apps/super-admin/pages/FeatureAccess";
import SuperAdminInvoices from "./apps/super-admin/pages/Invoices";
import SuperAdminActivity from "./apps/super-admin/pages/Activity";
import SuperAdminAbuse from "./apps/super-admin/pages/Abuse";
import SuperAdminSupport from "./apps/super-admin/pages/Support";
import SuperAdminErrors from "./apps/super-admin/pages/Errors";
import SuperAdminSettings from "./apps/super-admin/pages/Settings";
import SuperAdminUsers from "./apps/super-admin/pages/Users";
import SuperAdminPendingApprovals from "./apps/super-admin/pages/PendingApprovals";
import SuperAdminCloudKitchens from "./apps/super-admin/pages/CloudKitchens";
// From dev branch: AI management + WhatsApp bot pages
import SuperAdminAIProviders from "./apps/super-admin/pages/AIProviders";
import SuperAdminAICostTracking from "./apps/super-admin/pages/AICostTracking";
import SuperAdminAIUsageAnalytics from "./apps/super-admin/pages/AIUsageAnalytics";
import SuperAdminRestaurantAIConfig from "./apps/super-admin/pages/RestaurantAIConfig";
import SuperAdminWhatsAppManagement from "./apps/super-admin/pages/WhatsAppManagement";
import SuperAdminAnnouncements from "./apps/super-admin/pages/Announcements";
import SuperAdminAuditLog from "./apps/super-admin/pages/AuditLog";
import SuperAdminWhiteLabel from "./apps/super-admin/pages/WhiteLabel";
import AdminWhatsAppSettings from "./apps/admin-panel/pages/WhatsAppSettings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Critical: prevents unhandled query errors from crashing Error Boundary.
      // Pages show empty states instead of crashing.
      throwOnError: false,
    },
  },
});

/**
 * Intercepts Supabase auth hash tokens on ANY page.
 * When a recovery/invite email redirects to the root (/#access_token=...&type=recovery),
 * this catches the hash and forwards the user to /auth/set-password.
 */
function AuthHashHandler() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;

    const params = new URLSearchParams(hash.replace("#", ""));
    const type = params.get("type");
    const accessToken = params.get("access_token");

    if ((type === "recovery" || type === "invite") && accessToken) {
      // Preserve the hash so SetPassword.tsx can read the tokens
      navigate("/auth/set-password" + hash, { replace: true });
    }
  }, [navigate]);

  return null;
}

/**
 * Smart redirect for /admin index.
 * Admins → dashboard.
 * Staff → first page they have permission for.
 */
function SmartAdminRedirect() {
  const { isAdmin, hasPermission, loading } = usePermissionContext();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // Admins always go to dashboard
  if (isAdmin) return <Navigate to="/admin/dashboard" replace />;

  // Staff: find first page they have access to
  const staffRoutes = [
    { path: "/admin/dashboard", perm: "view_dashboard" },
    { path: "/admin/orders", perm: "view_orders" },
    { path: "/admin/kitchen", perm: "view_kitchen" },
    { path: "/admin/menu", perm: "view_menu" },
    { path: "/admin/qr", perm: "view_qr" },
    { path: "/admin/staff", perm: "view_staff" },
    { path: "/admin/branding", perm: "manage_settings" },
    { path: "/admin/coupons", perm: "view_coupons" },
    { path: "/admin/reservations", perm: "view_reservations" },
    { path: "/admin/reviews", perm: "view_reviews" },
    { path: "/admin/inventory", perm: "view_inventory" },
    { path: "/admin/analytics", perm: "view_analytics" },
  ];

  for (const route of staffRoutes) {
    if (hasPermission(route.perm as any)) {
      return <Navigate to={route.path} replace />;
    }
  }

  // No permissions at all — fallback to dashboard (will show permission denied)
  return <Navigate to="/admin/dashboard" replace />;
}
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthHashHandler />
        <Routes>
          {/* Public Website */}
          <Route path="/" element={<Home />} />
          <Route path="/r/:restaurantSlug" element={<RestaurantProfile />} />
          <Route path="/r/:restaurantSlug/account" element={<CustomerDashboard />} />
          <Route path="/r/:restaurantSlug/reserve" element={<TableReservation />} />
          <Route path="/q/:code" element={<QrResolver />} />
          <Route path="/r/:restaurantSlug/menu" element={<PublicMenu />} />
          <Route path="/track" element={<TrackOrder />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsOfService />} />

          {/* Admin Panel Routes */}
          <Route path="/admin/auth" element={<AdminAuth />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/set-password" element={<SetPassword />} />
          <Route path="/auth/accept-invitation" element={<AcceptInvitation />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<SmartAdminRedirect />} />
            <Route path="dashboard" element={<ProtectedRoute permission="view_dashboard"><AdminDashboard /></ProtectedRoute>} />
            <Route path="orders" element={<ProtectedRoute permission="view_orders"><AdminOrders /></ProtectedRoute>} />
            <Route path="menu" element={<ProtectedRoute permission="view_menu"><AdminMenu /></ProtectedRoute>} />
            <Route path="qr" element={<ProtectedRoute permission="view_qr"><AdminQrMenu /></ProtectedRoute>} />
            {/* Backwards compatible */}
            <Route path="qr-menu" element={<Navigate to="/admin/qr" replace />} />
            <Route path="staff" element={<ProtectedRoute permission="view_staff"><AdminStaff /></ProtectedRoute>} />
            <Route path="staff-categories" element={<ProtectedRoute adminOnly><AdminStaffCategories /></ProtectedRoute>} />
            <Route path="branding" element={<ProtectedRoute permission="manage_settings"><AdminBranding /></ProtectedRoute>} />
            <Route path="billing" element={<ProtectedRoute adminOnly><AdminBilling /></ProtectedRoute>} />
            <Route path="coupons" element={<ProtectedRoute permission="view_coupons"><AdminCoupons /></ProtectedRoute>} />
            <Route path="marketing" element={<ProtectedRoute adminOnly><AdminMarketing /></ProtectedRoute>} />
            <Route path="reviews" element={<ProtectedRoute permission="view_reviews"><AdminReviews /></ProtectedRoute>} />
            <Route path="insights" element={<ProtectedRoute adminOnly><AdminMenuInsights /></ProtectedRoute>} />
            <Route path="developer" element={<ProtectedRoute adminOnly><AdminDeveloperAPI /></ProtectedRoute>} />
            <Route path="kitchen" element={<ProtectedRoute permission="view_kitchen"><AdminKitchenDashboard /></ProtectedRoute>} />
            <Route path="reservations" element={<ProtectedRoute permission="view_reservations"><AdminReservations /></ProtectedRoute>} />
            <Route path="inventory" element={<ProtectedRoute permission="view_inventory"><AdminInventory /></ProtectedRoute>} />
            {/* WhatsApp bot settings (from dev merge) */}
            <Route path="whatsapp" element={<ProtectedRoute adminOnly><AdminWhatsAppSettings /></ProtectedRoute>} />
            <Route path="otp-settings" element={<ProtectedRoute adminOnly><AdminOTPSettings /></ProtectedRoute>} />
            {/* Enhancement batch */}
            <Route path="customers" element={<ProtectedRoute adminOnly><AdminCustomers /></ProtectedRoute>} />
            <Route path="analytics" element={<ProtectedRoute permission="view_analytics"><AdminAnalytics /></ProtectedRoute>} />
            <Route path="delivery-zones" element={<ProtectedRoute adminOnly><AdminDeliveryZones /></ProtectedRoute>} />
            <Route path="explore" element={<ProtectedRoute adminOnly><AdminExploreFeatures /></ProtectedRoute>} />
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
            <Route path="features" element={<SuperAdminFeatureFlags />} />
            <Route path="features/access" element={<SuperAdminFeatureAccess />} />
            <Route path="invoices" element={<SuperAdminInvoices />} />
            <Route path="activity" element={<Navigate to="/superadmin/audit-log" replace />} />
            <Route path="abuse" element={<SuperAdminAbuse />} />
            <Route path="support" element={<SuperAdminSupport />} />
            <Route path="errors" element={<SuperAdminErrors />} />
            <Route path="users" element={<SuperAdminUsers />} />
            <Route path="settings" element={<SuperAdminSettings />} />
            <Route path="approvals" element={<SuperAdminPendingApprovals />} />
            <Route path="cloud-kitchens" element={<SuperAdminCloudKitchens />} />
            {/* AI Management (from dev merge) */}
            <Route path="ai/providers" element={<SuperAdminAIProviders />} />
            <Route path="ai/costs" element={<SuperAdminAICostTracking />} />
            <Route path="ai/usage" element={<SuperAdminAIUsageAnalytics />} />
            <Route path="restaurants/:id/ai" element={<SuperAdminRestaurantAIConfig />} />
            {/* WhatsApp Bot Management (from dev merge) */}
            <Route path="whatsapp" element={<SuperAdminWhatsAppManagement />} />
            {/* Enhancement batch */}
            <Route path="announcements" element={<SuperAdminAnnouncements />} />
            <Route path="audit-log" element={<SuperAdminAuditLog />} />
            <Route path="white-label" element={<SuperAdminWhiteLabel />} />
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
