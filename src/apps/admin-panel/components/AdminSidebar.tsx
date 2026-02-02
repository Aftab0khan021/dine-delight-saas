import { useState, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ChefHat,
  CreditCard,
  LayoutDashboard,
  Palette,
  QrCode,
  ReceiptText,
  Users,
  Salad,
  ChevronLeft,
  ChevronRight,
  Ticket,
  Settings
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePermissionContext } from "../state/permission-context";
import { PERMISSIONS } from "./staff/staff-utils";

type NavItem = {
  to: string;
  label: string;
  icon: any;
  permission?: string; // Optional permission code required to view
  adminOnly?: boolean; // Only visible to admins
};

const allNavItems: NavItem[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard }, // Always visible
  { to: "/admin/orders", label: "Orders", icon: ReceiptText, permission: PERMISSIONS.VIEW_ORDERS },
  { to: "/admin/menu", label: "Menu", icon: Salad, permission: PERMISSIONS.VIEW_MENU },
  { to: "/admin/qr", label: "QR Menu", icon: QrCode, permission: PERMISSIONS.VIEW_QR },
  { to: "/admin/staff", label: "Staff", icon: Users, permission: PERMISSIONS.VIEW_STAFF },
  { to: "/admin/staff-categories", label: "Staff Categories", icon: Settings, permission: PERMISSIONS.MANAGE_CATEGORIES_STAFF, adminOnly: true },
  { to: "/admin/branding", label: "Branding", icon: Palette, permission: PERMISSIONS.MANAGE_SETTINGS },
  { to: "/admin/billing", label: "Billing", icon: CreditCard, adminOnly: true },
  { to: "/admin/coupons", label: "Coupons", icon: Ticket, permission: PERMISSIONS.VIEW_COUPONS },
];

export function AdminSidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hasPermission, isAdmin } = usePermissionContext();

  // Filter nav items based on permissions
  const navItems = useMemo(() => {
    return allNavItems.filter(item => {
      // Admin-only items
      if (item.adminOnly && !isAdmin) return false;

      // Permission-based items
      if (item.permission && !hasPermission(item.permission as any)) return false;

      // No restrictions, show it
      return true;
    });
  }, [hasPermission, isAdmin]);

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col border-r border-border bg-card transition-all duration-300 ease-in-out",
        "h-[calc(100vh-3.5rem)] sticky top-14",
        isCollapsed ? "w-[70px]" : "w-64"
      )}
    >
      {/* 1. Header */}
      <div className={cn(
        "flex h-14 items-center border-b border-border/40 px-4 shrink-0",
        isCollapsed ? "justify-center px-0" : "justify-between"
      )}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ChefHat className="h-4 w-4" />
          </div>

          <div className={cn(
            "leading-tight transition-all duration-300 overflow-hidden whitespace-nowrap",
            isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
          )}>
            <div className="text-sm font-bold">Restaurant OS</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin Panel</div>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Nav Area */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-lg transition-colors",
                    isCollapsed
                      ? "justify-center h-10 w-10 mx-auto"
                      : "gap-3 px-3 py-2",
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                {/* FIXED: We now access isActive inside the children function */}
                {({ isActive }) => (
                  <>
                    <item.icon className={cn(
                      "shrink-0",
                      isCollapsed ? "h-5 w-5" : "h-4 w-4",
                      !isActive && !isCollapsed && "opacity-70"
                    )} />

                    {!isCollapsed && (
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 3. Footer / Toggle */}
      <div className="border-t border-border/40 p-3 shrink-0">
        {!isCollapsed && (
          <div className="mb-3 rounded-xl border border-border bg-muted/40 p-3 overflow-hidden">
            <div className="text-xs font-medium">Pro Tip</div>
            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
              Keep your menu simple: 6–9 categories max.
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "w-full flex items-center",
            isCollapsed ? "justify-center" : "justify-between px-3"
          )}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <>
              <span className="text-xs text-muted-foreground">Collapse</span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
