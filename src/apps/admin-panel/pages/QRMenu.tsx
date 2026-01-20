import { AdminLayout } from "../components/AdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Eye, QrCode } from "lucide-react";

export default function QRMenu() {
  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">QR Menu</h1>
          <p className="text-muted-foreground">Generate and manage QR codes for your menu</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>QR Code Generator</CardTitle>
              <CardDescription>Create a QR code for your digital menu</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center p-8 bg-muted rounded-lg">
                <div className="h-48 w-48 bg-white rounded-lg flex items-center justify-center border-2 border-dashed">
                  <QrCode className="h-32 w-32 text-muted-foreground" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download QR
                </Button>
                <Button variant="outline" className="flex-1">
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Menu
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Menu Settings</CardTitle>
              <CardDescription>Customize your digital menu experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Menu URL</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value="menu.restaurant.com/la-bella-pizza" 
                    readOnly 
                    className="flex-1 px-3 py-2 border rounded-md bg-muted text-sm"
                  />
                  <Button variant="outline" size="sm">Copy</Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Options</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Show prices</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked />
                    <span className="text-sm">Show images</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" />
                    <span className="text-sm">Show allergen information</span>
                  </label>
                </div>
              </div>
              <Button className="w-full">Save Settings</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
