import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../../state/restaurant-context";
import { useToast } from "@/hooks/use-toast"; 
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteSchema, type InviteValues } from "./validation";
import type { StaffRole } from "./staff-utils";

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
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>Send an invite for this restaurant. (No email sending yet.)</DialogDescription>
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
            <Label>Role</Label>
            <Select value={form.watch("role")} onValueChange={(v) => form.setValue("role", v as StaffRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="restaurant_admin">Restaurant admin</SelectItem>
              </SelectContent>
            </Select>
            {form.formState.errors.role?.message ? (
              <p className="text-sm text-destructive">{form.formState.errors.role.message}</p>
            ) : null}
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
