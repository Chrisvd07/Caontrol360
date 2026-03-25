import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // 👈 IMPORTANTE

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      console.error('[ocr] OPENAI_API_KEY not set');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const body = await req.json();

    // Validación básica
    if (!body.prompt) {
      return NextResponse.json(
        { error: 'Missing prompt' },
        { status: 400 }
      );
    }

    // 👇 AQUÍ SE HACE EL OCR / PROCESAMIENTO
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini', // rápido y barato
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: body.prompt,
              },
              // 👇 OPCIONAL: imagen para OCR real
              ...(body.image
                ? [
                    {
                      type: 'input_image',
                      image_url: body.image,
                    },
                  ]
                : []),
            ],
          },
        ],
        max_output_tokens: 1000,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ocr] OpenAI error:', data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json({
      result: data.output?.[0]?.content?.[0]?.text || '',
      raw: data,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ocr] Error:', message);

    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 }
    );
  }
}