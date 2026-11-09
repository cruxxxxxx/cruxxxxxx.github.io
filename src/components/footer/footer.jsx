import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { navigate } from 'astro:transitions/client';
import { $activeGroups, $filtering, ALL_GROUPS, isSameGroups, requestGroups } from '../../stores/site.js';

const isHomePage = () => window.location.pathname === '/';

// The work button cycles what the homepage shows, in this order.
const WORK_CYCLE = [
  { label: 'all', groups: ALL_GROUPS, icon: '/experiment2.svg' },
  { label: 'projects', groups: ['projects'], icon: '/project1.svg' },
  { label: 'experiments', groups: ['experiments'], icon: '/experiment1.svg' },
];
const isBlogPath = (path) => path === '/blog' || path.startsWith('/blog/');

// the frame persists across page changes, so track the current page ourselves;
// it starts from the server's path so the server render and hydration agree
// Trying out a smaller bar with no collapse: add ?footer=compact to any URL
// (?footer=full goes back). It's remembered for the tab's session.
const FOOTER_STYLE_KEY = 'footer-style';
function useCompactFooter() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    try {
      const asked = new URLSearchParams(window.location.search).get('footer');
      if (asked === 'compact' || asked === 'full') {
        sessionStorage.setItem(FOOTER_STYLE_KEY, asked);
      }
      setCompact(sessionStorage.getItem(FOOTER_STYLE_KEY) === 'compact');
    } catch {
      // no storage: stay full
    }
  }, []);
  return compact;
}

function useCurrentPath(initialPath) {
  const [path, setPath] = useState(initialPath);
  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname);
    document.addEventListener('astro:page-load', updatePath);
    return () => {
      document.removeEventListener('astro:page-load', updatePath);
    };
  }, []);
  return path;
}

export function Footer({ initialPath }) {
  const activeGroups = useStore($activeGroups);
  const currentPath = useCurrentPath(initialPath);
  const onBlog = isBlogPath(currentPath);
  const compact = useCompactFooter();
  const workStepIndex = Math.max(0, WORK_CYCLE.findIndex((step) => isSameGroups(activeGroups, step.groups)));
  const workStep = WORK_CYCLE[workStepIndex];
  // The icon only spins in after a click, not on page load. A ref, set before
  // the store changes: useStore re-renders straight away, inside
  // requestGroups, so state set after it would miss the new icon's first render.
  const hasCycled = useRef(false);
  // open on arrival at the homepage (it's the project menu); tucked away elsewhere
  const [footerOpen, setFooterOpen] = useState(initialPath === '/');
  const prevFooterOpen = useRef(false);
  const footerRef = useRef();

  // On the homepage, each click moves to the next step (the homepage runs
  // the wipe). From any other page, the first click just goes home, showing
  // whatever was showing last.
  const cycleWork = () => {
    if (!isHomePage()) {
      setFooterOpen(false);
      navigate('/');
      return;
    }
    const nextStep = WORK_CYCLE[(workStepIndex + 1) % WORK_CYCLE.length];
    hasCycled.current = true;
    requestGroups(nextStep.groups);
  };

  const goToBlog = () => {
    setFooterOpen(false);
    if (window.location.pathname !== '/blog/') {
      navigate('/blog/');
    }
  };

  const toggleFooter = () => {
    setFooterOpen(prevFooterOpen => !prevFooterOpen);
  }

  // Off the homepage the work button goes back to "all" (without a spin), so
  // coming home, by its click or any link, always shows everything. A wipe cut
  // short by leaving mid-way mustn't block the next click either.
  useEffect(() => {
    if (currentPath === '/') {
      return;
    }
    hasCycled.current = false;
    $filtering.set(false);
    if (!isSameGroups($activeGroups.get(), ALL_GROUPS)) {
      $activeGroups.set(ALL_GROUPS);
    }
  }, [currentPath]);

  // fetch and decode every cycle icon up front, so the first click's icon
  // spins in already drawn instead of popping in mid-animation
  useEffect(() => {
    for (const step of WORK_CYCLE) {
      const icon = new Image();
      icon.src = step.icon;
      icon.decode().catch(() => {});
    }
  }, []);

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
    <div ref={footerRef} className={`outside-footer${compact ? ' compact' : ''}`}>
      <div className="footer-arrow-container">
        {/* a plain button, not react-native's Pressable: the footer renders
            on the server, and react-native-web can't run there in dev */}
        <button type="button" className="footer-caret-button" onClick={toggleFooter}>
          {/* two strokes sharing the vertex; they fan through flat into
              ^ (collapsed) or V (expanded) */}
          <svg
            className={`footer-caret ${footerOpen ? 'open' : ''}`}
            viewBox="0 0 44 26"
            aria-label="Toggle footer">
            <line className="footer-caret-line left" x1="6" y1="13" x2="22" y2="13" />
            <line className="footer-caret-line right" x1="22" y1="13" x2="38" y2="13" />
          </svg>
        </button>
      </div>

      <div className="footer-line"></div>

      <div className="inside-footer">
          <div className="buttons-container">
            <div id="first-button" className="button-container">
              <button
                className={`filter-button ${onBlog ? '' : 'active'}`}
                onClick={cycleWork}
                aria-label={`showing ${workStep.label}; click for ${WORK_CYCLE[(workStepIndex + 1) % WORK_CYCLE.length].label}`}>
                <img
                  key={workStep.label}
                  className={`filter-button-image${hasCycled.current ? ' cycled-in' : ''}`}
                  src={workStep.icon}
                  alt="" />
              </button>
              <br/>
              {/* every step's label shares one cell, so the widest ("experiments")
                  sets the width and the row doesn't shift as it cycles */}
              <span className="filter-button-label label-stack">
                {WORK_CYCLE.map((step) => (
                  <span key={step.label} className={step === workStep ? '' : 'label-spacer'} aria-hidden={step !== workStep}>
                    {step.label}
                  </span>
                ))}
              </span>
              {/* which step of the cycle this is */}
              <span className="cycle-dots" aria-hidden="true">
                {WORK_CYCLE.map((step, index) => (
                  <span key={step.label} className={`cycle-dot${index === workStepIndex ? ' current' : ''}`}></span>
                ))}
              </span>
            </div>

            <div className="button-container">
              <button
                className={`filter-button ${onBlog ? 'active' : ''}`}
                onClick={goToBlog}>
                <img className="filter-button-image inverted" src="/project2.svg" alt="blog" />
              </button>
              <br/>
              <span className="filter-button-label">blog</span>
            </div>
          </div>

          <div className="footer-line"></div>


          <span>
            <a className="urls" href="/about/">about</a>
            {' · '}
            <a className="urls" href="mailto:contact@hypnotize.works">contact</a>
          </span>
        </div>
    </div>
  );
}
