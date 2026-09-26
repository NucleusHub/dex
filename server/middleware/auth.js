export { requireAuth, verifyToken, verifyProfile } from '../core/server/auth.js'

export function requireAdmin(req, res, next) {
  if (req.profile?.role !== 'admin') return res.status(403).json({ error: 'Admin required' })
  next()
}
