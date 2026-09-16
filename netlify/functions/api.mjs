import { handleRequest } from '../../server/api.mjs';

export default (request, context) => {
  // This entry point must never fall back to an ephemeral local database, even
  // when the host does not expose its usual NETLIFY environment flag.
  process.env.NETLIFY = 'true';
  return handleRequest(request, { ip: context.ip });
};
export const config = { path: '/api/*' };
