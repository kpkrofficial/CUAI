import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/auth/session';
import { AIProviderFactory } from '@/lib/ai/providers';

export async function GET() {
  try {
    const context = await getAuthContext(['superadmin', 'campus_admin']);
    if (!context) {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const activeProvider = AIProviderFactory.getActiveProvider();
    const health = await AIProviderFactory.checkAllHealth();

    return NextResponse.json({
      activeProvider: activeProvider.getProviderName(),
      activeModel: activeProvider.getModelName(),
      fallbackChain: AIProviderFactory.getFallbackChain().map(p => ({
        provider: p.getProviderName(),
        model: p.getModelName(),
        configured: p.isConfigured(),
      })),
      providers: health,
    });
  } catch (error: any) {
    console.error('[API admin/ai-health GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check AI provider health' },
      { status: 500 }
    );
  }
}
