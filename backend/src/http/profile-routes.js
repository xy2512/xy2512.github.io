import { Router } from 'express';
import { asyncRoute } from './errors.js';
import { serializeUser } from './serializers.js';
import { optionalText, requiredText } from './validation.js';

export function profileRoutes(database) {
  const router = Router();

  router.patch('/', asyncRoute(async (request, response) => {
    const displayName = requiredText(request.body.displayName, '昵称', 2, 30);
    const city = optionalText(request.body.city, 40);
    const bio = optionalText(request.body.bio, 500);
    const result = await database.query(
      `UPDATE users SET display_name = $1, city = $2, bio = $3
       WHERE id = $4
       RETURNING id, account, display_name, city, bio, avatar_url, created_at`,
      [displayName, city, bio, request.user.id]
    );
    response.json({ user: serializeUser(result.rows[0]) });
  }));

  return router;
}
