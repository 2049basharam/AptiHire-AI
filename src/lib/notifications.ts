import { db, notifications } from '@/db';
import { logger } from './logger';

export async function createNotificationForOrgRecruiters({
  organizationId,
  actorUserId,
  title,
  message,
  type,
  entityId,
  entityType,
}: {
  organizationId: string;
  actorUserId: string;
  title: string;
  message: string;
  type: string;
  entityId?: string;
  entityType?: string;
}) {
  try {
    // Find all active members of the organization except the actor themselves
    const orgMembers = await db.query.memberships.findMany({
      where: (table, { eq, and, ne }) => and(eq(table.organizationId, organizationId), ne(table.userId, actorUserId)),
    });

    if (orgMembers.length === 0) return;

    const notifValues = orgMembers.map((m) => ({
      organizationId,
      recipientUserId: m.userId,
      title,
      message,
      type,
      entityId: entityId || null,
      entityType: entityType || null,
    }));

    await db.insert(notifications).values(notifValues);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn('Failed to create in-app notification', undefined, { error: errMsg });
  }
}
