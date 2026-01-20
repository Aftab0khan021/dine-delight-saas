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

const items = [
  { label: "Dashboard", to: "/admin", icon: LayoutDashboard, end: true },
  { label: "Orders", to: "/admin/orders", icon: ShoppingBag },
  { label: "Menu", to: "/admin/menu", icon: Salad },
  { label: "QR", to: "/admin/qr-menu", icon: Barcode },
  { label: "Staff", to: "/admin/staff", icon: Users },
  { label: "Brand", to: "/admin/branding", icon: Brush },
  { label: "Billing", to: "/admin/billing", icon: CreditCard },
];

export function AdminBottomNav() {
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 border-t bg-background">
      <div className="flex items-stretch justify-between gap-1 px-1 py-1 overflow-x-auto">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end as any}
            className="flex flex-col items-center justify-center gap-1 rounded-md px-3 py-2 min-w-[4.25rem] text-xs text-muted-foreground"
            activeClassName="bg-muted text-foreground"
          >
            <item.icon className="h-4 w-4" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
