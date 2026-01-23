
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Percent, DollarSign, Tag } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const discountSchema = z.object({
    type: z.enum(["percentage", "fixed"]),
    value: z.coerce.number().min(0),
    reason: z.string().min(1, "Reason is required"),
});

type DiscountForm = z.infer<typeof discountSchema>;

interface ManualDiscountDialogProps {
    orderId: string;
    orderTotalCents: number;
    trigger?: React.ReactNode;
}

export function ManualDiscountDialog({ orderId, orderTotalCents, trigger }: ManualDiscountDialogProps) {
    const { restaurant } = useRestaurantContext();
    const qc = useQueryClient();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);

    const form = useForm<DiscountForm>({
        resolver: zodResolver(discountSchema),
        defaultValues: {
            type: "percentage",
            value: 0,
            reason: "",
        },
    });

    const applyDiscountMutation = useMutation({
        mutationFn: async (values: DiscountForm) => {
            if (!restaurant?.id) throw new Error("Missing restaurant");

            let discountCents = 0;
            if (values.type === "percentage") {
                discountCents = Math.round(orderTotalCents * (values.value / 100));
            } else {
                discountCents = Math.round(values.value * 100);
            }

            // Prevent discount > total
            if (discountCents > orderTotalCents) {
                throw new Error("Discount cannot exceed order total");
            }

            const { error } = await supabase
                .from("orders")
                .update({
                    discount_type: "manual",
                    discount_cents: discountCents,
                    discount_reason: values.reason
                })
                .eq("id", orderId)
                .eq("restaurant_id", restaurant.id);

            if (error) throw error;
        },
        onSuccess: () => {
            setOpen(false);
            form.reset();
            toast({ title: "Discount applied" });
            qc.invalidateQueries({ queryKey: ["admin", "orders"] });
        },
        onError: (error) => {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        }
    });

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm" className="w-full">
                        <Tag className="mr-2 h-4 w-4" /> Add Discount
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Apply Manual Discount</DialogTitle>
                    <DialogDescription>
                        Apply a one-time discount to this order.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={form.handleSubmit((v) => applyDiscountMutation.mutate(v))} className="grid gap-4 py-4">
                    <div className="flex justify-center">
                        <ToggleGroup
                            type="single"
                            value={form.watch("type")}
                            onValueChange={(v) => v && form.setValue("type", v as "percentage" | "fixed")}
                        >
                            <ToggleGroupItem value="percentage" aria-label="Percentage">
                                <Percent className="h-4 w-4 mr-2" /> % Off
                            </ToggleGroupItem>
                            <ToggleGroupItem value="fixed" aria-label="Fixed Amount">
                                <DollarSign className="h-4 w-4 mr-2" /> Fixed Amount
                            </ToggleGroupItem>
                        </ToggleGroup>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="value" className="text-right">
                            Value
                        </Label>
                        <div className="col-span-3 relative">
                            <Input
                                id="value"
                                type="number"
                                step={form.watch("type") === "percentage" ? "1" : "0.01"}
                                className="pl-8"
                                {...form.register("value")}
                            />
                            <div className="absolute left-2.5 top-2.5 text-muted-foreground">
                                {form.watch("type") === 'percentage' ? <Percent className="h-4 w-4" /> : <DollarSign className="h-4 w-4" />}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="reason" className="text-right">
                            Reason
                        </Label>
                        <Input
                            id="reason"
                            placeholder="e.g. Employee Meal, Complaint"
                            className="col-span-3"
                            {...form.register("reason")}
                        />
                    </div>

                    {form.formState.errors.reason && (
                        <p className="text-xs text-destructive text-right">{form.formState.errors.reason.message}</p>
                    )}

                    <DialogFooter>
                        <Button type="submit" disabled={applyDiscountMutation.isPending}>
                            {applyDiscountMutation.isPending ? "Applying..." : "Apply Discount"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
