import { pb } from '@/lib/pocketbase';
import type { AuditLogRecord } from '@/lib/types';

export async function listAuditLogs() {
  const response = await pb.collection('audit_logs').getList<AuditLogRecord>(1, 100, {
    expand: 'actor',
    sort: '-created',
  });

  return response.items;
}
