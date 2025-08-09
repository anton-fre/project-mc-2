import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Patient {
  id: string;
  name: string;
}

interface PatientContextValue {
  patients: Patient[];
  loading: boolean;
  selectedPatientId: string | null;
  selectedPatient: Patient | null;
  setSelectedPatientId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const PatientContext = createContext<PatientContextValue | undefined>(undefined);

const STORAGE_KEY = "selectedPatientId";

export const PatientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatientId, setSelectedPatientIdState] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === selectedPatientId) ?? null,
    [patients, selectedPatientId]
  );

  const setSelectedPatientId = (id: string | null) => {
    setSelectedPatientIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  const loadPatients = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) {
        setPatients([]);
        setSelectedPatientId(null);
        return;
      }
      const { data, error } = await supabase
        .from("patients")
        .select("id,name")
        .eq("user_id", userId)
        .order("name", { ascending: true });
      if (error) throw error;
      const list = (data as Patient[]) || [];
      setPatients(list);

      // Initialize selection if missing
      if (!selectedPatientId && list.length) {
        const mc = list.find((p) => p.name.toLowerCase() === "mc");
        setSelectedPatientId(mc ? mc.id : list[0].id);
      } else if (selectedPatientId && !list.some((p) => p.id === selectedPatientId)) {
        // Stored id no longer exists
        setSelectedPatientId(null);
      }
    } catch (e) {
      console.error("Failed loading patients", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial load and on auth changes
    loadPatients();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadPatients();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: PatientContextValue = {
    patients,
    loading,
    selectedPatientId,
    selectedPatient,
    setSelectedPatientId,
    refresh: loadPatients,
  };

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
};

export const usePatient = () => {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error("usePatient must be used within PatientProvider");
  return ctx;
};
