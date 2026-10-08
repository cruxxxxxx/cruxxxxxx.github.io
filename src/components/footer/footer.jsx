import React, { useState, useEffect, useRef } from 'react';
import { Pressable } from 'react-native';
import { useStore } from '@nanostores/react';
import { navigate } from 'astro:transitions/client';
import { $activeGroups, $filtering, $groupRequest } from '../../stores/site.js';

const isHomePage = () => window.location.pathname === '/';

export function Footer() {
  const activeGroups = useStore($activeGroups);
  const [footerOpen, setFooterOpen] = useState(true);
  const prevFooterOpen = useRef(false);
  const footerRef = useRef();

  // clicking a category selects it exclusively (like tabs) — it never deselects.
  // The homepage runs the wipe; from any other page, go home showing that group.
  const selectGroup = (group) => {
    if ($filtering.get()) {
      return;
    }
    const current = $activeGroups.get();
    const alreadySoleSelection = current.length === 1 && current[0] === group;
    if (!alreadySoleSelection) {
      $activeGroups.set([group]);
      $groupRequest.set({ groups: [group] });
    }
    if (!isHomePage()) {
      setFooterOpen(false);
      navigate('/');
    }
  };

  const toggleFooter = () => {
    setFooterOpen(prevFooterOpen => !prevFooterOpen);
  }

  // the footer persists across page changes; tuck it away after each one
  useEffect(() => {
    const closeAfterNavigation = () => setFooterOpen(false);
    document.addEventListener('astro:after-swap', closeAfterNavigation);
    return () => {
      document.removeEventListener('astro:after-swap', closeAfterNavigation);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (footerRef.current && !footerRef.current.contains(event.target) && footerOpen) {
        setFooterOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [footerOpen]);

  useEffect(() => {
    if (footerOpen === prevFooterOpen.current) {
      prevFooterOpen.current = footerOpen;
      return;
    }

    if (footerRef.current) {
      const handleFooterAnimationEnd = () => {
        const footerStyle = window.getComputedStyle(footerRef.current);
        footerRef.current.style.transform = footerStyle.transform;
        footerRef.current.style.background = footerStyle.background;
        footerRef.current.classList.remove('open');
        footerRef.current.classList.remove('close');
        footerRef.current.removeEventListener('animationend', handleFooterAnimationEnd);
      };

      footerRef.current.classList.remove('open', 'close');
      footerRef.current.classList.add(footerOpen ? 'open' : 'close');
      footerRef.current.addEventListener('animationend', handleFooterAnimationEnd);
    }

    prevFooterOpen.current = footerOpen;
  }, [footerOpen]);

  return (
    <div ref={footerRef} className="outside-footer">
      <div className="footer-arrow-container">
        <Pressable onPress={toggleFooter}>
          {/* two strokes sharing the vertex; they fan through flat into
              ^ (collapsed) or V (expanded) */}
          <svg
            className={`footer-caret ${footerOpen ? 'open' : ''}`}
            viewBox="0 0 44 26"
            aria-label="Toggle footer">
            <line className="footer-caret-line left" x1="6" y1="13" x2="22" y2="13" />
            <line className="footer-caret-line right" x1="22" y1="13" x2="38" y2="13" />
          </svg>
        </Pressable>
      </div>

      <div className="footer-line"></div>

      <div className="inside-footer">
          <div className="buttons-container">
            <div id="first-button" className="button-container">
              <button
                className={`filter-button ${activeGroups.includes('projects') ? 'active' : ''}`}
                onClick={() => selectGroup('projects')}>
                <img className="filter-button-image" src="/project1.svg" alt="projects" />
              </button>
              <br/>
              <span className="filter-button-label">projects</span>
            </div>

            <div id="third-button" className="button-container">
              <button
                className={`filter-button ${activeGroups.includes('experiments') ? 'active' : ''}`}
                onClick={() => selectGroup('experiments')}>
                <img className="filter-button-image" src="/experiment1.svg" alt="experiments" />
              </button>
              <br/>
              <span className="filter-button-label">experiments</span>
            </div>
          </div>

          <div className="footer-line"></div>


          <span>
            <a className="urls" href="/blog/">blog</a>
            {' · '}
            <a className="urls" href="mailto:contact@hypnotize.works">contact</a>
          </span>
        </div>
    </div>
  );
}
