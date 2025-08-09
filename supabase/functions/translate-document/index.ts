// Translate a document's text to English using Gemini
// CORS enabled for web calls

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  text?: string;
  fileName?: string;
  targetLang?: string; // default: en
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = (await req.json()) as RequestBody;
    const text = body.text?.toString().trim();
    const targetLang = (body.targetLang || 'en').toLowerCase();
    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing GEMINI_API_KEY' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const prompt = `You are a professional medical translator. Translate the following content to ${targetLang === 'en' ? 'English' : targetLang}.\n\n- Preserve structure and headings when possible.\n- Keep numbers, units, and medication names accurate.\n- Do not add commentary.\n\nContent to translate:\n\n"""\n${text}\n"""`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Gemini error', res.status, errText);
      return new Response(JSON.stringify({ error: 'Translation API error', detail: errText }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const data = await res.json();
    const translatedText = data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).join('') || '';

    return new Response(JSON.stringify({ translatedText }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('translate-document failed', e);
    return new Response(JSON.stringify({ error: 'Internal error', detail: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});