import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { inviteSchema, type InviteValues } from "./validation";
import type { StaffRole } from "./staff-utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onSubmit: (values: InviteValues) => Promise<void>;
};

export function InviteStaffDialog({ open, onOpenChange, saving, onSubmit }: Props) {
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "user" },
    mode: "onChange",
  });

  useEffect(() => {
    if (!open) {
      form.reset({ email: "", role: "user" });
    }
  }, [open, form]);

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
            <Button type="submit" disabled={saving || form.formState.isSubmitting}>
              {saving || form.formState.isSubmitting ? "Inviting…" : "Invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
