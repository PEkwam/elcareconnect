import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Code2, Download, FileText, Info, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useUserRole } from "@/hooks/useUserRole";
import { docChapters, type DocBlock, type DocChapter } from "@/data/documentation";

const USER_GUIDE = "/docs/CareConnect_User_Guide.pdf";
const DEV_GUIDE = "/docs/CareConnect_Developer_Guide.pdf";

const blockText = (b: DocBlock): string => {
  switch (b.type) {
    case "p":
    case "note":
      return b.text;
    case "list":
    case "steps":
      return b.items.join(" ");
    case "table":
      return [...b.head, ...b.rows.flat()].join(" ");
  }
};

const Block = ({ block }: { block: DocBlock }) => {
  switch (block.type) {
    case "p":
      return <p className="text-sm leading-relaxed text-muted-foreground">{block.text}</p>;
    case "list":
      return (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {block.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-2 text-sm text-muted-foreground">
          {block.items.map((item, i) => (
            <li key={item} className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                {i + 1}
              </span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")} className="border-t">
                  {row.map((cell, i) => (
                    <td
                      key={cell}
                      className={i === 0 ? "px-3 py-2 font-medium" : "px-3 py-2 text-muted-foreground"}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "note":
      return (
        <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="leading-relaxed text-muted-foreground">{block.text}</span>
        </div>
      );
  }
};

const Documentation = () => {
  const { isAdmin, isSuperAdmin } = useUserRole();
  const [query, setQuery] = useState("");

  const visible = useMemo(
    () =>
      docChapters.filter((c) =>
        c.access === "all" ? true : c.access === "admin" ? isAdmin : isSuperAdmin,
      ),
    [isAdmin, isSuperAdmin],
  );

  const chapters: DocChapter[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return visible;
    return visible
      .map((c) => ({
        ...c,
        sections: c.sections.filter((s) =>
          [s.title, s.summary, ...s.blocks.map(blockText)].join(" ").toLowerCase().includes(q),
        ),
      }))
      .filter((c) => c.sections.length > 0);
  }, [visible, query]);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="mb-2 flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-primary" />
          <h1 className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-3xl font-bold text-transparent">
            Care Connect documentation
          </h1>
        </div>
        <p className="max-w-2xl text-muted-foreground">
          Everything you need to run Care Connect — from your first sign-in to campaign operations
          and platform configuration. Sections adapt to your access level.
        </p>
      </motion.header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the documentation…"
            className="pl-9"
            aria-label="Search documentation"
          />
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={USER_GUIDE} download>
              <Download className="mr-1.5 h-4 w-4" /> User guide (PDF)
            </a>
          </Button>
          {isAdmin && (
            <Button asChild variant="outline" size="sm">
              <a href={DEV_GUIDE} download>
                <Code2 className="mr-1.5 h-4 w-4" /> Developer guide (PDF)
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            {chapters.map((chapter) => (
              <div key={chapter.id}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {chapter.title}
                </p>
                <ul className="space-y-1 border-l pl-3">
                  {chapter.sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="block py-0.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        <div className="space-y-8">
          {chapters.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No documentation matches “{query}”.
              </CardContent>
            </Card>
          )}

          {chapters.map((chapter) => (
            <section key={chapter.id} id={chapter.id} className="scroll-mt-20 space-y-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold">{chapter.title}</h2>
                  {chapter.access !== "all" && (
                    <Badge variant="secondary" className="text-xs">
                      {chapter.access === "admin" ? "Admins" : "Super admins"}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{chapter.description}</p>
                <Separator className="mt-3" />
              </div>

              <div className="grid gap-4">
                {chapter.sections.map((section) => (
                  <Card key={section.id} id={section.id} className="scroll-mt-20">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <FileText className="h-4 w-4 text-primary" />
                        {section.title}
                      </CardTitle>
                      <CardDescription>{section.summary}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {section.blocks.map((block, i) => (
                        <Block key={i} block={block} />
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Documentation;
