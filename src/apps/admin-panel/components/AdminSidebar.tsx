import {
  Barcode,
  Brush,
  CreditCard,
  LayoutDashboard,
  Salad,
  ShoppingBag,
  Users,
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

const navItems = [
  { title: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard, end: true },
  { title: "Orders", to: "/admin/orders", icon: ShoppingBag },
  { title: "Menu", to: "/admin/menu", icon: Salad },
  { title: "QR Menu", to: "/admin/qr", icon: Barcode },
  { title: "Staff", to: "/admin/staff", icon: Users },
  { title: "Branding", to: "/admin/branding", icon: Brush },
  { title: "Billing", to: "/admin/billing", icon: CreditCard },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.to}
                      end={item.end as any}
                      className="flex items-center gap-2 rounded-md"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.title}</span>}
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
