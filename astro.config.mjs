import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import imgAttrs from './src/blog/lib/img-attrs-plugin.mjs';

export default defineConfig({
  site: 'https://hypnotize.works',
  integrations: [react(), sitemap()],
  // blog posts: Obsidian-style media sizes and video links (see the plugin)
  markdown: {
    shikiConfig: { theme: 'github-dark', wrap: true },
    processor: satteri({ hastPlugins: [imgAttrs] }),
  },
  // No `image.remotePatterns` on purpose: blog photos are already web-sized
  // on R2, and allowlisting the host would make every build download them.
  vite: {
    resolve: {
      // CRA aliased this implicitly; the project cards, footer caret and close
      // mark use react-native's Pressable for unified hover/press/touch.
      alias: { 'react-native': 'react-native-web' },
    },
  },
});
