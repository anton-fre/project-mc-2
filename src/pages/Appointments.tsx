import { useEffect } from "react";
import AppHeader from "@/components/AppHeader";

const Appointments = () => {
  useEffect(() => {
    document.title = "Appointments | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Manage your Project MC appointments and meetings.");
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Appointments</h1>
        <p className="mt-2 text-muted-foreground">This is a placeholder. Tell me how you want appointments to work.</p>
      </main>
    </div>
  );
};

export default Appointments;
