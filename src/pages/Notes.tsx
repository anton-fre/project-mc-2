import { useEffect } from "react";
import AppHeader from "@/components/AppHeader";

const Notes = () => {
  useEffect(() => {
    document.title = "Notes | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Write and organize your notes in Project MC.");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <p className="mt-2 text-muted-foreground">This is a placeholder. Tell me the features you want for notes.</p>
      </main>
    </div>
  );
};

export default Notes;
