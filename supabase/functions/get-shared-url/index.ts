import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BodySingle { path: string }
interface BodyMany { paths: string[] }

type Body = BodySingle | BodyMany

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json() as Body;

    const handleOne = async (path: string) => {
      // Validate the requester is recipient (or owner) of this share via RLS-protected SELECT
      const { data: rows, error: selErr } = await supabase
        .from('shares')
        .select('id, owner_user_id, target_email')
        .eq('path', path)
        .limit(1);
      if (selErr) throw selErr;
      if (!rows || rows.length === 0) {
        return { path, error: "Not allowed or not shared with you" };
      }

      const { data, error } = await admin.storage.from('drive').createSignedUrl(path, 60 * 60 * 24 * 7);
      if (error) return { path, error: error.message };
      return { path, url: data?.signedUrl };
    };

    if (Array.isArray((body as BodyMany).paths)) {
      const results = await Promise.all((body as BodyMany).paths.map((p) => handleOne(p)));
      return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (typeof (body as BodySingle).path !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing path' }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await handleOne((body as BodySingle).path);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error('get-shared-url error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
