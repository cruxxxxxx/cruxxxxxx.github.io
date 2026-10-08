import React, { useEffect, useRef } from 'react';
import { Player, ORIGINAL_CANVAS_WIDTH, ORIGINAL_CANVAS_HEIGHT } from 'mio-player';

const MioPlayerWrapper = ({ src, onLoaded }) => {
  const canvasRef = useRef(null);
  const mioPlayerRef = useRef(null);
  const stylusPosRef = useRef({ x: 0, y: 0 }); // store stylus position

  useEffect(() => {
    if (mioPlayerRef.current) return; // prevent double creation

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    const mioPlayer = new Player(canvas, document);
    mioPlayerRef.current = mioPlayer;

    const loadSound = (name) => {
      const audio = new Audio(`warioware/audio/${name}.ogg`);
      audio.volume = 0.3;
      return audio;
    };

    const oggSrc = src.replace(/\.mio$/, '.ogg');
    const backgroundAudio = new Audio(oggSrc);
    backgroundAudio.loop = true; 
    backgroundAudio.volume = 0.5; 

    const customMusicPlayer = {
      playMusic: () => {
        backgroundAudio.currentTime = 0;
        backgroundAudio.play().catch(err => console.warn("Audio play error:", err));
        return true;
      },
      stopMusic: () => {
        backgroundAudio.pause();
        backgroundAudio.currentTime = 0;
        return true;
      }
    };

    const winSounds = ['win1', 'win2', 'win3'].map(loadSound);
    const loseSounds = ['lose1', 'lose2', 'lose3'].map(loadSound);
    const sounds = mioPlayer.soundNames.map(loadSound);

    mioPlayer.sounds = sounds;
    mioPlayer.winSounds = winSounds;
    mioPlayer.loseSounds = loseSounds;
    mioPlayer.musicPlayer = customMusicPlayer;

    const fontBitmap = new Image();
    fontBitmap.src = 'warioware/images/miofont.png';
    mioPlayer.fontBitmap = fontBitmap;

    const confettiBitmap = new Image();
    confettiBitmap.src = 'warioware/images/confetti.png';
    mioPlayer.confettiBitmap = confettiBitmap;

    const windowSize = () => [window.innerWidth, window.innerHeight];
    const windowScale = () => {
      const [w, h] = windowSize();
      return Math.min(w / ORIGINAL_CANVAS_WIDTH, h / ORIGINAL_CANVAS_HEIGHT);
    };

    const handleResize = () => {
      const scale = windowScale();
      mioPlayer.scaleCanvas(scale);
      if(context != null) {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    //no idea how this works.. very complicated, mio-player is confusing
    const updateStylusPos = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();

      //touch relative to canvas, removes area before canvas
      const relativeX = clientX - rect.left;
      const relativeY = clientY - rect.top;

      //find ratio of touch to canvas, convert to original coordinates
      const scaledX = (relativeX / rect.width) * ORIGINAL_CANVAS_WIDTH;
      const scaledY = (relativeY / rect.height) * ORIGINAL_CANVAS_HEIGHT;

      //get window scale, for some reason its square ?
      const windowScale = Math.min(canvas.width / ORIGINAL_CANVAS_WIDTH, canvas.height / ORIGINAL_CANVAS_HEIGHT);

      //multiply scaled by window scale, add back padding
      const adjustedX = scaledX * windowScale + rect.left;
      const adjustedY = scaledY * windowScale + rect.top;

      mioPlayer.setStylusPosition(adjustedX, adjustedY);
      stylusPosRef.current = { x: scaledX, y: scaledY };
    };

    const handleMouseMove = (e) => updateStylusPos(e.clientX, e.clientY);
    const handleMouseDown = (e) => { if (e.button === 0) mioPlayer.touchScreen(); };
    const handleMouseUp = (e) => { if (e.button === 0) mioPlayer.withdrawTouchFromScreen(); };
    const handleTouchStart = (e) => {
      const touch = e.touches[0] || e.changedTouches[0];
      updateStylusPos(touch.clientX, touch.clientY);
      mioPlayer.touchScreen();
    };
    const handleTouchEnd = () => mioPlayer.withdrawTouchFromScreen();

    window.addEventListener('resize', handleResize);
    document.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchend', handleTouchEnd);

    handleResize();

    // Guard against the async fetch resolving AFTER this effect is torn down.
    // Without it, cleanup calls mioPlayer.stop() but a later loadAndStart()
    // restarts the raf loop + music on an orphaned player → zombie that never
    // stops and piles up on every carousel navigation.
    let cancelled = false;

    fetch(src)
      .then(res => res.arrayBuffer())
      .then(buffer => {
        if (cancelled) return;
        const mioData = new Uint8Array(buffer);
        mioPlayer.loadAndStart(mioData);
        if (onLoaded) onLoaded();
      })
      .catch(err => {
        if (!cancelled) console.error("Failed to load MIO data:", err);
      });

    return () => {
      cancelled = true;

      window.removeEventListener('resize', handleResize);
      document.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);

      mioPlayer.stop(); // halts the raf loop (gameId bump) and stops music
      backgroundAudio.pause();
      backgroundAudio.currentTime = 0;
      mioPlayerRef.current = null;
    };
  }, [src]);

  return <canvas ref={canvasRef} width={800} height={600} style={{ width: '100%', // force visual size
    height: '100%',  zIndex: 1001, pointerEvents: 'auto' }} />;
};

export default MioPlayerWrapper;
