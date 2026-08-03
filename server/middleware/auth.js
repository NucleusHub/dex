// Thin re-export of the shared @core server auth (core/server/auth.js), reached
// via the `../core:/app/core:ro` container mount. Kept as a stable local path so
// this app's route imports (`../middleware/auth.js`) stay unchanged if the
// shared implementation moves.
export { requireAuth, verifyToken, verifyProfile } from '../core/server/auth.js'

// Admin-only gate, layered on top of requireAuth (which has already populated
// req.profile by the time any sub-router runs).
export function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') return res.status(403).json({ error: 'Admin required' })
  next()
}
