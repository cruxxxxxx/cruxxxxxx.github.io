import React, { useRef, useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { ProjectStates } from '../project/projectStatesHandler.js';

export function OpenMark({ state, onClose }) {
  const openMarkRef = useRef();
  const [hoverState, setHoverState] = useState(0);
  const isProjectOpen = state === ProjectStates.OPEN;

  const onHoverIn = () => {
    setHoverState(1); // Hover in state
  };

  const onHoverOut = () => {
    setHoverState(2); // Hover out state
  };

  useEffect(() => {
    const openMark = openMarkRef.current;

    if (openMark && state === ProjectStates.OPEN ) {
      if (hoverState === 0) {
        openMark.classList.add('rotating-element');
      } else if (hoverState === 1) {
        openMark.classList.remove('rotating-element');
        openMark.classList.remove('rotating-down');

        openMark.classList.add('rotating-up');
      } else if (hoverState === 2) {
        openMark.classList.remove('rotating-element');
        openMark.classList.remove('rotating-up');

        openMark.classList.add('rotating-down');
      }
    }
  }, [state, hoverState]);

  return (
    <div className="open-mark-container" style={{display: isProjectOpen ? 'block' : 'none'}}>
      <Pressable
        ref={openMarkRef}
        hitSlop={300}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        onPressIn={onClose}
      >
        <span className="open-mark"> &#9658; </span>
      </Pressable>
    </div>
  );
}
