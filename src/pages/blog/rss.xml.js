import rss from '@astrojs/rss';
import { previewImageFor } from '../../blog/lib/media.mjs';
import { getPublishedPosts, postLabel } from '../../blog/lib/posts';
import { SITE_TITLE, SITE_DESCRIPTION } from '../../blog/site';
import { href } from '../../blog/lib/url';

export async function GET(context) {
  const posts = await getPublishedPosts();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: posts.map((post) => ({
      title: postLabel(post),
      description: post.data.description ?? '',
      pubDate: post.data.pubDate,
      categories: post.data.tags,
      link: href(`/${post.id}`),
      ...(post.data.cover && {
        enclosure: {
          url: previewImageFor(post.data.cover),
          type: 'image/webp',
          length: 0,
        },
      }),
    })),
  });
}
