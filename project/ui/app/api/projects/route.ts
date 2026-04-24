import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_API_URL } from '@/utils/backend-api-url';

export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get('cookie') || '';
    const response = await fetch(`${BACKEND_API_URL}/projects`, {
      headers: {
        cookie,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Project API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const cookie = request.headers.get('cookie') || '';
    
    const response = await fetch(`${BACKEND_API_URL}/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Project API error:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
