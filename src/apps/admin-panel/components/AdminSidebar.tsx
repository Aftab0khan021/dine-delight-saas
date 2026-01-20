import { 
  LayoutDashboard, 
  ShoppingCart, 
  Utensils, 
  QrCode, 
  Users, 
  Palette, 
  CreditCard 
} from "lucide-react";
import { NavLink } from "@/components/NavLink";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";

const menuItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart },
  { title: "Menu", url: "/admin/menu", icon: Utensils },
  { title: "QR Menu", url: "/admin/qr-menu", icon: QrCode },
  { title: "Staff", url: "/admin/staff", icon: Users },
  { title: "Branding", url: "/admin/branding", icon: Palette },
  { title: "Billing", url: "/admin/billing", icon: CreditCard },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar className="border-r hidden md:flex" collapsible="icon">
      <SidebarContent>
        <div className="p-4 border-b">
          {!isCollapsed && (
            <h2 className="text-lg font-semibold">Restaurant Admin</h2>
          )}
          {isCollapsed && (
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center text-primary-foreground font-bold">
              R
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink 
                      to={item.url} 
                      end={item.url === "/admin"}
                      className="hover:bg-muted/50" 
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
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
