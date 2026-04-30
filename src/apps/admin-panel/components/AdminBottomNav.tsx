import {
  LayoutDashboard,
  Salad,
  ShoppingBag,
  ChefHat,
  QrCode,
  Users,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";

const items = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard, end: true },
  { label: "Orders",    to: "/admin/orders",    icon: ShoppingBag },
  { label: "Kitchen",   to: "/admin/kitchen",   icon: ChefHat },
  { label: "Menu",      to: "/admin/menu",      icon: Salad },
  { label: "QR",        to: "/admin/qr",        icon: QrCode },
  { label: "Staff",     to: "/admin/staff",     icon: Users },
];

export function AdminBottomNav() {
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur z-30">
      <div className="flex items-stretch justify-around gap-0 px-1 py-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end as any}
            className="flex flex-col items-center justify-center gap-0.5 rounded-md px-2 py-2 flex-1 min-w-0 text-[10px] text-muted-foreground"
            activeClassName="bg-muted text-foreground"
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span className="truncate w-full text-center leading-tight">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
