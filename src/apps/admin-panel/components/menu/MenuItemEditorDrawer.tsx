import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, Link as LinkIcon, Image as ImageIcon, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// --- Schema ---
const schema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be positive"),
  category_id: z.string().optional(),
  is_active: z.boolean().default(true),
  image_url: z.string().nullable().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemToEdit?: any;
  categories: any[];
}

export default function MenuItemEditorDrawer({
  open,
  onOpenChange,
  itemToEdit,
  categories,
}: Props) {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  
  // UI State for Image Handling
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      category_id: "",
      is_active: true,
      image_url: null,
    },
  });

  // Reset form when opening
  useEffect(() => {
    if (open) {
      if (itemToEdit) {
        form.reset({
          name: itemToEdit.name,
          description: itemToEdit.description || "",
          price: itemToEdit.price_cents / 100,
          category_id: itemToEdit.category_id || "uncategorized",
          is_active: itemToEdit.is_active,
          image_url: itemToEdit.image_url,
        });
        
        // Smart Tab Selection: If it's a Supabase URL, go to upload tab, else URL tab
        const isSupabaseUrl = itemToEdit.image_url && itemToEdit.image_url.includes("supabase");
        setActiveTab(isSupabaseUrl ? "upload" : "url");
      } else {
        form.reset({
          name: "",
          description: "",
          price: 0,
          category_id: categories[0]?.id || "uncategorized",
          is_active: true,
          image_url: null,
        });
        setActiveTab("upload");
      }
    }
  }, [open, itemToEdit, categories, form]);

  // --- Image Upload Handler ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    if (!restaurant) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${restaurant.id}/${Math.random().toString(36).slice(2)}.${fileExt}`;

    setUploading(true);
    try {
      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('menu-items')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data } = supabase.storage.from('menu-items').getPublicUrl(fileName);
      
      // 3. Set to Form
      form.setValue("image_url", data.publicUrl, { shouldDirty: true });
      toast({ title: "Success", description: "Image uploaded successfully" });
    } catch (error: any) {
      toast({ 
        title: "Upload Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = () => {
    form.setValue("image_url", null, { shouldDirty: true });
  };

  // --- Save Mutation ---
  const mutation = useMutation({
    mutationFn: async (values: FormData) => {
      if (!restaurant) throw new Error("No restaurant context");

      const payload = {
        restaurant_id: restaurant.id,
        name: values.name,
        description: values.description || null,
        price_cents: Math.round(values.price * 100),
        category_id: values.category_id === "uncategorized" ? null : values.category_id,
        is_active: values.is_active,
        image_url: values.image_url,
      };

      if (itemToEdit) {
        const { error } = await supabase
          .from("menu_items")
          .update(payload)
          .eq("id", itemToEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("menu_items").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "menu"] });
      toast({ title: "Saved", description: "Menu item updated successfully." });
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const currentImage = form.watch("image_url");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-lg h-[85vh] flex flex-col">
          <DrawerHeader>
            <DrawerTitle>
              {itemToEdit ? "Edit Item" : "New Menu Item"}
            </DrawerTitle>
          </DrawerHeader>

          <form
            onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
            className="p-4 space-y-6 flex-1 overflow-y-auto"
          >
            {/* --- Image Selection Area --- */}
            <div className="space-y-3">
              <Label>Item Image</Label>
              
              <div className="w-full border rounded-lg p-4 bg-muted/20 space-y-4">
                {/* Preview if exists */}
                {currentImage && (
                  <div className="relative w-full h-48 bg-white rounded-lg border overflow-hidden group shadow-sm mb-4">
                    <img 
                      src={currentImage} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        type="button" 
                        variant="destructive" 
                        size="sm" 
                        onClick={handleRemoveImage}
                      >
                        <X className="w-4 h-4 mr-2" /> Remove Image
                      </Button>
                    </div>
                  </div>
                )}

                {/* Tabs for Upload vs URL */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload">
                      <Upload className="w-4 h-4 mr-2" /> Upload Photo
                    </TabsTrigger>
                    <TabsTrigger value="url">
                      <LinkIcon className="w-4 h-4 mr-2" /> Paste URL
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Upload Tab Content */}
                  <TabsContent value="upload" className="mt-4">
                    <div className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-muted-foreground/25 rounded-lg hover:bg-muted/50 transition-colors bg-white">
                      <label className="cursor-pointer flex flex-col items-center gap-2 w-full h-full justify-center">
                        {uploading ? (
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        ) : (
                          <>
                            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                            <span className="text-sm text-muted-foreground font-medium">Click to browse files</span>
                          </>
                        )}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/png, image/jpeg, image/webp" 
                          onChange={handleFileUpload}
                          disabled={uploading}
                        />
                      </label>
                    </div>
                  </TabsContent>

                  {/* URL Tab Content */}
                  <TabsContent value="url" className="mt-4 space-y-2">
                    <Input 
                      {...form.register("image_url")} 
                      placeholder="https://example.com/burger.jpg" 
                    />
                    <p className="text-xs text-muted-foreground">
                      Paste a direct link to an image hosted elsewhere.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>
            </div>

            {/* --- Standard Form Fields --- */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Name</Label>
                <Input {...form.register("name")} placeholder="e.g. Cheese Burger" />
                {form.formState.errors.name && (
                  <p className="text-xs text-red-500">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("price")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                {...form.register("description")}
                placeholder="Ingredients, allergens, etc."
                className="h-20 resize-none"
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Label>Category</Label>
                <Select
                  value={form.watch("category_id") || "uncategorized"}
                  onValueChange={(val) => form.setValue("category_id", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="uncategorized">Uncategorized</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Availability</Label>
                <div className="flex items-center gap-2 h-10 border rounded-md px-3 bg-background">
                  <Switch
                    checked={form.watch("is_active")}
                    onCheckedChange={(c) => form.setValue("is_active", c)}
                  />
                  <span className="text-sm text-muted-foreground">
                    {form.watch("is_active") ? "In Stock" : "Sold Out"}
                  </span>
                </div>
              </div>
            </div>
          </form>

          <DrawerFooter className="px-4 pb-4">
            <Button 
              type="button" 
              disabled={mutation.isPending || uploading} 
              className="w-full"
              onClick={form.handleSubmit((d) => mutation.mutate(d))}
            >
              {mutation.isPending ? <Loader2 className="animate-spin h-4 w-4" /> : "Save Item"}
            </Button>
            <DrawerClose asChild>
              <Button variant="outline" className="w-full">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}