import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ChefHat, CreditCard, LayoutDashboard, Palette, QrCode, ReceiptText, Users, Salad } from "lucide-react";

const navItems = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/orders", label: "Orders", icon: ReceiptText },
  { to: "/admin/menu", label: "Menu", icon: Salad },
  { to: "/admin/qr", label: "QR Menu", icon: QrCode },
  { to: "/admin/staff", label: "Staff", icon: Users },
  { to: "/admin/branding", label: "Branding", icon: Palette },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
];

export function AdminSidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card h-screen sticky top-0">
      <div className="flex h-14 items-center gap-2 px-6 border-b border-border/40">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <ChefHat className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold">Restaurant OS</div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Admin Panel</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="mb-2 px-3 text-xs font-medium text-muted-foreground">Workspace</div>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isActive
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-muted-foreground"
                  )
                }
              >
                <item.icon className={cn("h-4 w-4", "opacity-70 group-hover:opacity-100")} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="p-4 border-t border-border/40">
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="text-xs font-medium">Pro Tip</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Keep your menu simple: 6–9 categories max for better conversion.
          </div>
        </div>
      </div>
    </aside>
  );
}