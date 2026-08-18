import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BookOpen, Search, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  is_emergency_procedure: boolean;
  created_at: string;
  updated_at: string;
}

const KnowledgeBase = () => {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [filteredArticles, setFilteredArticles] = useState<KnowledgeArticle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newTags, setNewTags] = useState("");
  const [isEmergency, setIsEmergency] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchArticles();
  }, []);

  useEffect(() => {
    filterArticles();
  }, [articles, searchQuery, selectedCategory]);

  const fetchArticles = async () => {
    try {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("*")
        .order("is_emergency_procedure", { ascending: false })
        .order("title");

      if (error) throw error;
      setArticles(data || []);
    } catch (error) {
      console.error("Error fetching knowledge base:", error);
      toast({
        title: "Error",
        description: "Failed to fetch knowledge base articles",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterArticles = () => {
    let filtered = articles;

    if (searchQuery) {
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    if (selectedCategory && selectedCategory !== "all") {
      filtered = filtered.filter(article => article.category === selectedCategory);
    }

    setFilteredArticles(filtered);
  };

  const addArticle = async () => {
    if (!newTitle || !newContent || !newCategory) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("knowledge_base")
        .insert({
          title: newTitle,
          content: newContent,
          category: newCategory,
          tags: newTags.split(',').map(tag => tag.trim()).filter(tag => tag),
          is_emergency_procedure: isEmergency
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Knowledge base article added successfully",
      });

      // Reset form
      setNewTitle("");
      setNewContent("");
      setNewCategory("");
      setNewTags("");
      setIsEmergency(false);
      
      // Refresh articles
      fetchArticles();
    } catch (error) {
      console.error("Error adding article:", error);
      toast({
        title: "Error",
        description: "Failed to add knowledge base article",
        variant: "destructive",
      });
    }
  };

  const categories = ["all", ...Array.from(new Set(articles.map(article => article.category)))];
  const emergencyArticles = filteredArticles.filter(article => article.is_emergency_procedure);
  const regularArticles = filteredArticles.filter(article => !article.is_emergency_procedure);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Knowledge Base
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filter Controls */}
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search articles, tags, or content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === "all" ? "All Categories" : category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Article
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Knowledge Base Article</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Article title"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                  <Input
                    placeholder="Category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                  />
                  <Input
                    placeholder="Tags (comma separated)"
                    value={newTags}
                    onChange={(e) => setNewTags(e.target.value)}
                  />
                  <Textarea
                    placeholder="Article content"
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    rows={6}
                  />
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="emergency"
                      checked={isEmergency}
                      onChange={(e) => setIsEmergency(e.target.checked)}
                      className="h-4 w-4"
                    />
                    <label htmlFor="emergency" className="text-sm font-medium">
                      Emergency Procedure
                    </label>
                  </div>
                  <Button onClick={addArticle} className="w-full">
                    Add Article
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Emergency Procedures */}
          {emergencyArticles.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Emergency Procedures
              </h3>
              <Accordion type="single" collapsible className="space-y-2">
                {emergencyArticles.map((article) => (
                  <AccordionItem key={article.id} value={article.id} className="border border-destructive/20 rounded-lg px-3">
                    <AccordionTrigger className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{article.title}</span>
                        <Badge variant="destructive" className="ml-2">Emergency</Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-2">
                        <div className="prose prose-sm max-w-none">
                          <p className="whitespace-pre-wrap">{article.content}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline">{article.category}</Badge>
                          {article.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {/* Regular Articles */}
          {regularArticles.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Articles</h3>
              <Accordion type="single" collapsible className="space-y-2">
                {regularArticles.map((article) => (
                  <AccordionItem key={article.id} value={article.id} className="border rounded-lg px-3">
                    <AccordionTrigger className="text-left">
                      <span className="font-medium">{article.title}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-2">
                        <div className="prose prose-sm max-w-none">
                          <p className="whitespace-pre-wrap">{article.content}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline">{article.category}</Badge>
                          {article.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">{tag}</Badge>
                          ))}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {isLoading && (
            <p className="text-center text-muted-foreground py-8">Loading knowledge base...</p>
          )}

          {!isLoading && filteredArticles.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              {searchQuery || selectedCategory !== "all" 
                ? "No articles found matching your criteria" 
                : "No articles in knowledge base"}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeBase;