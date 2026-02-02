import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { inviteSchema, type InviteValues } from "./validation";
import type { StaffRole, StaffCategory } from "./staff-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function InviteStaffDialog({ open, onOpenChange }: Props) {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "user" },
    mode: "onChange",
  });

  // Fetch staff categories
  const categoriesQuery = useQuery({
    queryKey: ["staff-categories", restaurant?.id],
    queryFn: async () => {
      if (!restaurant?.id) return [];
      const { data, error } = await supabase
        .from("staff_categories")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("name", { ascending: true });

      if (error) throw error;
      return data as StaffCategory[];
    },
    enabled: !!restaurant?.id && open,
  });

  useEffect(() => {
    if (!open) form.reset({ email: "", role: "user" });
  }, [open, form]);

  const mutation = useMutation({
    mutationFn: async (values: InviteValues) => {
      if (!restaurant?.id) throw new Error("Restaurant ID missing");

      const { data, error } = await supabase.functions.invoke("invite-staff", {
        body: {
          email: values.email,
          role: values.role,
          restaurant_id: restaurant.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Invitation Sent", description: "Staff member invited successfully." });
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
      onOpenChange(false);
    },
    onError: (error) => {
      console.error(error);
      toast({
        title: "Error",
        description: error.message || "Failed to invite staff.",
        variant: "destructive"
      });
    },
  });

  const onSubmit = (values: InviteValues) => {
    mutation.mutate(values);
  };

  const categories = categoriesQuery.data || [];
  const hasCategories = categories.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>
            {hasCategories
              ? "Send an invite and assign a staff category with specific permissions."
              : "Send an invite for this restaurant. Create staff categories to assign specific permissions."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(async (values) => {
            await onSubmit(values);
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" placeholder="name@company.com" {...form.register("email")} />
            {form.formState.errors.email?.message ? (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label>
              {hasCategories ? "Staff Category" : "Role"}
            </Label>
            <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v as StaffRole)}>
              <SelectTrigger>
                <SelectValue placeholder={hasCategories ? "Select category" : "Select role"} />
              </SelectTrigger>
              <SelectContent>
                {hasCategories ? (
                  <>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                          <span>{category.name}</span>
                          {category.is_default && (
                            <Badge variant="secondary" className="text-xs ml-1">
                              Default
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="restaurant_admin">Restaurant admin</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
            {form.formState.errors.role?.message ? (
              <p className="text-sm text-destructive">{form.formState.errors.role.message}</p>
            ) : null}
            {hasCategories && (
              <p className="text-xs text-muted-foreground">
                Staff members will inherit permissions from their assigned category
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending || form.formState.isSubmitting}>
              {mutation.isPending ? "Inviting…" : "Invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
