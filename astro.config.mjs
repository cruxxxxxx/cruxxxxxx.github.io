import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://hypnotize.works',
  integrations: [react()],
  vite: {
    resolve: {
      // CRA aliased this implicitly; the project cards, footer caret and close
      // mark use react-native's Pressable for unified hover/press/touch.
      alias: { 'react-native': 'react-native-web' },
    },
  },
});
