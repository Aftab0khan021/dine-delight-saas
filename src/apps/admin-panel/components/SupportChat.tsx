import { useState, useRef, useEffect, useMemo } from "react";
import { MessageCircle, X, Send, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Knowledge Base ────────────────────────────────────────────────────────────
type KBEntry = { keywords: string[]; answer: string };

const KB: KBEntry[] = [
  // Greetings
  { keywords: ["hello", "hi", "hey", "help", "support"], answer: "Hello! 👋 I'm here to help you get the most out of your restaurant management system. What can I assist you with today?\n\nYou can ask me about:\n• Orders & Kitchen\n• Menu Management\n• Inventory\n• Staff & Permissions\n• QR Codes & Branding\n• Billing & Plans\n• Analytics & Reports" },
  { keywords: ["thank", "thanks", "thx"], answer: "You're welcome! 😊 Feel free to reach out anytime you need help. We're always here for you!" },

  // Dashboard
  { keywords: ["dashboard", "home", "overview"], answer: "Your **Dashboard** is your command center! It shows:\n• Today's revenue & order count\n• Recent orders feed\n• Quick stats (pending, accepted, completed)\n• Revenue trends\n\nNavigate to it from the sidebar → Dashboard." },

  // Orders
  { keywords: ["order", "orders", "manage order"], answer: "The **Orders** page shows all orders in a Kanban-style board with columns: New → Accepted → Cooking → Ready → Completed.\n\n**Tips:**\n• Use the time filter (Today/Weekly/Monthly) to narrow results\n• Click any order card to see full details\n• Drag or click to move orders between statuses\n• Orders are synced in real-time!" },
  { keywords: ["quick order", "pos", "staff order", "place order"], answer: "**Quick Order** is your staff POS! Use it to place orders on behalf of walk-in customers.\n\n• Search or browse menu items by category\n• Toggle between Grid/List view\n• Add items to cart (the cart stays fixed while you scroll!)\n• Set order type: Dine-In, Pickup, or Delivery\n• Apply discounts, tips, and coupon codes\n• Choose payment method: Cash, Card, or UPI" },
  { keywords: ["kitchen", "kitchen board", "kitchen display", "kds"], answer: "The **Kitchen Board** is a real-time display for your kitchen staff.\n\n• Shows orders in status columns: New → Accepted → Cooking → Ready\n• One-click status updates\n• Auto-refreshes with real-time sync\n• Sound notifications for new orders\n• Enable it from Explore Features → Kitchen Display" },

  // Menu
  { keywords: ["menu", "menu item", "add item", "category", "categories"], answer: "**Menu Management** lets you:\n• Create categories and organize items with drag-to-sort\n• Add items with photos, prices, variants & add-ons\n• Set food type (Veg/Non-Veg/Vegan)\n• Mark items as sold out\n• Toggle item visibility\n\n**Pro tip:** Keep 6-9 categories max for the best customer experience!" },
  { keywords: ["variant", "variants", "size", "addon", "add-on", "addons"], answer: "**Variants** let you offer size options (Small/Medium/Large) with different prices.\n\n**Add-ons** are extras customers can add (Extra Cheese, Spicy Sauce, etc.).\n\nBoth are managed per menu item — click any item → Edit → Variants/Add-ons tab." },

  // Inventory
  { keywords: ["inventory", "ingredient", "stock", "low stock", "out of stock"], answer: "**Inventory Management** tracks your ingredients:\n\n• Add ingredients with stock levels & units\n• **Bulk Add** — add multiple ingredients at once!\n• Set low stock thresholds for alerts\n• Link ingredients to menu items (supports bulk linking too)\n• Stock auto-deducts when orders are **accepted**\n• Menu items auto-disable when ingredients run out\n\nEnable from Explore Features → Inventory Management." },
  { keywords: ["restock", "stock movement", "replenish"], answer: "To restock an ingredient:\n1. Go to Inventory\n2. Find the ingredient → Click **Restock**\n3. Enter the quantity & optional notes\n4. The stock will update and any disabled menu items will be re-enabled!" },
  { keywords: ["link ingredient", "ingredient link", "recipe"], answer: "To link ingredients to menu items:\n1. Go to Inventory → Click **Links** on any ingredient\n2. Check the menu items you want to link\n3. Set quantity, unit, and conversion factor for **each item individually**\n4. Use 'Quick Fill' to batch-apply the same values\n5. Click Link!" },

  // Staff
  { keywords: ["staff", "employee", "team", "role", "permission"], answer: "**Staff Management** lets you:\n• Invite team members via email\n• Assign roles: Admin, Manager, Chef, Waiter, Cashier\n• Set granular permissions per staff member\n• Staff see only what they have access to\n\nGo to sidebar → Staff to manage your team." },

  // QR & Branding
  { keywords: ["qr", "qr code", "scan", "table qr"], answer: "**QR Menu** generates scannable QR codes for your tables!\n\n• Each table gets a unique QR code\n• Customers scan to view your digital menu\n• They can place orders directly from their phone\n• Customize QR style and colors\n\nGo to sidebar → QR Menu." },
  { keywords: ["branding", "logo", "color", "theme", "customize"], answer: "**Branding** lets you customize your restaurant's look:\n• Upload your logo\n• Set brand colors\n• Customize your public menu appearance\n• Set restaurant details (address, phone, hours)\n\nGo to sidebar → Branding." },

  // Billing
  { keywords: ["billing", "plan", "subscription", "payment", "pricing", "upgrade"], answer: "**Billing** manages your subscription plan:\n• View your current plan & usage\n• Upgrade/downgrade anytime\n• View invoice history\n• Manage payment methods\n\nGo to sidebar → Billing (Admin only)." },

  // Coupons
  { keywords: ["coupon", "discount", "offer", "promo", "promotion", "reward"], answer: "**Rewards & Offers** lets you create coupon codes:\n• Set percentage or flat discounts\n• Configure min order amounts\n• Set validity periods\n• Limit usage per customer\n• Track redemptions\n\nEnable from Explore Features → Coupons." },

  // Reservations
  { keywords: ["reservation", "booking", "table booking", "reserve"], answer: "**Reservations** handles table bookings:\n• Customers can book tables online\n• View & manage all reservations\n• Approve or decline bookings\n• Set available time slots\n\nEnable from Explore Features → Table Reservations." },

  // Reviews
  { keywords: ["review", "rating", "feedback", "star"], answer: "**Reviews** shows customer feedback:\n• View all ratings and comments\n• Track your average rating over time\n• Respond to customer reviews\n\nEnable from Explore Features → Reviews." },

  // Analytics
  { keywords: ["analytics", "report", "insight", "revenue", "sales"], answer: "**Analytics** gives you detailed insights:\n• Revenue trends (daily/weekly/monthly)\n• Top selling items\n• Order volume charts\n• Customer analytics\n• Peak hour analysis\n\nEnable from Explore Features → Analytics." },

  // Delivery
  { keywords: ["delivery", "delivery zone", "delivery area"], answer: "**Delivery Zones** let you define where you deliver:\n• Draw zones on a map\n• Set delivery fees per zone\n• Set minimum order amounts\n• Enable/disable zones\n\nEnable from Explore Features → Delivery Zones." },

  // WhatsApp
  { keywords: ["whatsapp", "notification", "sms", "otp"], answer: "**WhatsApp Integration** features:\n• Send order notifications to customers\n• WhatsApp Bot for automated replies\n• OTP verification for orders\n\nConfigure from sidebar → WhatsApp Bot / OTP Settings." },

  // Features
  { keywords: ["feature", "explore", "enable", "disable", "module"], answer: "Go to **Explore Features** (in the sidebar) to enable/disable modules:\n• Kitchen Display, Inventory, Coupons\n• Reservations, Reviews, Analytics\n• WhatsApp CRM, API Access\n• And more!\n\nEach feature can be toggled on/off independently." },

  // Common issues
  { keywords: ["not working", "error", "bug", "issue", "problem", "broken"], answer: "I'm sorry you're facing an issue! Here are some quick fixes:\n\n1. **Refresh the page** (Ctrl+R)\n2. **Clear browser cache** (Ctrl+Shift+Delete)\n3. **Check your internet connection**\n4. **Log out and log back in**\n\nIf the problem persists, please describe what's happening and I'll help troubleshoot!" },
  { keywords: ["login", "sign in", "password", "forgot password", "access"], answer: "**Login issues?**\n• Use your registered email and password\n• Click 'Forgot Password' to reset\n• Check spam folder for reset emails\n• Make sure your account has been approved by the admin\n\nStaff members need an invitation link from the admin to create their account." },
  { keywords: ["slow", "loading", "performance"], answer: "If the system feels slow:\n1. Check your internet speed\n2. Close unnecessary browser tabs\n3. Try a hard refresh (Ctrl+Shift+R)\n4. Use Chrome or Edge for best performance\n5. Clear browser cache if it's been a while" },
];

function findAnswer(input: string): string {
  const q = input.toLowerCase().trim();
  if (!q) return "Could you please describe your question in more detail? I'm here to help! 😊";

  let bestMatch: KBEntry | null = null;
  let bestScore = 0;

  for (const entry of KB) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (q.includes(kw)) score += kw.length;
    }
    if (score > bestScore) { bestScore = score; bestMatch = entry; }
  }

  if (bestMatch && bestScore >= 2) return bestMatch.answer;

  return "I appreciate your question! While I don't have a specific answer for that right now, here are some things I can help with:\n\n• **Orders** — Managing and tracking orders\n• **Menu** — Adding items, categories, variants\n• **Inventory** — Stock tracking and ingredient linking\n• **Staff** — Team management and permissions\n• **Billing** — Plans and subscriptions\n\nCould you rephrase or pick a topic above? 😊";
}

