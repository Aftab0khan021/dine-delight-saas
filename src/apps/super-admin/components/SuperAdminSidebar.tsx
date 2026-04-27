import {
  Activity,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldAlert,
  Store,
  Tag,
  Flag,
  Users,
  LifeBuoy,
  AlertTriangle,
  MessageSquare,
  Zap,
  BarChart3,
  DollarSign,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  // Platform
  { title: "Dashboard",      url: "/superadmin/dashboard",        icon: LayoutDashboard, group: "Platform" },
  { title: "Restaurants",    url: "/superadmin/restaurants",       icon: Store,           group: "Platform" },
  { title: "Approvals",      url: "/superadmin/approvals",         icon: ShieldAlert,     group: "Platform" },
  { title: "Users",          url: "/superadmin/users",             icon: Users,           group: "Platform" },
  // Billing
  { title: "Plans",          url: "/superadmin/plans",             icon: Tag,             group: "Billing" },
  { title: "Subscriptions",  url: "/superadmin/subscriptions",     icon: CreditCard,      group: "Billing" },
  { title: "Invoices",       url: "/superadmin/invoices",          icon: Receipt,         group: "Billing" },
  // Features
  { title: "Feature Flags",  url: "/superadmin/features",          icon: Flag,            group: "Features" },
  { title: "Feature Access", url: "/superadmin/features/access",   icon: Zap,             group: "Features" },
  { title: "Cloud Kitchens", url: "/superadmin/cloud-kitchens",    icon: BarChart3,       group: "Features" },
  // Operations
  { title: "Activity",       url: "/superadmin/activity",          icon: Activity,        group: "Operations" },
  { title: "Abuse",          url: "/superadmin/abuse",             icon: AlertTriangle,   group: "Operations" },
  { title: "Support",        url: "/superadmin/support",           icon: LifeBuoy,        group: "Operations" },
  { title: "Errors",         url: "/superadmin/errors",            icon: AlertTriangle,   group: "Operations" },
  // AI & Integrations
  { title: "WhatsApp Bot",   url: "/superadmin/whatsapp",          icon: MessageSquare,   group: "AI" },
  { title: "AI Providers",   url: "/superadmin/ai/providers",      icon: Zap,             group: "AI" },
  { title: "AI Usage",       url: "/superadmin/ai/usage",          icon: BarChart3,       group: "AI" },
  { title: "AI Costs",       url: "/superadmin/ai/costs",          icon: DollarSign,      group: "AI" },
  // System
  { title: "Settings",       url: "/superadmin/settings",          icon: Settings,        group: "System" },
];

const groups = ["Platform", "Billing", "Features", "Operations", "AI", "System"] as const;

export function SuperAdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {groups.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (!groupItems.length) return null;
          return (
            <SidebarGroup key={group}>
              {!collapsed && <SidebarGroupLabel>{group}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {groupItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end
                          className="hover:bg-muted/50"
                          activeClassName="bg-muted text-primary font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
