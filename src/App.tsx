import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import NotFound from "./pages/NotFound";

// ──────────────────────────────────────────────────────────────────────────────
// Public Website — eagerly loaded (customers see these first, must be instant)
// ──────────────────────────────────────────────────────────────────────────────
import Home from "./apps/public-website/pages/Home";
import PublicMenu from "./apps/public-website/pages/Menu";
import TrackOrder from "./apps/public-website/pages/TrackOrder";
import RestaurantProfile from "./apps/public-website/pages/RestaurantProfile";
import QrResolver from "./apps/public-website/pages/QrResolver";
import CustomerDashboard from "./apps/public-website/pages/CustomerDashboard";
import TableReservation from "./apps/public-website/pages/TableReservation";
import PrivacyPolicy from "./apps/public-website/pages/PrivacyPolicy";
import TermsOfService from "./apps/public-website/pages/TermsOfService";

// ──────────────────────────────────────────────────────────────────────────────
// Admin Panel — lazy-loaded (only restaurant admins/staff need these)
// Auth pages stay eager since they're the entry point for admin users.
// ──────────────────────────────────────────────────────────────────────────────
import AdminAuth from "./apps/admin-panel/pages/Auth";
import SetPassword from "./apps/admin-panel/pages/SetPassword";
import AuthCallback from "./apps/admin-panel/pages/AuthCallback";
import AcceptInvitation from "./apps/admin-panel/pages/AcceptInvitation";
import { AdminLayout } from "./apps/admin-panel/components/AdminLayout";
import { ProtectedRoute } from "./apps/admin-panel/components/ProtectedRoute";
import { usePermissionContext } from "./apps/admin-panel/state/permission-context";

const AdminDashboard = lazy(() => import("./apps/admin-panel/pages/Dashboard"));
const AdminOrders = lazy(() => import("./apps/admin-panel/pages/Orders"));
const AdminMenu = lazy(() => import("./apps/admin-panel/pages/Menu"));
const AdminQrMenu = lazy(() => import("./apps/admin-panel/pages/QrMenu"));
const AdminStaff = lazy(() => import("./apps/admin-panel/pages/Staff"));
const AdminStaffCategories = lazy(() => import("./apps/admin-panel/pages/StaffCategories"));
const AdminBranding = lazy(() => import("./apps/admin-panel/pages/Branding"));
const AdminBilling = lazy(() => import("./apps/admin-panel/pages/Billing"));
const AdminCoupons = lazy(() => import("./apps/admin-panel/pages/Coupons"));
const AdminMarketing = lazy(() => import("./apps/admin-panel/pages/Marketing"));
const AdminMenuInsights = lazy(() => import("./apps/admin-panel/pages/MenuInsights"));
const AdminDeveloperAPI = lazy(() => import("./apps/admin-panel/pages/DeveloperAPI"));
const AdminKitchenDashboard = lazy(() => import("./apps/admin-panel/pages/KitchenDashboard"));
const AdminReservations = lazy(() => import("./apps/admin-panel/pages/Reservations"));
const AdminInventory = lazy(() => import("./apps/admin-panel/pages/Inventory"));
const AdminOTPSettings = lazy(() => import("./apps/admin-panel/pages/OTPSettings"));
const AdminReviews = lazy(() => import("./apps/admin-panel/pages/Reviews"));
const AdminCustomers = lazy(() => import("./apps/admin-panel/pages/Customers"));
const AdminAnalytics = lazy(() => import("./apps/admin-panel/pages/Analytics"));
const AdminDeliveryZones = lazy(() => import("./apps/admin-panel/pages/DeliveryZones"));
const AdminExploreFeatures = lazy(() => import("./apps/admin-panel/pages/ExploreFeatures"));
const AdminWhatsAppSettings = lazy(() => import("./apps/admin-panel/pages/WhatsAppSettings"));

// ──────────────────────────────────────────────────────────────────────────────
// Super Admin — lazy-loaded (only super admins need these, very few users)
// Auth page stays eager since it's the entry point.
// ──────────────────────────────────────────────────────────────────────────────
import SuperAdminAuth from "./apps/super-admin/pages/Auth";
import { SuperAdminLayout } from "./apps/super-admin/components/SuperAdminLayout";

