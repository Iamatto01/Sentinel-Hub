import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({
    reply: 'Frieren persona has been retired. Please use Hermes Agent AI at /hermes for autonomous technical assistance and fleet commands.',
    model: 'hermes-3-llama-3.1-8b',
  });
}
