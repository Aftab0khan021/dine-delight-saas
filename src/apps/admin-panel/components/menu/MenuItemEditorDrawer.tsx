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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  category_id: z.string().uuid().nullable().optional(),
  price_cents: z
    .number({ invalid_type_error: "Price is required" })
    .int("Price must be a whole number of cents")
    .min(0, "Price cannot be negative"),
  image_url: z.string().trim().url("Must be a valid URL").max(2000).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

export type MenuItemEditorValues = z.infer<typeof schema>;

export type CategoryOption = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  categories: CategoryOption[];
  defaultValues?: Partial<MenuItemEditorValues>;
  saving?: boolean;
  onSubmit: (values: MenuItemEditorValues) => Promise<void> | void;
};

export function MenuItemEditorDrawer({
  open,
  onOpenChange,
  title,
  categories,
  defaultValues,
  saving,
  onSubmit,
}: Props) {
  const form = useForm<MenuItemEditorValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: (defaultValues?.description ?? "") as any,
      category_id: defaultValues?.category_id ?? null,
      price_cents: defaultValues?.price_cents ?? 0,
      image_url: (defaultValues?.image_url ?? "") as any,
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
        category_id: defaultValues?.category_id ?? null,
        price_cents: defaultValues?.price_cents ?? 0,
        image_url: (defaultValues?.image_url ?? "") as any,
        is_active: defaultValues?.is_active ?? true,
      });
      setSubmitted(false);
    }
  }, [open, defaultValues, form]);

  const nameError = useMemo(() => {
    if (!submitted) return null;
    return form.formState.errors.name?.message ?? null;
  }, [form.formState.errors.name?.message, submitted]);

  const priceError = useMemo(() => {
    if (!submitted) return null;
    return form.formState.errors.price_cents?.message ?? null;
  }, [form.formState.errors.price_cents?.message, submitted]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-xl">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>Prices are stored in cents (e.g. $12.50 → 1250).</DrawerDescription>
          </DrawerHeader>

          <form
            className="px-4 pb-4 space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              setSubmitted(true);
              await onSubmit({
                ...values,
                description: values.description ? values.description : undefined,
                image_url: values.image_url ? values.image_url : undefined,
                category_id: values.category_id ? values.category_id : null,
              });
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="item-name">Name</Label>
              <Input id="item-name" {...form.register("name")} placeholder="e.g. Margherita Pizza" />
              {nameError ? <p className="text-sm text-destructive">{nameError}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-description">Description</Label>
              <Textarea id="item-description" rows={3} {...form.register("description")} placeholder="Optional description" />
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.watch("category_id") ?? "none"}
                onValueChange={(v) => form.setValue("category_id", v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-price">Price (cents)</Label>
              <Input
                id="item-price"
                inputMode="numeric"
                {...form.register("price_cents", { valueAsNumber: true })}
                placeholder="1250"
              />
              {priceError ? <p className="text-sm text-destructive">{priceError}</p> : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-image">Image URL</Label>
              <Input id="item-image" {...form.register("image_url")} placeholder="https://…" />
              {submitted && form.formState.errors.image_url?.message ? (
                <p className="text-sm text-destructive">{form.formState.errors.image_url.message}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Available</p>
                <p className="text-xs text-muted-foreground">Hide items you’re not currently serving.</p>
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
