import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { useNavigate, Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = mode === "signin" ? "Sign in | Project-MC Drive" : "Sign up | Project-MC Drive";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Sign in or create an account to upload and share files.");
  }, [mode]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) navigate("/", { replace: true });
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) navigate("/", { replace: true });
    });
    return () => listener.subscription.unsubscribe();
  }, [navigate]);

  const handleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast({ title: "Signed in", description: "Welcome back!" });
      navigate("/", { replace: true });
    } catch (e: any) {
      toast({ title: "Sign in failed", description: e.message || "Please check your credentials." });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) throw error;
      toast({ title: "Check your email", description: "Confirm your email to finish sign up." });
    } catch (e: any) {
      toast({ title: "Sign up failed", description: e.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto flex min-h-[calc(100vh-56px)] max-w-md items-center justify-center px-4">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-center">
              {mode === "signin" ? "Sign in to Project-MC Drive" : "Create your Project-MC Drive account"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm text-muted-foreground" htmlFor="email">Email</label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="grid gap-2">
                <label className="text-sm text-muted-foreground" htmlFor="password">Password</label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>

              {mode === "signin" ? (
                <Button onClick={handleSignIn} disabled={loading}>{loading ? "Signing in..." : "Sign in"}</Button>
              ) : (
                <Button onClick={handleSignUp} disabled={loading}>{loading ? "Signing up..." : "Create account"}</Button>
              )}

              <p className="text-center text-sm text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    Don't have an account? {" "}
                    <button className="underline" onClick={() => setMode("signup")}>Sign up</button>
                  </>
                ) : (
                  <>
                    Already have an account? {" "}
                    <button className="underline" onClick={() => setMode("signin")}>Sign in</button>
                  </>
                )}
              </p>
              <p className="text-center text-xs text-muted-foreground">
                <Link to="/">Back to app</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Auth;
