import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $effects, $flashStaticNow } from '../../stores/effects.js';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Every so often (see effects.json) a closed card flashes the slide-change
// static, so the grid feels alive. Only cards on screen flash, and only while
// the tab is visible.
export function AmbientStatic({ enabled }) {
  const { minSeconds, maxSeconds, flashMs, opacity } = useStore($effects).ambientStatic;
  const flashNow = useStore($flashStaticNow);
  const [flashing, setFlashing] = useState(false);
  const boxRef = useRef();
  const onScreen = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      onScreen.current = entry.isIntersecting;
    });
    observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      setFlashing(false);
      return undefined;
    }
    const randomPause = () => (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
    let timer;
    const scheduleFlash = () => {
      timer = setTimeout(flash, randomPause());
    };
    const flash = () => {
      if (!onScreen.current || document.hidden) {
        scheduleFlash();
        return;
      }
      setFlashing(true);
      timer = setTimeout(() => {
        setFlashing(false);
        scheduleFlash();
      }, flashMs);
    };
    // the editor's "flash now" starts with a flash instead of a pause
    if (flashNow > 0) {
      flash();
    } else {
      scheduleFlash();
    }
    return () => clearTimeout(timer);
  }, [enabled, minSeconds, maxSeconds, flashMs, flashNow]);

  return (
    <div ref={boxRef} className="ambient-static" style={{ opacity }} aria-hidden="true">
      {flashing && <img src="/static.webp" alt="" />}
    </div>
  );
}
