import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // ── 1. API Key ──────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('[ocr] OPENAI_API_KEY not set');
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // ── 2. Parsear body ─────────────────────────────────────────
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      console.error('[ocr] content-type inesperado:', contentType);
      return NextResponse.json(
        { error: 'Content-Type debe ser application/json', received: contentType },
        { status: 415 }
      );
    }

    let body: {
      model?: string;
      messages?: unknown[];
      max_tokens?: number;
      response_format?: unknown;
    };

    try {
      body = await req.json();
    } catch (e) {
      console.error('[ocr] JSON inválido:', e);
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
    }

    // ── 3. Validación ───────────────────────────────────────────
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      console.error('[ocr] messages ausente. Keys recibidas:', Object.keys(body));
      return NextResponse.json({ error: 'Missing messages' }, { status: 400 });
    }

    // ── 4. Proxy a /v1/chat/completions ────────────────────────
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model:           body.model           ?? 'gpt-4o',
        messages:        body.messages,
        max_tokens:      body.max_tokens      ?? 1200,
        response_format: body.response_format ?? { type: 'json_object' },
      }),
    });

    const data = await openAIResponse.json();

    // ── 5. Manejar error de OpenAI ──────────────────────────────
    if (!openAIResponse.ok) {
      console.error('[ocr] OpenAI error:', JSON.stringify(data.error ?? data, null, 2));
      return NextResponse.json(
        {
          error:  data.error?.message ?? 'OpenAI error',
          code:   data.error?.code,
          detail: data,
        },
        { status: openAIResponse.status }
      );
    }

    // ── 6. Devolver respuesta tal cual al cliente ───────────────
    // El cliente en ocr-ai.ts ya parsea json.choices[0].message.content
    return NextResponse.json(data);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ocr] Unhandled error:', message);
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 });
  }
}