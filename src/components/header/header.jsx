import React, { useState, useEffect } from 'react';

// any of these means the visitor has started using the page
const INTERACTION_EVENTS = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];

// the header starts big, then shrinks for good on the first interaction
function useHasInteracted() {
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    if (hasInteracted) {
      return;
    }
    const markInteracted = () => setHasInteracted(true);
    INTERACTION_EVENTS.forEach(name =>
      window.addEventListener(name, markInteracted, { passive: true, once: true }));
    return () => {
      INTERACTION_EVENTS.forEach(name => window.removeEventListener(name, markInteracted));
    };
  }, [hasInteracted]);

  return hasInteracted;
}

export function Header() {
  const hasInteracted = useHasInteracted();

  return (
    <div id="header" className={hasInteracted ? 'compact' : ''}>
      <img className="strobing" src="logo.png" alt="Logo" />
    </div>
  );
}
