import React, { useState, useEffect, useRef } from 'react';
import { scrollToTop } from '../../util.js';
import { ProjectStates } from '../project/projectStatesHandler.js';
import { Pressable } from 'react-native';

const wipeScreen = (projectMask) => {
    projectMask.style.backgroundPositionY = '-100vh';
    projectMask.style.display = 'block';
    projectMask.classList.remove('wipe');
    projectMask.classList.add('wipe');
}

const closeAll = (setActiveIndex, setProjectStates) => {
    setActiveIndex(null);
    setProjectStates((prev) => prev.map((state, i) => ProjectStates.CLOSED));
  }

// group toggles are boolean: show every project whose group is active, sorted
// newest-first so projects and experiments interweave by year.
function filterProjectData(projectData, activeGroups) {
	return projectData
		.filter(project => activeGroups.includes(project.group))
		.sort((a, b) => Number(b.year) - Number(a.year));
}

export function Footer({ projectData, setActiveIndex, setProjectStates, projectMaskRef, onFilterChange }) {
  const [filtering, setFiltering] = useState(false);
  // activeGroups drives the button look (updated instantly on click); appliedGroups
  // drives the grid (updated under the wipe) so the button feels responsive.
  const [activeGroups, setActiveGroups] = useState(['projects', 'experiments']);
  const [appliedGroups, setAppliedGroups] = useState(['projects', 'experiments']);
  const [footerOpen, setFooterOpen] = useState(true);
  const prevFooterOpen = useRef(false);
  const footerRef = useRef();

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  useEffect(() => {
    onFilterChange(filterProjectData(projectData, appliedGroups));
  }, [appliedGroups, projectData, onFilterChange]);

  // clicking a category selects it exclusively (like tabs) — it never deselects.
  const selectGroup = async (group) => {
    if (filtering) return;
    if (activeGroups.length === 1 && activeGroups[0] === group) return; // already sole selection

    const next = [group];

    setActiveGroups(next);        // instant button feedback
    setFiltering(true);
    closeAll(setActiveIndex, setProjectStates);
    scrollToTop();

    await delay(250);
    wipeScreen(projectMaskRef.current);

    await delay(150);
    setAppliedGroups(next);       // grid swaps under the wipe

    await delay(900);
    projectMaskRef.current.style.display = 'none';
    setFiltering(false);
    scrollToTop();
  };

  const toggleFooter = () => {
    setFooterOpen(prevFooterOpen => !prevFooterOpen);
  }

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
                <img className="filter-button-image" src="project1.svg" alt="projects" />
              </button>
              <br/>
              <span className="filter-button-label">projects</span>
            </div>

            <div id="third-button" className="button-container">
              <button
                className={`filter-button ${activeGroups.includes('experiments') ? 'active' : ''}`}
                onClick={() => selectGroup('experiments')}>
                <img className="filter-button-image" src="experiment1.svg" alt="experiments" />
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
