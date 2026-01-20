import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type CategoryEditorValues = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  defaultValues?: Partial<CategoryEditorValues>;
  saving?: boolean;
  onSubmit: (values: CategoryEditorValues) => Promise<void> | void;
};

export function CategoryEditorDrawer({
  open,
  onOpenChange,
  title,
  defaultValues,
  saving,
  onSubmit,
}: Props) {
  const form = useForm<CategoryEditorValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: (defaultValues?.description ?? "") as any,
      is_active: defaultValues?.is_active ?? true,
    },
    mode: "onChange",
  });

  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      form.reset({
        name: defaultValues?.name ?? "",
        description: (defaultValues?.description ?? "") as any,
        is_active: defaultValues?.is_active ?? true,
      });
      setSubmitted(false);
    }
  }, [open, defaultValues, form]);

  const errorText = useMemo(() => {
    if (!submitted) return null;
    return form.formState.errors.name?.message ?? null;
  }, [form.formState.errors.name?.message, submitted]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-xl">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>Changes apply immediately for this restaurant.</DrawerDescription>
          </DrawerHeader>

          <form
            className="px-4 pb-4 space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              setSubmitted(true);
              await onSubmit({
                ...values,
                description: values.description ? values.description : undefined,
              });
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input id="category-name" {...form.register("name")} placeholder="e.g. Starters" />
              {errorText ? <p className="text-sm text-destructive">{errorText}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-description">Description</Label>
              <Textarea
                id="category-description"
                rows={3}
                {...form.register("description")}
                placeholder="Optional description"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Visible</p>
                <p className="text-xs text-muted-foreground">Hide categories you don’t want customers to see.</p>
              </div>
              <Switch checked={form.watch("is_active")} onCheckedChange={(v) => form.setValue("is_active", v)} />
            </div>

            <DrawerFooter className="px-0">
              <Button type="submit" disabled={saving || form.formState.isSubmitting}>
                {saving || form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
              <DrawerClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
