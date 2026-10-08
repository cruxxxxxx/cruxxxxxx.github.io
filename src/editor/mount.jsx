import React from 'react';
import { createRoot } from 'react-dom/client';
import ProjectEditor from './ProjectEditor.jsx';

/**
 * Injected by ./integration.mjs into every page, in `astro dev` only, so the
 * editor never reaches a production bundle. Lives outside the swapped page
 * content: re-attached after each client-side navigation, and only offered on
 * the homepage, where the project cards are.
 */
export function mountProjectEditor() {
  const host = document.createElement('div');
  host.id = 'project-editor-root';
  const root = createRoot(host);

  const attach = () => {
    const onHomepage = window.location.pathname === '/';
    if (onHomepage && !host.isConnected) {
      document.body.append(host);
      root.render(<ProjectEditor />);
    } else if (!onHomepage && host.isConnected) {
      root.render(null);
      host.remove();
    }
  };

  attach();
  document.addEventListener('astro:after-swap', () => {
    host.remove();
    attach();
  });
}
