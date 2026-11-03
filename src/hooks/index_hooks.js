import { ProjectStates } from "../components/project/projectStatesHandler";
import { useState } from 'react';

export function useProjectState(projectData) {
    const [projectStates, setProjectStates] = useState(
        projectData.map(() => ProjectStates.LOADING)
    );

    const [activeIndex, setActiveIndex] = useState(null);
    const resetActiveIndex = () => setActiveIndex(null);
    const isActive = (index) => index === activeIndex;
    const isNotActive = (index) => index !== activeIndex;

  return {
    projectStates,
    setProjectStates,
    activeIndex,
    setActiveIndex,
    resetActiveIndex,
    isActive,
    isNotActive
  };
}

// loaded is keyed by project name: the gate counts only the projects on
// screen, which can be one group when arriving from another page.
export function useLoadingState() {
    const [loaded, setLoaded] = useState({});
    const [progress,setProgress] = useState(0);
    const [startAnimation, setStartAnimation] = useState(null);

    return {
        loaded,
        setLoaded,
        progress,
        setProgress,
        startAnimation,
        setStartAnimation
    };
}