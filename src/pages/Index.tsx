import { Link } from "react-router-dom";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Folder, Calendar, HelpCircle, StickyNote } from "lucide-react";
import AppHeader from "@/components/AppHeader";

const Index = () => {
  useEffect(() => {
    document.title = "Project MC – Home";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Project MC: access Files, Appointments, Open Questions, and Notes.");

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <div className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-3xl font-bold text-foreground">Project MC</h1>
        <p className="mt-2 text-muted-foreground">Your hub for files, appointments, questions and notes.</p>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Link to="/files" className="group block rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <Folder className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Files</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Upload, manage, and share files.</p>
                <Button className="mt-4" variant="secondary">Open</Button>
              </CardContent>
            </Card>
          </Link>

          <Link to="/appointments" className="group block rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Appointments</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Schedule and track meetings.</p>
                <Button className="mt-4" variant="secondary">Open</Button>
              </CardContent>
            </Card>
          </Link>

          <Link to="/questions" className="group block rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Open Questions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Track unresolved items and decisions.</p>
                <Button className="mt-4" variant="secondary">Open</Button>
              </CardContent>
            </Card>
          </Link>

          <Link to="/notes" className="group block rounded-md focus:outline-none focus:ring-2 ring-ring">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center gap-3">
                <StickyNote className="h-5 w-5 text-muted-foreground" />
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Capture thoughts and ideas.</p>
                <Button className="mt-4" variant="secondary">Open</Button>
              </CardContent>
            </Card>
          </Link>
        </section>
      </main>
    </div>
  );
};

export default Index;

