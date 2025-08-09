import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { usePatient } from "@/context/PatientContext";
const navItems = [
  { label: "Files", to: "/files" },
  { label: "Patients", to: "/patients" },
  { label: "Appointments", to: "/appointments" },
  { label: "Open Questions", to: "/questions" },
  { label: "Notes", to: "/notes" },
  { label: "Digitalize documentation", to: "/digitalize-documentation" },
];

const AppHeader = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { patients, selectedPatientId, setSelectedPatientId } = usePatient();
  const isActive = (to: string) => location.pathname === to;

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    supabase.auth.getSession().then(({ data }) => setUserEmail(data.session?.user?.email ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background">
      <div className="mx-auto flex h-14 max-w-7xl xl:max-w-screen-2xl 2xl:max-w-[100rem] items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-semibold text-foreground hover:opacity-80" aria-label="Go Home">
            Project MC
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive: active }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    active ? "bg-accent text-foreground" : "hover:bg-accent text-muted-foreground"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {userEmail ? (
            <>
              <Select value={selectedPatientId ?? ""} onValueChange={(v) => setSelectedPatientId(v || null)}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Select patient" /></SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  {patients.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="hidden sm:inline text-sm text-muted-foreground" aria-label="Signed in email">{userEmail}</span>
              <Button variant="secondary" onClick={handleLogout} aria-label="Log out">Log out</Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => navigate('/auth')} aria-label="Log in">Log in</Button>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
