import { applyContactCors } from '../utils/contact-security';

export default defineEventHandler((event) => {
  applyContactCors(event);
  setResponseStatus(event, 204);
  return null;
});

