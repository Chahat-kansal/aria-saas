import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditAction =
  | 'visa_client.viewed'
  | 'visa_client.created'
  | 'visa_client.updated'
  | 'visa_client.deleted'
  | 'visa_document.uploaded'
  | 'visa_document.downloaded'
  | 'visa_document.deleted'
  | 'business.switched'
  | 'auth.login'
  | 'auth.logout'
  | 'data.exported'
  | 'data.deletion_requested';

interface AuditEventParams {
  businessId: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string;
  request?: Request;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(
  supabase: SupabaseClient,
  params: AuditEventParams
): Promise<void> {
  const { businessId, userId, action, resourceType, resourceId, request, metadata } = params;

  const ipAddress = request
    ? (request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
       request.headers.get('x-real-ip') ??
       null)
    : null;

  const userAgent = request ? request.headers.get('user-agent') : null;

  try {
    await supabase.from('audit_logs').insert({
      business_id: businessId,
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId ?? null,
      ip_address: ipAddress,
      user_agent: userAgent,
      metadata: metadata ?? {},
    });
  } catch {
    // Audit logging must never crash the main operation
  }
}