// ─── Component ─────────────────────────────────────────────────────────────────
type Message = { id: number; text: string; from: "user" | "agent"; time: string };

const AGENT_NAME = "Sarah";
const WELCOME_MSG: Message = {
  id: 0,
  text: `Hi there! 👋 I'm ${AGENT_NAME} from the support team. How can I help you today?`,
  from: "agent",
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
};

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (open) { setUnread(0); inputRef.current?.focus(); }
  }, [open]);

  function send() {
    const text = input.trim();
    if (!text) return;
    const userMsg: Message = {
      id: idRef.current++,
      text,
      from: "user",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    // Simulate typing delay (600-1500ms)
    const delay = 600 + Math.random() * 900;
    setTimeout(() => {
      const answer = findAnswer(text);
      const agentMsg: Message = {
        id: idRef.current++,
        text: answer,
        from: "agent",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages(prev => [...prev, agentMsg]);
      setTyping(false);
      if (!open) setUnread(u => u + 1);
    }, delay);
  }

  // Simple markdown-like rendering (bold only)
  function renderText(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={j}>{part.slice(2, -2)}</strong>;
        }
        return <span key={j}>{part}</span>;
      });
      return <span key={i}>{i > 0 && <br />}{parts}</span>;
    });
  }

  return (
    <>
      {/* Chat window */}
      <div
        className={cn(
          "fixed bottom-20 right-5 z-50 w-[360px] max-w-[calc(100vw-40px)] rounded-2xl shadow-2xl border border-border bg-background flex flex-col transition-all duration-300 origin-bottom-right",
          open ? "scale-100 opacity-100 pointer-events-auto" : "scale-90 opacity-0 pointer-events-none"
        )}
        style={{ height: "min(520px, calc(100vh - 120px))" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-t-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shrink-0">
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
              S
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{AGENT_NAME}</div>
            <div className="text-[10px] opacity-80 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              Online — typically replies instantly
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-2", msg.from === "user" ? "justify-end" : "justify-start")}>
              {msg.from === "agent" && (
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-1">
                  S
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.from === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-muted rounded-bl-md"
                )}
              >
                {renderText(msg.text)}
                <div className={cn("text-[9px] mt-1.5 opacity-60", msg.from === "user" ? "text-right" : "")}>
                  {msg.time}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typing && (
            <div className="flex gap-2 items-end">
              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                S
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t p-3">
          <form
            onSubmit={e => { e.preventDefault(); send(); }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your message…"
              className="flex-1 rounded-full border border-border bg-muted/50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              maxLength={300}
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="text-[9px] text-muted-foreground text-center mt-1.5">
            Powered by Dine Delight Support
          </p>
        </div>
      </div>

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95",
          open
            ? "bg-muted text-muted-foreground rotate-0"
            : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
        )}
        title="Support"
      >
        {open ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <Headphones className="h-6 w-6" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unread}
              </span>
            )}
          </>
        )}
      </button>
    </>
  );
}
