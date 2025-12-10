import { adminOnly, authed, os } from '~/orpc/base'
import * as comment from './procedures/comment'
import * as download from './procedures/download'
import * as media from './procedures/media'
import * as subtitle from './procedures/subtitle'
import * as proxy from './procedures/proxy'
import * as channel from './procedures/channel'
import * as task from './procedures/task'
import * as auth from './procedures/auth'
import * as points from './procedures/points'
import * as admin from './procedures/admin'

// Public vs authenticated sub-routers:
// - auth: signup/login/logout/me 等接口需要在未登录状态也可访问
// - 其他业务模块统一挂在 authed 上，通过中间件做登录校验
export const appRouter = os.router({
	auth,

	media: authed.router(media),
	download: authed.router(download),
	comment: authed.router(comment),
	subtitle: authed.router(subtitle),
	channel: authed.router(channel),
	task: authed.router(task),
	points: authed.router(points),
	proxy: authed.router(proxy),
	admin: adminOnly.router(admin),
})

export type AppRouter = typeof appRouter
