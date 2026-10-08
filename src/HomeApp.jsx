import React, { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';
import './components/project/project.css';
import './components/slideshow/slideshow.css';
import './components/openmark/openmark.css';
import './svg.css';
import './components/footer/footer.css';

import SiteData from './data/sitedata.json';
import Experiments from './data/experiments.json';

import { ProjectStates } from './components/project/projectStatesHandler.js';
import { Project } from './components/project/project.jsx';
import { Header } from './components/header/header.jsx';
import { Footer } from './components/footer/footer.jsx';
import { Pressable } from 'react-native';
import LoadingBar from 'react-top-loading-bar'
import WebGLCanvas from './components/moire/moire.jsx';

import { useProjectState, useLoadingState } from './hooks/index_hooks.js';
import { usePressableCallbacks } from './hooks/project_pressable_hooks.js';

import { 
getAnimationStartTime, 
calculatePercentageLoaded,
mapProjectStates,
getIsThis } from './homepage_utils.js';

const projectData = [...SiteData['projects'], ...Experiments['projects']];
// Default view mixes both groups, sorted newest-first so projects and
// experiments interweave by year.
const byYearDesc = (a, b) => Number(b.year) - Number(a.year);
const allProjectsSorted = [...projectData].sort(byYearDesc);
const texture1 = 'tex1_med.png';
const texture2 = 'tex2_low.png';

// Deep-linking: the open project is reflected in the URL hash (e.g. #db) and a
// matching hash on load opens that project.
const slugify = (name) =>
  name.toLowerCase().replace(/["']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const setProjectHash = (project) => {
  const base = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, '', project ? `${base}#${slugify(project.name)}` : base);
};

function App() {
  const { projectStates, setProjectStates, setActiveIndex, resetActiveIndex, isActive, isNotActive } = useProjectState(projectData);
  const { loaded, setLoaded, progress, setProgress, startAnimation, setStartAnimation } = useLoadingState(projectData);
  const [filteredProjects, setFilteredProjects] = useState(allProjectsSorted);
  // the initial loading bar / mask only gates the first paint; filter changes
  // afterward must not re-trigger it.
  const [firstLoadComplete, setFirstLoadComplete] = useState(false);

  const [hovering, setHovering] = useState(false);

  const columnRef = useRef();
  const touchStartRef = useRef(null);
  const projectMaskRef = useRef();

  useEffect(() => {
    setProjectStates(projectData.map(() => ProjectStates.CLOSED));
  }, [setProjectStates]);

  const onMediaLoaded = useCallback((index) => {
    setLoaded(prevLoaded => {
      const newLoaded = [...prevLoaded];
      newLoaded[index] = true;
      return newLoaded;
    });
  }, [setLoaded]);

  useEffect(() => {
    if (firstLoadComplete) {
      return; // gate only the first paint; later filter changes use the wipe
    }
    const percentage = calculatePercentageLoaded(loaded);
    setProgress(percentage);
  }, [loaded, setProgress, firstLoadComplete]);

  const openProject = (index) => {
    const opening = !isActive(index);
    setActiveIndex(opening ? index : null);
    const isThis = getIsThis(index);
    mapProjectStates(setProjectStates,
      (state, i) => isThis(i) ? (state === ProjectStates.OPEN ? ProjectStates.CLOSED : ProjectStates.OPEN) : ProjectStates.CLOSED);
    setProjectHash(opening ? filteredProjects[index] : null);
  };

  const closeProject = (index) => {
    resetActiveIndex();
    const isThis = getIsThis(index);
    mapProjectStates(setProjectStates,
      (state, i) => isThis(i) ? ProjectStates.CLOSED : state);
    setProjectHash(null);
  };

  // Deep-link: once the first paint is done, open the project named in the URL
  // hash. The default view shows all groups, so the target is already rendered.
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  useEffect(() => {
    if (!firstLoadComplete || deepLinkHandled) {
      return;
    }
    setDeepLinkHandled(true);
    const slug = window.location.hash.replace(/^#/, '');
    if (!slug) {
      return;
    }
    const target = allProjectsSorted.find((p) => slugify(p.name) === slug);
    if (!target) {
      return;
    }
    const idx = allProjectsSorted.findIndex((p) => slugify(p.name) === slug);
    if (idx >= 0) {
      // open directly (not via openProject, which closes over the pre-filter
      // list) so the state and hash both refer to the deep-linked project
      setTimeout(() => {
        setActiveIndex(idx);
        mapProjectStates(setProjectStates,
          (state, i) => (i === idx ? ProjectStates.OPEN : ProjectStates.CLOSED));
        setProjectHash(target);
        // scroll the opened project into view once its expand animation settles
        setTimeout(() => {
          const el = columnRef.current?.querySelectorAll('.outer-project')?.[idx];
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      }, 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstLoadComplete, deepLinkHandled]);

  const setHover = (index) => {
    const isThis = getIsThis(index);
    mapProjectStates(setProjectStates, 
      (state, i) => isThis(i) && state !== ProjectStates.OPEN ? ProjectStates.HOVER_IN : state);
  }

  const resetHover = () => {
    mapProjectStates(setProjectStates, 
      (state, i) => state !== ProjectStates.OPEN ? ProjectStates.CLOSED : state);
  };

  const { onPressIn, onPressOut, onHoverIn, onHoverOut } = usePressableCallbacks({
    isNotActive,
    hovering,
    setHover,
    openProject,
    resetHover,
    setHovering,
    touchStartRef
  });

  const finishedLoading = () => {
    setFirstLoadComplete(true);
    setProgress(0);
    projectMaskRef.current.style.display = 'none';
    projectMaskRef.current.classList.remove('white-background');
    projectMaskRef.current.classList.add('gradient-background');
    setStartAnimation(1);
  }

  return (
    <React.StrictMode>
      <LoadingBar color="#85ab54" progress={progress} onLoaderFinished={() => finishedLoading()} />
      <WebGLCanvas texture1={texture1} texture2={texture2} />
      <Header />
      <div id="main">
        <div className="row">
          <div id="projects" className="column" ref={columnRef}>
            <div ref={projectMaskRef} id="projectMask" className="white-background"></div>
            {filteredProjects.map((project, index) => (
              <Pressable
                key={project.name}
                onPressIn={(event) => onPressIn(event, index)}
                onPressOut={(event) => onPressOut(event, index)}
                onHoverIn={(event) => onHoverIn(event, index)}
                onHoverOut={(event) => onHoverOut(event, index)}
                disabled={projectStates[index] === ProjectStates.OPEN}>
                <Project 
                  project={project} 
                  state={projectStates[index]} 
                  onClose={() => closeProject(index)}
                  onMediaLoaded={() => onMediaLoaded(index)}
                  startAnimationTime={getAnimationStartTime(startAnimation, index)}/>
              </Pressable>
            ))}
            <div className="trail">
              <span>.</span><br/>
              <span>.</span><br/>
              <span>.</span><br/>
              <span>.</span><br/>
            </div>
            <Footer 
              projectData={projectData}
              setActiveIndex={setActiveIndex}
              setProjectStates={setProjectStates}
              projectMaskRef={projectMaskRef}
              onFilterChange={setFilteredProjects}
            />
          </div>
        </div>
      </div>
    </React.StrictMode>
  );
}

export default App;
