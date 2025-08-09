import { useEffect } from "react";
import AppHeader from "@/components/AppHeader";
import { usePatient } from "@/context/PatientContext";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
const Notes = () => {
  useEffect(() => {
    document.title = "Notes | Project MC";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Write and organize your notes in Project MC.");
  }, []);

  const { patients, selectedPatientId, setSelectedPatientId } = usePatient();
  const patientSelectValue = selectedPatientId ?? "__general__";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-screen-2xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Notes</h1>
        <p className="mt-2 text-muted-foreground">This is a placeholder. Tell me the features you want for notes.</p>

        <section className="mt-6 flex items-center gap-2">
          <Label htmlFor="patient">Patient</Label>
          <Select value={patientSelectValue} onValueChange={(v) => setSelectedPatientId(v === "__general__" ? null : v)}>
            <SelectTrigger id="patient" className="min-w-[220px]"><SelectValue placeholder="Select a patient" /></SelectTrigger>
            <SelectContent className="z-50">
              <SelectItem value="__general__">General</SelectItem>
              {patients.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>
      </main>
    </div>
  );
};

export default Notes;