const SuperAdminDashboard = lazy(() => import("./apps/super-admin/pages/Dashboard"));
const SuperAdminRestaurants = lazy(() => import("./apps/super-admin/pages/Restaurants"));
const SuperAdminRestaurantDetails = lazy(() => import("./apps/super-admin/pages/RestaurantDetails"));
const SuperAdminPlans = lazy(() => import("./apps/super-admin/pages/Plans"));
const SuperAdminSubscriptions = lazy(() => import("./apps/super-admin/pages/Subscriptions"));
const SuperAdminFeatureFlags = lazy(() => import("./apps/super-admin/pages/FeatureFlags"));
const SuperAdminFeatureAccess = lazy(() => import("./apps/super-admin/pages/FeatureAccess"));
const SuperAdminInvoices = lazy(() => import("./apps/super-admin/pages/Invoices"));
const SuperAdminAbuse = lazy(() => import("./apps/super-admin/pages/Abuse"));
const SuperAdminSupport = lazy(() => import("./apps/super-admin/pages/Support"));
const SuperAdminErrors = lazy(() => import("./apps/super-admin/pages/Errors"));
const SuperAdminSettings = lazy(() => import("./apps/super-admin/pages/Settings"));
const SuperAdminUsers = lazy(() => import("./apps/super-admin/pages/Users"));
const SuperAdminPendingApprovals = lazy(() => import("./apps/super-admin/pages/PendingApprovals"));
const SuperAdminCloudKitchens = lazy(() => import("./apps/super-admin/pages/CloudKitchens"));
const SuperAdminAIProviders = lazy(() => import("./apps/super-admin/pages/AIProviders"));
const SuperAdminAICostTracking = lazy(() => import("./apps/super-admin/pages/AICostTracking"));
const SuperAdminAIUsageAnalytics = lazy(() => import("./apps/super-admin/pages/AIUsageAnalytics"));
const SuperAdminRestaurantAIConfig = lazy(() => import("./apps/super-admin/pages/RestaurantAIConfig"));
const SuperAdminWhatsAppManagement = lazy(() => import("./apps/super-admin/pages/WhatsAppManagement"));
const SuperAdminAnnouncements = lazy(() => import("./apps/super-admin/pages/Announcements"));
const SuperAdminAuditLog = lazy(() => import("./apps/super-admin/pages/AuditLog"));
const SuperAdminWhiteLabel = lazy(() => import("./apps/super-admin/pages/WhiteLabel"));

// ──────────────────────────────────────────────────────────────────────────────
// QueryClient — global defaults for caching and refetch behavior
// ──────────────────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Don't refetch when user switches back to the tab — prevents
      // 100+ simultaneous refetches when restaurant staff return from lunch.
      refetchOnWindowFocus: false,
      // Default 60s stale time — most data doesn't change every second.
      // Individual queries can override this if they need fresher data.
      staleTime: 60_000,
      // Critical: prevents unhandled query errors from crashing Error Boundary.
      // Pages show empty states instead of crashing.
      throwOnError: false,
    },
  },
});

// ──────────────────────────────────────────────────────────────────────────────
// Suspense fallback — shown while lazy chunks are loading
// ──────────────────────────────────────────────────────────────────────────────
function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

