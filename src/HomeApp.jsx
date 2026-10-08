import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
// site-wide styles (index.css, footer.css) come from SiteLayout
import './components/project/project.css';
import './components/slideshow/slideshow.css';
import './components/openmark/openmark.css';
import './svg.css';

import SiteData from './data/sitedata.json';
import Experiments from './data/experiments.json';

import { ProjectStates } from './components/project/projectStatesHandler.js';
import { Project } from './components/project/project.jsx';
import { Pressable } from 'react-native';
import LoadingBar from 'react-top-loading-bar'
import { useStore } from '@nanostores/react';
import { $activeGroups, $filtering, $groupRequest } from './stores/site.js';
import { scrollToTop } from './util.js';
import { $editorDraft, $editorPreview } from './editor/store.js';
import { compareProjects } from './projectOrder.js';

import { useProjectState, useLoadingState } from './hooks/index_hooks.js';
import { usePressableCallbacks } from './hooks/project_pressable_hooks.js';

import { 
getAnimationStartTime, 
calculatePercentageLoaded,
mapProjectStates,
getIsThis } from './homepage_utils.js';

const projectData = [...SiteData['projects'], ...Experiments['projects']];

// group toggles are boolean: show every project whose group is active, sorted
// newest-first so projects and experiments interweave by year.
function filterProjectData(activeGroups) {
  return projectData
    .filter(project => activeGroups.includes(project.group))
    .sort(compareProjects);
}

// Project editor (dev only): show the unsaved draft in place of the saved
// project, or as an extra card when it's new.
function withEditorDraft(projects, draft) {
  if (!draft) {
    return projects;
  }
  const { originalName, project } = draft;
  const shown = projects.map((saved) => (saved.name === originalName ? project : saved));
  if (!shown.includes(project)) {
    shown.push(project);
  }
  return shown.sort(compareProjects);
}

const PREVIEW_STATES = {
  closed: ProjectStates.CLOSED,
  hover: ProjectStates.HOVER_IN,
  open: ProjectStates.OPEN,
};

const wipeScreen = (projectMask) => {
  projectMask.style.backgroundPositionY = '-100vh';
  projectMask.style.display = 'block';
  projectMask.classList.remove('wipe');
  projectMask.classList.add('wipe');
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Module state outlives the component: navigating to the blog unmounts the
// homepage, but coming back is a client-side swap, not a reload. Once the
// first visit has passed the loading gate, later visits skip it (the images
// are cached by then).
let hasLoadedOnce = false;

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
  // a footer click on another page may already have picked a group
  const [filteredProjects, setFilteredProjects] = useState(() => filterProjectData($activeGroups.get()));
  const editorDraft = useStore($editorDraft);
  const editorPreview = useStore($editorPreview);
  const isEditing = editorDraft !== null;
  const displayedProjects = useMemo(
    () => withEditorDraft(filteredProjects, editorDraft),
    [filteredProjects, editorDraft],
  );
  const editedIndex = isEditing ? displayedProjects.indexOf(editorDraft.project) : -1;
  // the initial loading bar / mask only gates the first paint; filter changes
  // afterward must not re-trigger it.
  const [firstLoadComplete, setFirstLoadComplete] = useState(hasLoadedOnce);

  const [hovering, setHovering] = useState(false);

  const columnRef = useRef();
  const touchStartRef = useRef(null);
  const projectMaskRef = useRef();

  useEffect(() => {
    setProjectStates(projectData.map(() => ProjectStates.CLOSED));
  }, [setProjectStates]);

  // a new project in the editor adds a card beyond the saved ones
  useEffect(() => {
    if (projectStates.length < displayedProjects.length) {
      setProjectStates((prev) => [
        ...prev,
        ...new Array(displayedProjects.length - prev.length).fill(ProjectStates.CLOSED),
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedProjects.length]);

  // the editor's closed / hover / open buttons drive the edited card
  useEffect(() => {
    if (editedIndex < 0) {
      return;
    }
    setActiveIndex(editorPreview === 'open' ? editedIndex : null);
    setProjectStates((prev) => prev.map((state, i) =>
      (i === editedIndex ? PREVIEW_STATES[editorPreview] : ProjectStates.CLOSED)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedIndex, editorPreview]);

  // bring the card into view when the editor picks a project
  const editedName = editorDraft?.originalName;
  useEffect(() => {
    if (editedIndex < 0) {
      return;
    }
    const card = columnRef.current?.querySelectorAll('.outer-project')?.[editedIndex];
    card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedName, editedIndex < 0]);

  // returning from another page: skip the loading gate, just run the intro
  useEffect(() => {
    if (hasLoadedOnce) {
      finishedLoading();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Footer group clicks: close everything, wipe, swap the grid under the wipe.
  // A request made before this mount is already reflected in the initial grid.
  const groupRequest = useStore($groupRequest);
  const handledGroupRequest = useRef(groupRequest);
  useEffect(() => {
    if (!groupRequest || groupRequest === handledGroupRequest.current) {
      return;
    }
    handledGroupRequest.current = groupRequest;
    applyGroups(groupRequest.groups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupRequest]);

  const applyGroups = async (groups) => {
    $filtering.set(true);
    setActiveIndex(null);
    setProjectStates((prev) => prev.map(() => ProjectStates.CLOSED));
    setProjectHash(null);
    scrollToTop();

    await delay(250);
    wipeScreen(projectMaskRef.current);

    await delay(150);
    setFilteredProjects(filterProjectData(groups));

    await delay(900);
    projectMaskRef.current.style.display = 'none';
    $filtering.set(false);
    scrollToTop();
  };

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
    setProjectHash(opening ? displayedProjects[index] : null);
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
    const target = filteredProjects.find((p) => slugify(p.name) === slug);
    if (!target) {
      return;
    }
    const idx = filteredProjects.findIndex((p) => slugify(p.name) === slug);
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
    hasLoadedOnce = true;
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
      <div id="main">
        <div className="row">
          <div id="projects" className="column" ref={columnRef}>
            <div ref={projectMaskRef} id="projectMask" className="white-background"></div>
            {displayedProjects.map((project, index) => (
              <Pressable
                key={index === editedIndex ? 'editor-draft' : project.name}
                onPressIn={(event) => !isEditing && onPressIn(event, index)}
                onPressOut={(event) => !isEditing && onPressOut(event, index)}
                onHoverIn={(event) => !isEditing && onHoverIn(event, index)}
                onHoverOut={(event) => !isEditing && onHoverOut(event, index)}
                disabled={isEditing || projectStates[index] === ProjectStates.OPEN}>
                <Project 
                  project={project} 
                  state={projectStates[index] ?? ProjectStates.CLOSED} 
                  editing={index === editedIndex}
                  onClose={() => !isEditing && closeProject(index)}
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
          </div>
        </div>
      </div>
    </React.StrictMode>
  );
}

export default App;
