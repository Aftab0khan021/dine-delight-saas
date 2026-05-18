import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, X, Send, Headphones, ThumbsUp, ThumbsDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { findBestMatch, FALLBACK_ANSWER, QUICK_TOPICS, type KBEntry } from "./SupportChatKB";

// ─── Types ──────────────────────────────────────────────────────────────────────
type Message = { id: number; text: string; from: "user" | "agent"; time: string; navLink?: string; followUps?: string[]; reaction?: "up" | "down" | null };

const AGENT_NAME = "Sarah";
const STORAGE_KEY = "dd-support-chat";
const TICKET_KEY = "dd-support-ticket-id";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timeStr(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── DB Sync helpers ────────────────────────────────────────────────────────────
async function createTicket(restaurantId: string | null, restaurantName: string): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("support_tickets").insert({
      subject: `Chat Support — ${restaurantName}`,
      description: "Automated chat support conversation",
      priority: "low",
      status: "open",
      restaurant_id: restaurantId,
      created_by: user?.id || null,
      metadata: { chat_messages: [], source: "chatbot" },
    } as any).select("id").single();
    if (error) { console.warn("Failed to create support ticket:", error); return null; }
    return data?.id || null;
  } catch { return null; }
}

async function syncMessages(ticketId: string, messages: Message[]): Promise<void> {
  try {
    const chatMsgs = messages.map(m => ({ id: m.id, text: m.text, from: m.from, time: m.time, reaction: m.reaction || null }));
    await supabase.from("support_tickets").update({ metadata: { chat_messages: chatMsgs, source: "chatbot", updated_at: new Date().toISOString() } as any, updated_at: new Date().toISOString() }).eq("id", ticketId);
  } catch { /* silent */ }
}

