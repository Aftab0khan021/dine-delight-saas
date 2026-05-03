import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Plus, Trash2 } from "lucide-react";

export type Testimonial = {
  name: string;
  text: string;
  rating: number;
};

export function TestimonialsCard({
  testimonials,
  onChange,
}: {
  testimonials: Testimonial[];
  onChange: (testimonials: Testimonial[]) => void;
}) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4 text-muted-foreground" />
          Customer Testimonials
        </CardTitle>
        <CardDescription>Add up to 5 customer reviews to display on your public page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {testimonials.map((t, i) => (
          <div key={i} className="flex gap-2 items-start p-3 rounded-lg border bg-muted/20">
            <div className="flex-1 space-y-2">
              <Input value={t.name} placeholder="Customer name" onChange={e => onChange(testimonials.map((item, idx) => idx === i ? { ...item, name: e.target.value } : item))} />
              <Textarea value={t.text} placeholder="What did they say?" className="h-16 resize-none" onChange={e => onChange(testimonials.map((item, idx) => idx === i ? { ...item, text: e.target.value } : item))} />
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map(s => (
                  <button key={s} type="button" onClick={() => onChange(testimonials.map((item, idx) => idx === i ? { ...item, rating: s } : item))}>
                    <Star className={`h-4 w-4 ${s <= t.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`} />
                  </button>
                ))}
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onChange(testimonials.filter((_, idx) => idx !== i))}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {testimonials.length < 5 && (
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...testimonials, { name: "", text: "", rating: 5 }])}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add Testimonial
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
