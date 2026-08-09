import { Router } from 'express';
import { asyncRoute, HttpError } from './errors.js';
import { requireAuth } from './middleware.js';
import { requiredText } from './validation.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value) {
  if (!uuidPattern.test(value || '')) throw new HttpError(404, '记录不存在', 'NOT_FOUND');
}

function serializeConversation(row) {
  return {
    id: row.id,
    skill: row.skill_id ? { id: row.skill_id, title: row.skill_title, status: row.skill_status } : null,
    otherUser: {
      id: row.other_user_id,
      displayName: row.other_display_name,
      city: row.other_city,
      avatarUrl: row.other_avatar_url
    },
    lastMessage: row.last_message_id ? {
      id: row.last_message_id,
      senderId: row.last_message_sender_id,
      body: row.last_message_body,
      createdAt: row.last_message_created_at
    } : null,
    unreadCount: Number(row.unread_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const conversationSelect = `
  SELECT c.id, c.skill_id, c.created_at, c.updated_at,
         s.title AS skill_title, s.status AS skill_status,
         other.id AS other_user_id, other.display_name AS other_display_name,
         other.city AS other_city, other.avatar_url AS other_avatar_url,
         latest.id AS last_message_id, latest.sender_id AS last_message_sender_id,
         latest.body AS last_message_body, latest.created_at AS last_message_created_at,
         (SELECT COUNT(*) FROM messages unread
          WHERE unread.conversation_id = c.id
            AND unread.sender_id <> $1
            AND unread.created_at > COALESCE(read_state.last_read_at, TIMESTAMPTZ '1970-01-01')) AS unread_count
  FROM conversations c
  LEFT JOIN skills s ON s.id = c.skill_id
  JOIN users other ON other.id = CASE WHEN c.learner_id = $1 THEN c.teacher_id ELSE c.learner_id END
  LEFT JOIN conversation_reads read_state ON read_state.conversation_id = c.id AND read_state.user_id = $1
  LEFT JOIN LATERAL (
    SELECT m.id, m.sender_id, m.body, m.created_at
    FROM messages m WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC LIMIT 1
  ) latest ON TRUE
`;

export function messageRoutes(database, realtimeHub) {
  const router = Router();
  router.use(requireAuth);

  router.get('/', asyncRoute(async (request, response) => {
    const result = await database.query(
      `${conversationSelect}
       WHERE c.learner_id = $1 OR c.teacher_id = $1
       ORDER BY COALESCE(latest.created_at, c.created_at) DESC`,
      [request.user.id]
    );
    response.json({ conversations: result.rows.map(serializeConversation) });
  }));

  router.post('/', asyncRoute(async (request, response) => {
    const skillId = String(request.body.skillId || '');
    assertUuid(skillId);
    const skillResult = await database.query(
      `SELECT id, owner_id FROM skills WHERE id = $1 AND status = 'published'`,
      [skillId]
    );
    const skill = skillResult.rows[0];
    if (!skill) throw new HttpError(404, '技能不存在', 'SKILL_NOT_FOUND');
    if (skill.owner_id === request.user.id) throw new HttpError(400, '不能联系自己发布的技能', 'SELF_CONVERSATION');

    const result = await database.query(
      `INSERT INTO conversations (skill_id, learner_id, teacher_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (skill_id, learner_id, teacher_id) WHERE skill_id IS NOT NULL
       DO UPDATE SET updated_at = conversations.updated_at
       RETURNING id`,
      [skill.id, request.user.id, skill.owner_id]
    );
    const conversation = await database.query(
      `${conversationSelect} WHERE c.id = $2`,
      [request.user.id, result.rows[0].id]
    );
    await realtimeHub.publish({
      type: 'conversation.updated',
      userIds: [request.user.id, skill.owner_id],
      conversationId: result.rows[0].id
    });
    response.json({ conversation: serializeConversation(conversation.rows[0]) });
  }));

  router.get('/:id/messages', asyncRoute(async (request, response) => {
    assertUuid(request.params.id);
    const conversationResult = await database.query(
      `${conversationSelect}
       WHERE c.id = $2 AND (c.learner_id = $1 OR c.teacher_id = $1)`,
      [request.user.id, request.params.id]
    );
    if (!conversationResult.rows[0]) throw new HttpError(404, '会话不存在', 'CONVERSATION_NOT_FOUND');
    const messagesResult = await database.query(
      `SELECT id, conversation_id, sender_id, body, created_at
       FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 200`,
      [request.params.id]
    );
    await database.query(
      `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
      [request.params.id, request.user.id]
    );
    response.json({
      conversation: serializeConversation(conversationResult.rows[0]),
      messages: messagesResult.rows.map((message) => ({
        id: message.id,
        conversationId: message.conversation_id,
        senderId: message.sender_id,
        body: message.body,
        createdAt: message.created_at
      }))
    });
  }));

  router.post('/:id/messages', asyncRoute(async (request, response) => {
    assertUuid(request.params.id);
    const body = requiredText(request.body.body, '消息', 1, 1000);
    const participantResult = await database.query(
      `SELECT learner_id, teacher_id FROM conversations
       WHERE id = $1 AND (learner_id = $2 OR teacher_id = $2)`,
      [request.params.id, request.user.id]
    );
    const participants = participantResult.rows[0];
    if (!participants) throw new HttpError(404, '会话不存在', 'CONVERSATION_NOT_FOUND');
    const result = await database.transaction(async (transaction) => {
      const inserted = await transaction.query(
        `INSERT INTO messages (conversation_id, sender_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, conversation_id, sender_id, body, created_at`,
        [request.params.id, request.user.id, body]
      );
      await transaction.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [request.params.id]);
      await transaction.query(
        `INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = NOW()`,
        [request.params.id, request.user.id]
      );
      return inserted.rows[0];
    });
    const message = {
      id: result.id,
      conversationId: result.conversation_id,
      senderId: result.sender_id,
      body: result.body,
      createdAt: result.created_at
    };
    await realtimeHub.publish({
      type: 'message.created',
      userIds: [participants.learner_id, participants.teacher_id],
      conversationId: request.params.id,
      message
    });
    response.status(201).json({ message });
  }));

  return router;
}
