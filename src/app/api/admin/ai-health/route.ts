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
    const activeHealth = await activeProvider.getHealth();
    const fallbackEnabled =
      process.env.AI_ENABLE_FALLBACK === 'true' ||
      !process.env.NODE_ENV ||
      process.env.NODE_ENV !== 'production';

    return NextResponse.json({
      provider: activeProvider.getProviderName(),
      model: activeProvider.getModelName(),
      configured: activeProvider.isConfigured(),
      healthy: activeHealth.available,
      lastCheck: new Date().toISOString(),
      latencyMs: activeHealth.latencyMs || 0,
      fallbackEnabled,
      fallbackChain: AIProviderFactory.getFallbackChain().map((p) => ({
        provider: p.getProviderName(),
        model: p.getModelName(),
        configured: p.isConfigured(),
      })),
    });
  } catch (error: any) {
    console.error('[API admin/ai-health GET] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check AI provider health' },
      { status: 500 }
    );
  }
}
