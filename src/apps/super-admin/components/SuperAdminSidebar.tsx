import {
  Activity,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldAlert,
  Store,
  Tag,
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
  { title: "Dashboard", url: "/superadmin/dashboard", icon: LayoutDashboard },
  { title: "Restaurants", url: "/superadmin/restaurants", icon: Store },
  { title: "Plans", url: "/superadmin/plans", icon: Tag },
  { title: "Subscriptions", url: "/superadmin/subscriptions", icon: CreditCard },
  { title: "Invoices", url: "/superadmin/invoices", icon: Receipt },
  { title: "Activity", url: "/superadmin/activity", icon: Activity },
  { title: "Abuse", url: "/superadmin/abuse", icon: ShieldAlert },
  { title: "Settings", url: "/superadmin/settings", icon: Settings },
] as const;

export function SuperAdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Super Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
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
      </SidebarContent>
    </Sidebar>
  );
}
