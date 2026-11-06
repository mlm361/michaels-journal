import { deletedPostResponse } from '../_shared/deleted-post.js';

export function onRequest() {
  return deletedPostResponse();
}
