// app/api/debug/route.ts
// ✅ Debug endpoint to verify environment setup

import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    hasOpenAIKey: !!apiKey,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : 'NOT SET',
    apiKeyType: apiKey?.startsWith('sk-proj-') ? 'Project Key (Newer)' : apiKey?.startsWith('sk-') ? 'User Key (Older)' : 'Unknown',
    apiKeyLength: apiKey?.length ?? 0,
    nextVersion: process.versions?.node,
    status: apiKey ? '✅ Ready' : '❌ Missing Configuration',
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    }
  });
}