/** Blog URLs live under /blog on the one site; join a blog-relative path onto it. */
export function href(path = '/'): string {
  return `/blog/${path.replace(/^\//, '')}`.replace(/\/{2,}/g, '/');
}
