import React, { useEffect, useRef, useState } from 'react';
import { ProjectStates, ProjectStateHandler } from './projectStatesHandler.js';
import Slideshow from '../slideshow/slideshow.jsx';
import { OpenMark } from '../openmark/openmark.jsx';

function ProjectComponent(props) {
  const { project, state, onClose, onMediaLoaded, startAnimationTime } = props;

  const outerProject = useRef();
  const innerProject = useRef();
  const projectInfo = useRef();
  const slideshowRef = useRef();
  const prevState = useRef(state);
  const projectTitle = useRef();
  const lineContainerRef = useRef();
  const projectLineRef = useRef();
  const projectDescriptionRef = useRef();
  const innerInfoRef = useRef();
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    const projectInfoElem = projectInfo.current;
    const innerProjectElem = innerProject.current;
    const projectDescriptionElem = projectDescriptionRef.current;

    const stateHandler = new ProjectStateHandler(projectInfoElem, innerProjectElem, projectDescriptionElem, project);

    if(project.mediaSrcs.length > 1) {
      projectDescriptionRef.current.style.marginTop = '4em';
    }
  
    const prevClosed = (prevState.current === ProjectStates.CLOSED) && (state === ProjectStates.CLOSED);

    if (!isPlaying && (prevState.current === ProjectStates.LOADING && state === ProjectStates.CLOSED)) {
    } else if(prevClosed) {
      stateHandler.onStateChange(ProjectStates.LOADING);
    }
    // an explicit OPEN (e.g. a deep link) must apply even mid intro-animation,
    // otherwise the project is state-OPEN (Pressable disabled) but never visually
    // opened, so it looks closed and is unclickable.
    else if(state === ProjectStates.OPEN) {
      stateHandler.onStateChange(ProjectStates.OPEN);
    }
    else if(!isPlaying) {
      stateHandler.onStateChange(state);
    }

    if (prevState.current === ProjectStates.OPEN && state === ProjectStates.CLOSED && slideshowRef.current) {
      slideshowRef.current.resetSlideIndex();
      innerProjectElem.classList.add('closing-animation');
    }

    prevState.current = state;
  }, [state]);

  useEffect(() => {
    const lineContainer = lineContainerRef.current;
    const projectLine = projectLineRef.current;
    const innerInfo = innerInfoRef.current;

    if (state === ProjectStates.OPEN) {
      if (lineContainer) {
        projectLine.classList.add('project-line', 'animation');
      }
      if(innerInfo) {
        innerInfo.classList.add('open');
      }
    }
  }, [state]);

  useEffect(() => {
    const innerProjectElem = innerProject.current;
    if (!innerProjectElem) {
      return;
    }

    if (startAnimationTime > 0) {
      setPlaying(true);
      innerProjectElem.style.opacity = 0;
      innerProjectElem.style.display = 'block';
      innerProjectElem.style.animationDelay = `${startAnimationTime * 1.5}ms`;
      innerProjectElem.classList.add('fade-in');
    }

    const handleAnimationEnd = () => {
      setPlaying(false);
      innerProjectElem.style.opacity = 1;
      innerProjectElem.classList.remove('fade-in');
      innerProjectElem.style.animationDelay = null;
    };

    innerProjectElem.addEventListener('animationend', handleAnimationEnd);

    return () => {
      innerProjectElem.removeEventListener('animationend', handleAnimationEnd);
    };
  }, [startAnimationTime]);

  return (
    <div className="outer-project" 
    ref={outerProject}>
      <div
        className="inner-project"
        ref={innerProject}
        style={{
          '--margin-top-open': project.marginTopOpen,
          '--margin-bottom-open': project.marginBottomOpen,
          '--margin-top-close': project.marginTopClose,
          '--margin-bottom-close': project.marginBottomClose,
          '--margin-top-hover': project.marginTopHover,
          '--margin-bottom-hover': project.marginBottomHover
        }}
      >
        <div className="project-info" ref={projectInfo}>
          <div className="project-title">
            <span ref={projectTitle}>{project.name} </span>
          </div>

          <OpenMark state={state} onClose={onClose} />

          <div className="line-container" ref={lineContainerRef}>
            <svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg">
              <path ref={projectLineRef} d="M0,1h240.07c3.12,0,6.03,1.55,7.78,4.14l64.64,95.88"/>
            </svg>
          </div>

          <div className="project-info-text-container">
            <table ref={innerInfoRef} className="project-info-table">
              <tbody>
                <tr className="project-info-row">
                  <td className="project-info-label-cell">type</td>
                  <td className="project-info-value-cell">{project.category}</td>
                </tr>
                <tr>
                  <td className="project-info-label-cell">year</td>
                  <td className="project-info-value-cell">{project.year}</td>
                </tr>
              </tbody>
            </table>
            <div className="project-info-text-year-column">
            </div>
          </div>

        </div>

        <Slideshow
          ref={slideshowRef}
          mediaSrcs={project.mediaSrcs}
          projectName={project.name}
          isProjectOpen={state === ProjectStates.OPEN}
          onMediaLoaded={onMediaLoaded}
        />
      </div>
      <div ref={projectDescriptionRef} className="project-description">
        {project.description}
      </div>

    </div>
  );
}

// onClose / onMediaLoaded are recreated inline each parent render but are
// behaviorally stable per index, so only re-render on meaningful prop changes.
export const Project = React.memo(ProjectComponent, (prev, next) =>
  prev.state === next.state &&
  prev.startAnimationTime === next.startAnimationTime &&
  prev.project === next.project
);
