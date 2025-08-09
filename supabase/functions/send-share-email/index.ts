import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  toEmail: string;
  subject: string;
  links: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { toEmail, subject, links }: Payload = await req.json();

    const html = `
      <div>
        <p>You have been sent ${links.length} item(s) via Project MC.</p>
        <ul>
          ${links.map((l) => `<li><a href="${l}">${l}</a></li>`).join("")}
        </ul>
        <p>Links expire in 7 days.</p>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: "Project MC <onboarding@resend.dev>",
      to: [toEmail],
      subject,
      html,
    });

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("send-share-email error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
