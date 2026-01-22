import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, Clock, ChefHat, ShoppingBag, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Types
type OrderStatus = 'pending' | 'in_progress' | 'ready' | 'completed' | 'cancelled';

interface OrderDetails {
  id: string;
  status: OrderStatus;
  placed_at: string;
  total_cents: number;
  currency_code: string;
  restaurant?: {
    name: string;
    slug: string;
  };
}

interface OrderItem {
  id: string;
  name_snapshot: string;
  quantity: number;
  line_total_cents: number;
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function TrackOrder() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);

  // 1. Initial Fetch (Secure)
  const fetchOrder = async () => {
    if (!token) return;
    try {
      const { data, error } = await supabase.functions.invoke("order-lookup", {
        body: { token }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setOrder(data.order);
      setItems(data.items);
    } catch (err: any) {
      console.error("Fetch error:", err);
      // Only set error on first load to avoid flickering during realtime updates
      if (!order) setError(err.message || "Failed to load order.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      setError("No order token provided.");
      setLoading(false);
      return;
    }

    // Load initial data
    fetchOrder();

    // 2. Realtime Subscription (The Fix)
    // We listen for any UPDATE to the 'orders' table.
    // Note: We filter by the specific Order ID once we have it, 
    // or we just re-fetch whenever ANY order changes (simplest for now).
    const channel = supabase
      .channel('public-order-tracking')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          // Performance Optimization: Only listen for THIS order if we have the ID
          filter: order?.id ? `id=eq.${order.id}` : undefined
        },
        (payload) => {
          console.log("Realtime Update Received:", payload);
          // When an update comes in, re-fetch the fresh data securely
          fetchOrder();
          
          // Optional: Show a toast notification
          if (payload.new && (payload.new as any).status !== (payload.old as any).status) {
             const newStatus = (payload.new as any).status;
             if (newStatus === 'in_progress') toast({ title: "Order Update", description: "Your food is being prepared!" });
             if (newStatus === 'ready') toast({ title: "Order Ready!", description: "Please pick up your order." });
          }
        }
      )
      .subscribe();

    // Cleanup subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [token, order?.id]); // Re-subscribe if order ID loads (to tighten the filter)

  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>;
  if (error) return <div className="h-screen flex flex-col items-center justify-center gap-4 text-red-500"><p>{error}</p><Button asChild variant="outline"><Link to="/">Return Home</Link></Button></div>;
  if (!order) return null;

  // Status Logic
  const steps = [
    { id: 'pending', label: 'Order Placed', icon: Clock },
    { id: 'in_progress', label: 'Preparing', icon: ChefHat }, // Updated to match DB value 'in_progress'
    { id: 'ready', label: 'Ready', icon: CheckCircle2 },
  ];

  // Map DB status to Step Index
  let currentStepIndex = 0;
  if (order.status === 'in_progress') currentStepIndex = 1;
  if (order.status === 'ready' || order.status === 'completed') currentStepIndex = 2;

  const isCancelled = order.status === 'cancelled';
  const backLink = order.restaurant?.slug ? `/r/${order.restaurant.slug}/menu` : "/";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to={backLink} className="flex items-center gap-2 text-gray-600">
              <ArrowLeft className="h-4 w-4" /> 
              {order.restaurant?.slug ? "Back to Menu" : "Back to Home"}
            </Link>
          </Button>
          {order.restaurant?.name && (
            <span className="font-semibold text-sm text-gray-500">{order.restaurant.name}</span>
          )}
        </div>

        {/* Status Card */}
        <Card className="border-none shadow-lg overflow-hidden">
          <div className={`h-2 w-full ${isCancelled ? 'bg-red-500' : 'bg-green-500'}`} />
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl">
              {isCancelled ? "Order Cancelled" : "Order Status"}
            </CardTitle>
            <p className="text-sm text-gray-500">#{order.id.slice(0, 8).toUpperCase()}</p>
          </CardHeader>
          <CardContent className="space-y-8 pt-6">
            
            {!isCancelled ? (
              <div className="relative flex justify-between px-2">
                {/* Progress Bar Background */}
                <div className="absolute top-4 left-4 right-4 h-0.5 bg-gray-200 -z-10" />
                
                {/* Active Progress Bar */}
                <div 
                  className="absolute top-4 left-4 h-0.5 bg-green-500 -z-10 transition-all duration-500" 
                  style={{ width: `${(Math.max(0, currentStepIndex) / (steps.length - 1)) * 90}%` }} 
                />

                {steps.map((step, idx) => {
                  const isActive = idx <= currentStepIndex;
                  const Icon = step.icon;
                  return (
                    <div key={step.id} className="flex flex-col items-center gap-2 bg-white px-2">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center border-2 transition-colors ${isActive ? 'border-green-500 bg-green-50 text-green-600' : 'border-gray-200 text-gray-300'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className={`text-xs font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-red-500 py-4 bg-red-50 rounded-lg">
                This order has been cancelled. Please contact the restaurant.
              </div>
            )}
            
            {(order.status === 'ready' || order.status === 'completed') && (
              <div className="bg-green-100 text-green-800 p-4 rounded-lg text-center font-medium animate-pulse">
                Your order is ready! Please pick it up.
              </div>
            )}

          </CardContent>
        </Card>

        {/* Receipt Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-gray-500" /> Order Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <div className="flex gap-2">
                    <span className="font-bold w-6 text-center bg-gray-100 rounded text-gray-600">{item.quantity}x</span>
                    <span>{item.name_snapshot}</span>
                  </div>
                  <span className="text-gray-600">{formatMoney(item.line_total_cents, order.currency_code)}</span>
                </div>
              ))}
            </div>
            
            <Separator />
            
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatMoney(order.total_cents, order.currency_code)}</span>
            </div>
            <div className="text-xs text-gray-400 text-center pt-2">
              Placed at {new Date(order.placed_at).toLocaleString()}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}