import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_API_URL } from '@/utils/backend-api-url';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookie = request.headers.get('cookie') || '';
    const response = await fetch(`${BACKEND_API_URL}/projects/${params.id}`, {
      headers: {
        cookie,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Project API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const cookie = request.headers.get('cookie') || '';
    
    const response = await fetch(`${BACKEND_API_URL}/projects/${params.id}`, {
      method: 'PATCH',
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
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookie = request.headers.get('cookie') || '';
    
    const response = await fetch(`${BACKEND_API_URL}/projects/${params.id}`, {
      method: 'DELETE',
      headers: {
        cookie,
      },
    });

    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Project API error:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
