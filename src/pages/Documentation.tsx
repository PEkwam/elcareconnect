import { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Code2, Download, ExternalLink, FileText, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/useUserRole";

const USER_GUIDE = "/docs/EL_Calls_User_Guide.pdf";
const DEV_GUIDE = "/docs/EL_Calls_Developer_Guide.pdf";

type DocCardProps = {
  title: string;
  description: string;
  url: string;
  icon: React.ReactNode;
  audience: string;
};

const DocViewer = ({ title, description, url, icon, audience }: DocCardProps) => (
  <Card className="overflow-hidden border-primary/10 shadow-lg">
    <CardHeader className="bg-gradient-to-r from-primary/10 via-secondary/5 to-background">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/15 p-2.5 text-primary">{icon}</div>
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
            <Badge variant="secondary" className="mt-2 text-xs">
              {audience}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" /> Open
            </a>
          </Button>
          <Button asChild size="sm">
            <a href={url} download>
              <Download className="h-4 w-4 mr-1.5" /> Download
            </a>
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      <div className="aspect-[4/5] w-full bg-muted/40">
        <iframe
          src={`${url}#view=FitH`}
          title={title}
          className="w-full h-full border-0"
        />
      </div>
    </CardContent>
  </Card>
);

const Documentation = () => {
  const { isAdmin } = useUserRole();
  const [tab, setTab] = useState("user");

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Documentation
          </h1>
        </div>
        <p className="text-muted-foreground">
          Read online or download the PDFs. {isAdmin && "Admins also have access to the developer guide."}
        </p>
      </motion.div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className={`grid w-full ${isAdmin ? "grid-cols-2" : "grid-cols-1"} max-w-md mb-6`}>
          <TabsTrigger value="user" className="gap-2">
            <FileText className="h-4 w-4" /> User Guide
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="dev" className="gap-2">
              <Code2 className="h-4 w-4" /> Developer Guide
              <Shield className="h-3 w-3 ml-1 opacity-70" />
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="user">
          <DocViewer
            title="Care Connect — User Guide"
            description="Day-to-day usage: sign in, handle calls, run campaigns, manage your profile."
            url={USER_GUIDE}
            icon={<FileText className="h-5 w-5" />}
            audience="For all users"
          />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="dev">
            <DocViewer
              title="Care Connect — Developer Guide"
              description="Architecture, DB schema, edge functions, integrations, and a step-by-step setup checklist."
              url={DEV_GUIDE}
              icon={<Code2 className="h-5 w-5" />}
              audience="Admin / Super Admin only"
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Documentation;