// ─── Component ──────────────────────────────────────────────────────────────────
export function SupportChat() {
  const navigate = useNavigate();
  let restaurant: { id: string; name: string } | null = null;
  try { const ctx = useRestaurantContext(); restaurant = ctx.restaurant; } catch { /* outside provider */ }

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [unread, setUnread] = useState(0);
  const [showTopics, setShowTopics] = useState(true);
  const [lastTopic, setLastTopic] = useState<string | undefined>();
  const [ticketId, setTicketId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(1);
  const syncTimer = useRef<ReturnType<typeof setTimeout>>();

  // Welcome message
  const welcomeMsg: Message = { id: 0, text: `${getGreeting()}! 👋 I'm ${AGENT_NAME} from the support team. How can I help you today?`, from: "agent", time: timeStr() };

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const savedTicket = localStorage.getItem(TICKET_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        if (parsed.length > 0) { setMessages(parsed); setShowTopics(false); idRef.current = Math.max(...parsed.map(m => m.id)) + 1; }
        else setMessages([welcomeMsg]);
      } else setMessages([welcomeMsg]);
      if (savedTicket) setTicketId(savedTicket);
    } catch { setMessages([welcomeMsg]); }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    if (messages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  // Debounced DB sync
  const scheduleSync = useCallback((msgs: Message[]) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (ticketId) syncMessages(ticketId, msgs);
    }, 2000);
  }, [ticketId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);
  useEffect(() => { if (open) { setUnread(0); inputRef.current?.focus(); } }, [open]);

  const processMessage = useCallback(async (text: string) => {
    const userMsg: Message = { id: idRef.current++, text, from: "user", time: timeStr() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setTyping(true);
    setShowTopics(false);

    // Create ticket on first user message
    let tid = ticketId;
    if (!tid && restaurant) {
      tid = await createTicket(restaurant.id, restaurant.name);
      if (tid) { setTicketId(tid); localStorage.setItem(TICKET_KEY, tid); }
    }

    const delay = 500 + Math.random() * 800;
    setTimeout(() => {
      const match: KBEntry | null = findBestMatch(text, lastTopic);
      const answer = match?.answer || FALLBACK_ANSWER;
      if (match?.topic) setLastTopic(match.topic);

      const agentMsg: Message = {
        id: idRef.current++, text: answer, from: "agent", time: timeStr(),
        navLink: match?.navLink, followUps: match?.followUps,
      };
      const updated = [...newMsgs, agentMsg];
      setMessages(updated);
      setTyping(false);
      if (!open) setUnread(u => u + 1);
      if (tid) scheduleSync(updated);
    }, delay);
  }, [messages, ticketId, restaurant, lastTopic, open, scheduleSync]);

  const send = () => { const t = input.trim(); if (t) processMessage(t); };

  const handleReaction = (msgId: number, reaction: "up" | "down") => {
    setMessages(prev => {
      const updated = prev.map(m => m.id === msgId ? { ...m, reaction: m.reaction === reaction ? null : reaction } : m);
      if (ticketId) scheduleSync(updated);
      return updated;
    });
  };

  const clearChat = () => {
    setMessages([{ ...welcomeMsg, id: idRef.current++, time: timeStr() }]);
    setShowTopics(true);
    setLastTopic(undefined);
    setTicketId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TICKET_KEY);
  };

  // Render markdown bold
  function renderText(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={j}>{part.slice(2, -2)}</strong>;
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
          "fixed bottom-20 right-5 z-50 w-[380px] max-w-[calc(100vw-40px)] rounded-2xl shadow-2xl border border-border bg-background flex flex-col transition-all duration-300 origin-bottom-right",
          open ? "scale-100 opacity-100 pointer-events-auto" : "scale-90 opacity-0 pointer-events-none"
        )}
        style={{ height: "min(560px, calc(100vh - 120px))" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-t-2xl bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shrink-0">
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">S</div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{AGENT_NAME}</div>
            <div className="text-[10px] opacity-80 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              Online — typically replies instantly
            </div>
          </div>
          <button onClick={clearChat} className="h-7 px-2 rounded-md hover:bg-white/20 text-[10px] font-medium transition-colors" title="Clear chat">Clear</button>
          <button onClick={() => setOpen(false)} className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Quick Topics Grid */}
          {showTopics && messages.length <= 1 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {QUICK_TOPICS.map(t => (
                <button key={t.label} onClick={() => processMessage(t.query)}
                  className="flex flex-col items-center gap-1 p-3 rounded-xl border bg-muted/50 hover:bg-muted transition-colors text-center">
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-[11px] font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={cn("flex gap-2", msg.from === "user" ? "justify-end" : "justify-start")}>
              {msg.from === "agent" && (
                <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-1">S</div>
              )}
              <div className="max-w-[80%] space-y-1.5">
                <div className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.from === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"
                )}>
                  {renderText(msg.text)}
                  <div className={cn("text-[9px] mt-1.5 opacity-60", msg.from === "user" ? "text-right" : "")}>{msg.time}</div>
                </div>

                {/* Navigation link */}
                {msg.from === "agent" && msg.navLink && (
                  <button onClick={() => { navigate(msg.navLink!); setOpen(false); }}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline pl-1">
                    Go to page <ArrowRight className="h-3 w-3" />
                  </button>
                )}

                {/* Reactions */}
                {msg.from === "agent" && msg.id !== 0 && (
                  <div className="flex items-center gap-1 pl-1">
                    <button onClick={() => handleReaction(msg.id, "up")}
                      className={cn("h-6 w-6 rounded-full flex items-center justify-center transition-colors", msg.reaction === "up" ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400" : "hover:bg-muted text-muted-foreground")}>
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button onClick={() => handleReaction(msg.id, "down")}
                      className={cn("h-6 w-6 rounded-full flex items-center justify-center transition-colors", msg.reaction === "down" ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" : "hover:bg-muted text-muted-foreground")}>
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Follow-up chips */}
                {msg.from === "agent" && msg.followUps && msg.id === messages[messages.length - 1]?.id && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {msg.followUps.map(f => (
                      <button key={f} onClick={() => processMessage(f)}
                        className="text-[11px] px-2.5 py-1 rounded-full border bg-background hover:bg-muted transition-colors font-medium">
                        {f}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {typing && (
            <div className="flex gap-2 items-end">
              <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">S</div>
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
          <form onSubmit={e => { e.preventDefault(); send(); }} className="flex items-center gap-2">
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              placeholder="Type your message…"
              className="flex-1 rounded-full border border-border bg-muted/50 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              maxLength={300} />
            <button type="submit" disabled={!input.trim()}
              className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shadow-sm">
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="text-[9px] text-muted-foreground text-center mt-1.5">Powered by Dine Delight Support</p>
        </div>
      </div>

      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full shadow-xl flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95",
          open ? "bg-muted text-muted-foreground rotate-0" : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground"
        )}
        title="Support"
      >
        {open ? <X className="h-6 w-6" /> : (
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
