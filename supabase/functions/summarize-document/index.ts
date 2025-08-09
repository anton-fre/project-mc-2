// Gemini-powered summarization edge function
// CORS enabled and public (verify_jwt = false in config)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  text?: string;
  fileName?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { text, fileName } = (await req.json()) as RequestBody;

    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `Summarize the following ${fileName ? `document named \"${fileName}\"` : 'document'} in English.
- Provide 5-8 concise bullet points
- Include a one-sentence TL;DR
- List key entities, dates, and numbers
- Add action items if any
Be faithful to the source text and avoid speculation.`;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { text },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 512,
      },
    };

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );

    if (!resp.ok) {
      const errText = await resp.text();
      return new Response(
        JSON.stringify({ error: 'Gemini API error', details: errText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const result = await resp.json();
    let summary = '';
    try {
      const candidates = result.candidates || [];
      const parts = candidates[0]?.content?.parts || [];
      const texts = parts.map((p: any) => p.text).filter(Boolean);
      summary = texts.join('\n').trim();
    } catch (_) {
      summary = '';
    }
    if (!summary) summary = 'No summary generated.';

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});