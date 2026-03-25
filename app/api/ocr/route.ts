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

    // ── 2. Parsear body con diagnóstico ─────────────────────────
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      console.error('[ocr] content-type inesperado:', contentType);
      return NextResponse.json(
        { error: 'Content-Type debe ser application/json', received: contentType },
        { status: 415 }
      );
    }

    let body: { prompt?: string; image?: string };
    try {
      body = await req.json();
    } catch (e) {
      console.error('[ocr] JSON inválido:', e);
      return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
    }

    // ── 3. Validaciones ─────────────────────────────────────────
    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim() === '') {
      console.error('[ocr] prompt ausente o vacío. Keys recibidas:', Object.keys(body));
      return NextResponse.json({ error: 'Missing or empty prompt' }, { status: 400 });
    }

    if (!body.image || typeof body.image !== 'string') {
      console.error('[ocr] image ausente. Keys recibidas:', Object.keys(body));
      return NextResponse.json({ error: 'Missing image' }, { status: 400 });
    }

    // ── 4. Normalizar imagen ────────────────────────────────────
    // Acepta: string base64 puro, data URI, o URL https://
    let imageUrl: string | { url: string };

    if (body.image.startsWith('data:')) {
      // data:image/jpeg;base64,xxxx  → válido directo
      imageUrl = body.image;
    } else if (body.image.startsWith('http')) {
      // URL externa → debe ir como objeto { url }
      imageUrl = { url: body.image };
    } else {
      // base64 puro sin prefijo → agregar prefijo JPEG por defecto
      imageUrl = `data:image/jpeg;base64,${body.image}`;
    }

    // ── 5. Llamada a OpenAI Responses API ───────────────────────
    const openAIResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: body.prompt.trim(),
              },
              {
                type: 'input_image',
                image_url: imageUrl,
              },
            ],
          },
        ],
        max_output_tokens: 1000,
      }),
    });

    const data = await openAIResponse.json();

    // ── 6. Manejar error de OpenAI ──────────────────────────────
    if (!openAIResponse.ok) {
      console.error('[ocr] OpenAI error:', JSON.stringify(data.error ?? data, null, 2));
      return NextResponse.json(
        {
          error: data.error?.message ?? 'OpenAI error',
          code: data.error?.code,
          detail: data,
        },
        { status: openAIResponse.status }
      );
    }

    // ── 7. Respuesta exitosa ────────────────────────────────────
    const result = data.output?.[0]?.content?.[0]?.text ?? '';
    return NextResponse.json({ result, raw: data });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ocr] Unhandled error:', message);
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 });
  }
}