/** Wraps a lazy-loaded page in Suspense with a consistent loading spinner. */
function LazyPage({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LazyFallback />}>{children}</Suspense>;
}

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
            <Route path="dashboard" element={<LazyPage><ProtectedRoute permission="view_dashboard"><AdminDashboard /></ProtectedRoute></LazyPage>} />
            <Route path="orders" element={<LazyPage><ProtectedRoute permission="view_orders"><AdminOrders /></ProtectedRoute></LazyPage>} />
            <Route path="menu" element={<LazyPage><ProtectedRoute permission="view_menu"><AdminMenu /></ProtectedRoute></LazyPage>} />
            <Route path="qr" element={<LazyPage><ProtectedRoute permission="view_qr"><AdminQrMenu /></ProtectedRoute></LazyPage>} />
            {/* Backwards compatible */}
            <Route path="qr-menu" element={<Navigate to="/admin/qr" replace />} />
            <Route path="staff" element={<LazyPage><ProtectedRoute permission="view_staff"><AdminStaff /></ProtectedRoute></LazyPage>} />
            <Route path="staff-categories" element={<Navigate to="/admin/staff" replace />} />
            <Route path="branding" element={<LazyPage><ProtectedRoute permission="manage_settings"><AdminBranding /></ProtectedRoute></LazyPage>} />
            <Route path="billing" element={<LazyPage><ProtectedRoute adminOnly><AdminBilling /></ProtectedRoute></LazyPage>} />
            <Route path="coupons" element={<LazyPage><ProtectedRoute permission="view_coupons"><AdminCoupons /></ProtectedRoute></LazyPage>} />
            <Route path="marketing" element={<LazyPage><ProtectedRoute adminOnly><AdminMarketing /></ProtectedRoute></LazyPage>} />
            <Route path="reviews" element={<LazyPage><ProtectedRoute permission="view_reviews"><AdminReviews /></ProtectedRoute></LazyPage>} />
            <Route path="insights" element={<LazyPage><ProtectedRoute adminOnly><AdminMenuInsights /></ProtectedRoute></LazyPage>} />
            <Route path="developer" element={<LazyPage><ProtectedRoute adminOnly><AdminDeveloperAPI /></ProtectedRoute></LazyPage>} />
            <Route path="kitchen" element={<LazyPage><ProtectedRoute permission="view_kitchen"><AdminKitchenDashboard /></ProtectedRoute></LazyPage>} />
            <Route path="reservations" element={<LazyPage><ProtectedRoute permission="view_reservations"><AdminReservations /></ProtectedRoute></LazyPage>} />
            <Route path="inventory" element={<LazyPage><ProtectedRoute permission="view_inventory"><AdminInventory /></ProtectedRoute></LazyPage>} />
            {/* WhatsApp bot settings (from dev merge) */}
            <Route path="whatsapp" element={<LazyPage><ProtectedRoute adminOnly><AdminWhatsAppSettings /></ProtectedRoute></LazyPage>} />
            <Route path="otp-settings" element={<LazyPage><ProtectedRoute adminOnly><AdminOTPSettings /></ProtectedRoute></LazyPage>} />
            {/* Enhancement batch */}
            <Route path="customers" element={<LazyPage><ProtectedRoute adminOnly><AdminCustomers /></ProtectedRoute></LazyPage>} />
            <Route path="analytics" element={<LazyPage><ProtectedRoute permission="view_analytics"><AdminAnalytics /></ProtectedRoute></LazyPage>} />
            <Route path="delivery-zones" element={<LazyPage><ProtectedRoute adminOnly><AdminDeliveryZones /></ProtectedRoute></LazyPage>} />
            <Route path="explore" element={<LazyPage><ProtectedRoute adminOnly><AdminExploreFeatures /></ProtectedRoute></LazyPage>} />
          </Route>

          {/* Super Admin Routes */}
          {/* Canonical: /superadmin */}
          <Route path="/superadmin/auth" element={<SuperAdminAuth />} />
          <Route path="/superadmin" element={<SuperAdminLayout />}>
            <Route index element={<Navigate to="/superadmin/dashboard" replace />} />
            <Route path="dashboard" element={<LazyPage><SuperAdminDashboard /></LazyPage>} />
            <Route path="restaurants" element={<LazyPage><SuperAdminRestaurants /></LazyPage>} />
            <Route path="restaurants/:id" element={<LazyPage><SuperAdminRestaurantDetails /></LazyPage>} />
            <Route path="plans" element={<LazyPage><SuperAdminPlans /></LazyPage>} />
            <Route path="subscriptions" element={<LazyPage><SuperAdminSubscriptions /></LazyPage>} />
            <Route path="features" element={<LazyPage><SuperAdminFeatureFlags /></LazyPage>} />
            <Route path="features/access" element={<LazyPage><SuperAdminFeatureAccess /></LazyPage>} />
            <Route path="invoices" element={<LazyPage><SuperAdminInvoices /></LazyPage>} />
            <Route path="activity" element={<Navigate to="/superadmin/audit-log" replace />} />
            <Route path="abuse" element={<LazyPage><SuperAdminAbuse /></LazyPage>} />
            <Route path="support" element={<LazyPage><SuperAdminSupport /></LazyPage>} />
            <Route path="errors" element={<LazyPage><SuperAdminErrors /></LazyPage>} />
            <Route path="users" element={<LazyPage><SuperAdminUsers /></LazyPage>} />
            <Route path="settings" element={<LazyPage><SuperAdminSettings /></LazyPage>} />
            <Route path="approvals" element={<LazyPage><SuperAdminPendingApprovals /></LazyPage>} />
            <Route path="cloud-kitchens" element={<LazyPage><SuperAdminCloudKitchens /></LazyPage>} />
            {/* AI Management (from dev merge) */}
            <Route path="ai/providers" element={<LazyPage><SuperAdminAIProviders /></LazyPage>} />
            <Route path="ai/costs" element={<LazyPage><SuperAdminAICostTracking /></LazyPage>} />
            <Route path="ai/usage" element={<LazyPage><SuperAdminAIUsageAnalytics /></LazyPage>} />
            <Route path="restaurants/:id/ai" element={<LazyPage><SuperAdminRestaurantAIConfig /></LazyPage>} />
            {/* WhatsApp Bot Management (from dev merge) */}
            <Route path="whatsapp" element={<LazyPage><SuperAdminWhatsAppManagement /></LazyPage>} />
            {/* Enhancement batch */}
            <Route path="announcements" element={<LazyPage><SuperAdminAnnouncements /></LazyPage>} />
            <Route path="audit-log" element={<LazyPage><SuperAdminAuditLog /></LazyPage>} />
            <Route path="white-label" element={<LazyPage><SuperAdminWhiteLabel /></LazyPage>} />
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
