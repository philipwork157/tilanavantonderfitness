import { NextResponse } from 'next/server';
import { requireAdmin } from '@/server/auth/admin';
import { handle } from '@/server/http';

export const GET = handle(async () => NextResponse.json({ user: await requireAdmin() }));
