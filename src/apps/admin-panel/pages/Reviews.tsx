import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { FeatureGate } from "../components/FeatureGate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Eye, EyeOff, Trash2, RotateCcw, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { analyzeSentimentFree, type SentimentResult } from "../lib/ai-utils";
import { useAITier } from "../hooks/useAITier";
import { TestimonialsCard, type Testimonial } from "../components/branding/TestimonialsCard";

export default function Reviews() {
  return (
    <FeatureGate featureKey="reviews" featureName="Customer Reviews" description="View and manage customer reviews and ratings on your restaurant profile.">
      <ReviewsContent />
    </FeatureGate>
  );
}

function ReviewsContent() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { tier } = useAITier(restaurant?.id);
  const sentimentTier = tier("sentiment_analysis");

  const reviewsQuery = useQuery({
    queryKey: ["admin", "reviews", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_reviews")
        .select("id, restaurant_id, customer_name, customer_phone, rating, review_text, created_at, sentiment_label, ai_reply")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data ?? [];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_approved }: { id: string; is_approved: boolean }) => {
      const { error } = await supabase
        .from("customer_reviews")
        .update({ is_approved })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "reviews", restaurant?.id] });
      toast({ title: "Review updated" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e?.message || "Failed to update", variant: "destructive" });
    },
  });

  const reviews = reviewsQuery.data ?? [];
  const approvedCount = reviews.filter(r => r.is_approved).length;
  const hiddenCount = reviews.filter(r => !r.is_approved).length;
  const avgRating = reviews.length > 0
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  // Compute sentiment stats
  const sentimentStats = reviews.reduce(
    (acc, r) => {
      const s = analyzeSentimentFree(r.review_text || "", r.rating);
      acc[s.label]++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Reviews</h1>
          <p className="text-muted-foreground mt-1">Manage reviews left by customers on your restaurant profile.</p>
        </div>
        <Button variant="outline" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["admin", "reviews"] })} title="Refresh reviews">
          <RefreshCw className={`h-4 w-4 ${reviewsQuery.isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Total Reviews</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold">{reviews.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Avg Rating</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5">
              <p className="text-2xl font-bold">{avgRating}</p>
              <Star className="h-5 w-5 text-amber-400 fill-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Visible</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{approvedCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Hidden</CardDescription></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{hiddenCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Sentiment</CardDescription></CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-600">😊 {sentimentStats.positive}</span>
              <span className="text-amber-500">😐 {sentimentStats.neutral}</span>
              <span className="text-red-500">😞 {sentimentStats.negative}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Reviews</CardTitle>
          <CardDescription>Toggle visibility to show or hide reviews on your public profile.</CardDescription>
        </CardHeader>
        <CardContent>
          {reviewsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No reviews yet. They'll appear here once customers leave feedback.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead className="min-w-[200px]">Review</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviews.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{r.customer_name}</p>
                          {r.customer_phone && <p className="text-xs text-muted-foreground">{r.customer_phone}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}`} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const s = analyzeSentimentFree(r.review_text || "", r.rating);
                          return (
                            <Badge variant="outline" className={`gap-1 ${s.color}`}>
                              {s.emoji} {s.label}
                              {sentimentTier === "paid" && (
                                <span className="text-[9px] ml-0.5 opacity-60">Pro</span>
                              )}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground line-clamp-2">{r.review_text || "—"}</p>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.created_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.is_approved ? "default" : "secondary"}>
                          {r.is_approved ? "Visible" : "Hidden"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {r.is_approved ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-amber-600 hover:text-amber-700 gap-1"
                              onClick={() => toggleMutation.mutate({ id: r.id, is_approved: false })}
                              disabled={toggleMutation.isPending}
                              title="Hide review"
                            >
                              <EyeOff className="h-3.5 w-3.5" /> Hide
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-700 gap-1"
                              onClick={() => toggleMutation.mutate({ id: r.id, is_approved: true })}
                              disabled={toggleMutation.isPending}
                              title="Show review"
                            >
                              <Eye className="h-3.5 w-3.5" /> Show
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Customer Testimonials */}
      <TestimonialsSection restaurantId={restaurant?.id} />
    </div>
  );
}

// --- Subcomponent: Testimonials Section ---
function TestimonialsSection({ restaurantId }: { restaurantId?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: restaurantData } = useQuery({
    queryKey: ["admin", "restaurant", restaurantId, "testimonials"],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("settings")
        .eq("id", restaurantId!)
        .single();
      return data;
    },
  });

  useEffect(() => {
    if (restaurantData) {
      const s = restaurantData.settings && typeof restaurantData.settings === "object" ? restaurantData.settings as any : {};
      setTestimonials(Array.isArray(s.testimonials) ? s.testimonials : []);
    }
  }, [restaurantData]);

  const handleSave = async () => {
    if (!restaurantId) return;
    setSaving(true);
    try {
      const currentSettings = restaurantData?.settings && typeof restaurantData.settings === "object" ? restaurantData.settings as any : {};
      const { error } = await supabase.from("restaurants").update({
        settings: { ...currentSettings, testimonials },
      } as any).eq("id", restaurantId);
      if (error) throw error;
      toast({ title: "Saved", description: "Testimonials updated." });
      qc.invalidateQueries({ queryKey: ["admin", "restaurant"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <TestimonialsCard testimonials={testimonials} onChange={setTestimonials} />
      <Button onClick={handleSave} disabled={saving} size="sm">
        {saving ? "Saving..." : "Save Testimonials"}
      </Button>
    </div>
  );
}
