import { useEffect } from "react";
import AppHeader from "@/components/AppHeader";

const Questions = () => {
  useEffect(() => {
    document.title = "Open Questions | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Track and resolve open questions in Project MC.");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Open Questions</h1>
        <p className="mt-2 text-muted-foreground">This is a placeholder. Describe how you'd like to manage questions.</p>
      </main>
    </div>
  );
};

export default Questions;
