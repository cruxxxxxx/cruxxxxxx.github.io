import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { satteri } from '@astrojs/markdown-satteri';
import imgAttrs from './src/blog/lib/img-attrs-plugin.mjs';
import projectEditor, { mediaVariantsCheck } from './src/editor/integration.mjs';

export default defineConfig({
  site: 'https://hypnotize.works',
  // projectEditor only hooks into `astro dev`; the deployed site never has it
  integrations: [react(), sitemap(), projectEditor(), mediaVariantsCheck()],
  // the dev toolbar sits right on top of the footer's caret
  devToolbar: { enabled: false },
  // blog posts: Obsidian-style media sizes and video links (see the plugin)
  markdown: {
    shikiConfig: { theme: 'github-dark', wrap: true },
    processor: satteri({ hastPlugins: [imgAttrs] }),
  },
  // No `image.remotePatterns` on purpose: blog photos are already web-sized
  // on R2, and allowlisting the host would make every build download them.
  vite: {
    // A build sharing the dev server's dependency cache rewrites it under the
    // running server, whose page then asks for chunks that are gone (e.g. the
    // video player fails to load). Builds get a cache of their own.
    cacheDir: process.argv.includes('build') ? 'node_modules/.vite-build' : 'node_modules/.vite',
    resolve: {
      // CRA aliased this implicitly; the project cards, footer caret and close
      // mark use react-native's Pressable for unified hover/press/touch.
      alias: { 'react-native': 'react-native-web' },
    },
  },
});
