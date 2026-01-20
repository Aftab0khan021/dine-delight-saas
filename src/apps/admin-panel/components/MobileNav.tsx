import { 
  LayoutDashboard, 
  ShoppingCart, 
  Utensils, 
  QrCode, 
  Users 
} from "lucide-react";
import { NavLink } from "@/components/NavLink";

const mobileNavItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart },
  { title: "Menu", url: "/admin/menu", icon: Utensils },
  { title: "QR", url: "/admin/qr-menu", icon: QrCode },
  { title: "Staff", url: "/admin/staff", icon: Users },
];

export function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-background z-50">
      <div className="flex justify-around items-center h-16">
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/admin"}
            className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-muted-foreground hover:text-foreground transition-colors"
            activeClassName="text-primary font-medium"
          >
            <item.icon className="h-5 w-5" />
            <span className="text-xs">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
