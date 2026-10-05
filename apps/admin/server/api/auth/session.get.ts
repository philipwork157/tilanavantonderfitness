export default defineEventHandler(async event => ({ user: await requireAdmin(event) }));
