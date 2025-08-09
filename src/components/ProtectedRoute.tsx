import { ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Props { children: ReactNode }

const ProtectedRoute = ({ children }: Props) => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) navigate("/auth", { replace: true });
      else setReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.user) navigate("/auth", { replace: true });
      else setReady(true);
    });

    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  if (!ready) return null;
  return <>{children}</>;
};

export default ProtectedRoute;
