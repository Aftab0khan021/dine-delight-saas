import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";

export default function Branding() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Branding</h1>
          <p className="text-muted-foreground">Customize your restaurant's visual identity</p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Logo & Images</CardTitle>
              <CardDescription>Upload and manage your restaurant's visual assets</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <label className="text-sm font-medium mb-2 block">Restaurant Logo</label>
                <div className="flex items-center gap-4">
                  <div className="h-24 w-24 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted">
                    <span className="text-xs text-muted-foreground">Logo</span>
                  </div>
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Logo
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Cover Image</label>
                <div className="h-48 rounded-lg border-2 border-dashed flex items-center justify-center bg-muted">
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Cover Image
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
              <CardDescription>Choose colors that represent your restaurant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Primary Color</label>
                  <div className="flex gap-2">
                    <div className="h-10 w-full rounded border flex items-center px-3">
                      <input type="color" defaultValue="#000000" className="h-6 w-full border-0" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Accent Color</label>
                  <div className="flex gap-2">
                    <div className="h-10 w-full rounded border flex items-center px-3">
                      <input type="color" defaultValue="#ff6b6b" className="h-6 w-full border-0" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Restaurant Information</CardTitle>
              <CardDescription>Basic details about your restaurant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Restaurant Name</label>
                <input 
                  type="text" 
                  placeholder="La Bella Pizza" 
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <textarea 
                  placeholder="Tell customers about your restaurant..." 
                  className="w-full px-3 py-2 border rounded-md h-24"
                />
              </div>
              <Button>Save Changes</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
