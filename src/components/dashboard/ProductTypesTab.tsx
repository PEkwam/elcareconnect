import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProductType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const ProductTypesTab = () => {
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ProductType | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchProductTypes();
  }, []);

  const fetchProductTypes = async () => {
    try {
      const { data, error } = await supabase
        .from("product_types")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;
      setProductTypes(data || []);
    } catch (error) {
      console.error("Error fetching product types:", error);
      toast({
        title: "Error",
        description: "Failed to load product types",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent, keepOpen = false) => {
    e.preventDefault();
    
    try {
      if (editingType) {
        // Update existing
        const { error } = await supabase
          .from("product_types")
          .update({
            name: formData.name,
            description: formData.description,
          })
          .eq("id", editingType.id);

        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Product type updated successfully",
        });
      } else {
        // Create new
        const { error } = await supabase
          .from("product_types")
          .insert({
            code: formData.code.toUpperCase(),
            name: formData.name,
            description: formData.description,
          });

        if (error) throw error;
        
        toast({
          title: "Success",
          description: "Product type created successfully",
        });
      }

      setFormData({ code: "", name: "", description: "" });
      fetchProductTypes();
      if (!keepOpen || editingType) {
        setIsDialogOpen(false);
        setEditingType(null);
      }
    } catch (error: any) {
      console.error("Error saving product type:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save product type",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (type: ProductType) => {
    setEditingType(type);
    setFormData({
      code: type.code,
      name: type.name,
      description: type.description || "",
    });
    setIsDialogOpen(true);
  };

  const handleToggleActive = async (type: ProductType) => {
    try {
      const { error } = await supabase
        .from("product_types")
        .update({ is_active: !type.is_active })
        .eq("id", type.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Product type ${type.is_active ? "deactivated" : "activated"}`,
      });
      
      fetchProductTypes();
    } catch (error) {
      console.error("Error toggling product type:", error);
      toast({
        title: "Error",
        description: "Failed to update product type status",
        variant: "destructive",
      });
    }
  };

  const openNewDialog = () => {
    setEditingType(null);
    setFormData({ code: "", name: "", description: "" });
    setIsDialogOpen(true);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Product Types</h2>
          <p className="text-muted-foreground">Manage insurance product types</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNewDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Product Type
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingType ? "Edit Product Type" : "Add Product Type"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Code</label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., LTN, ACI"
                  maxLength={10}
                  disabled={!!editingType}
                  required
                />
                {!editingType && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Code cannot be changed after creation
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Life Term Insurance"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Description of the product type"
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="flex-1 min-w-[120px]">
                  {editingType ? "Update" : "Create"}
                </Button>
                {!editingType && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={(e) => handleSubmit(e as any, true)}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Save & add another
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setEditingType(null);
                    setFormData({ code: "", name: "", description: "" });
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {productTypes.map((type) => (
          <Card key={type.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-lg">{type.name}</CardTitle>
                  <Badge variant={type.is_active ? "default" : "secondary"}>
                    {type.code}
                  </Badge>
                  <Badge variant={type.is_active ? "default" : "outline"}>
                    {type.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(type)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={type.is_active ? "secondary" : "default"}
                    onClick={() => handleToggleActive(type)}
                  >
                    {type.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            {type.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{type.description}</p>
              </CardContent>
            )}
          </Card>
        ))}

        {productTypes.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-8">
              <p className="text-muted-foreground mb-4">No product types found</p>
              <Button onClick={openNewDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Product Type
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default ProductTypesTab;
