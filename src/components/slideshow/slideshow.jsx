import React, { useState, useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
import CarouselModule from 'react-multi-carousel';
import 'react-multi-carousel/lib/styles.css';
import ReactPlayerModule from 'react-player/lazy';
import MioPlayerWrapper from '../mio/mioPlayerWrapper.jsx';

// react-multi-carousel and react-player are CommonJS flagged __esModule; under
// Vite the default import is the whole module object, so unwrap it (CRA's
// webpack did this implicitly).
const Carousel = CarouselModule.default ?? CarouselModule;
const ReactPlayer = ReactPlayerModule.default ?? ReactPlayerModule;

const Slideshow = forwardRef(({ mediaSrcs, projectName, isProjectOpen, onMediaLoaded }, ref) => {
  const [loaded, setLoaded] = useState(new Array(mediaSrcs.length).fill(false));
  const [slideIndex, setSlideIndex] = useState(0);
  const [showStatic, setShowStatic] = useState(false);
  // per-index flag: has the real video started playing yet? Until it has, the
  // poster stays overlaid so opening looks instant (no black/buffering gap).
  const [videoStarted, setVideoStarted] = useState({});
  const carousel = useRef();
  const playerRefs = useRef([]);

  useImperativeHandle(ref, () => ({
    resetSlideIndex: () => carousel.current.goToSlide(0, true)
  }));

  useEffect(() => {
    playerRefs.current.forEach((player, index) => {
      if (player) {
        if (index === slideIndex) {
        } else {
          player.seekTo(0);
        }

        if (!isProjectOpen) {
          player.seekTo(0);
        }
      }
    });

    if (!isProjectOpen) {
      setSlideIndex(0);
      setVideoStarted({}); // reopen should show the poster again until video plays
    }
  }, [slideIndex, isProjectOpen]);

  useEffect(() => {
    if (loaded[0]) {
      onMediaLoaded();
    }
  }, [loaded, onMediaLoaded]);

  const getMediaType = (src) => {
    if (src.includes('youtube.com') || src.includes('youtu.be')) {
      return 'youtube';
    }
    const extension = src.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
      return 'image';
    } else if (['mp4', 'webm', 'ogg'].includes(extension)) {
      return 'video';
    } else if (extension === 'mio') { 
      return 'mio';
    }
    return 'unknown';
  };

  const handleLoad = (index) => {
    setLoaded(prevLoaded => {
      const newLoaded = [...prevLoaded];
      newLoaded[index] = true;
      return newLoaded;
    });
  };

  // A media entry is either a string URL, or { src, poster } to enable a
  // video slide to "lead" on the closed grid. The poster shows while closed;
  // the real player takes over when the project opens.
  const getEntrySrc = (entry) => (typeof entry === 'string' ? entry : entry.src);
  const getEntryPoster = (entry) => (typeof entry === 'string' ? null : entry.poster);
  // optional start time (seconds): the poster is the frame at this time and the
  // video seeks here on open, so the still and first video frame match exactly.
  const getEntryPosterTime = (entry) => (typeof entry === 'string' ? null : entry.posterTime);

  // Closed-grid preview for a video slide. Poster type is auto-detected by
  // extension: mp4/webm -> muted looping low-fi video; anything else
  // (png/jpg/webp/gif) -> image (a .gif animates on its own).
  const renderPoster = (poster, index) => {
    const ext = poster.split('.').pop().toLowerCase();
    const style = {
      opacity: loaded[index] ? 1 : 0,
      transition: 'opacity 0.2s',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    };
    if (ext === 'mp4' || ext === 'webm') {
      return (
        <video
          className={`mySlides ${loaded[index] ? 'fade-in' : 'fade-out'}`}
          src={poster}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          onLoadedData={() => handleLoad(index)}
          style={style}
        />
      );
    }
    return (
      <img
        className={`mySlides ${loaded[index] ? 'fade-in' : 'fade-out'}`}
        src={poster}
        alt={projectName}
        loading={index === 0 ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => handleLoad(index)}
        style={style}
      />
    );
  };

  const slideChangeTimeout = useRef(null);

  useEffect(() => {
    return () => clearTimeout(slideChangeTimeout.current);
  }, []);

  const handleSlideChange = (newIndex) => {
    setShowStatic(true);
    clearTimeout(slideChangeTimeout.current);
    slideChangeTimeout.current = setTimeout(() => {
      setShowStatic(false);
      setSlideIndex(newIndex);
    }, 200);
  };

  const responsive = {
    desktop: {
      breakpoint: { max: 3000, min: 1024 },
      items: 1,
      slidesToSlide: 1 // optional, default to 1.
    },
    tablet: {
      breakpoint: { max: 1024, min: 464 },
      items: 1,
      slidesToSlide: 1 // optional, default to 1.
    },
    mobile: {
      breakpoint: { max: 464, min: 0 },
      items: 1,
      slidesToSlide: 1 // optional, default to 1.
    }
  };

  return (
    <div style={{ position: 'relative'}}>
      {showStatic && (
        <img
          src="/static.webp"
          alt="Static"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1000,
          }}
        />
      )}
      <Carousel ref={carousel}
        responsive={responsive}
        arrows={isProjectOpen && mediaSrcs.length > 1 }
        showDots={isProjectOpen && mediaSrcs.length > 1}
        removeArrowOnDeviceType={[]}
        renderDotsOutside={true}
        draggable={false}
        swipeable={false}
        customTransition="all"
        beforeChange={(nextSlide, { currentSlide, onMove }) => handleSlideChange(nextSlide)}
        dotListClass="custom-dot-list-style">
        {/* Images use opacity (not display:none) to hide until loaded: a
            display:none element has no layout box, so loading="lazy" never
            intersects the viewport and never loads. Cover (index 0) is eager. */}
        {mediaSrcs.map((entry, index) => {
          const src = getEntrySrc(entry);
          const poster = getEntryPoster(entry);
          const posterTime = getEntryPosterTime(entry);
          const mediaType = getMediaType(src);
          const isVideoLike = mediaType === 'video' || mediaType === 'youtube';
          return (
            <div key={index}>
              {mediaType === 'image' ? (
                <img
                  className={`mySlides ${loaded[index] ? 'fade-in' : 'fade-out'}`}
                  src={src}
                  alt={projectName}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  onLoad={() => handleLoad(index)}
                  style={{ opacity: loaded[index] ? 1 : 0, transition: 'opacity 0.2s' }}
                />
              ) : isVideoLike && isProjectOpen && index === slideIndex ? (
                <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                  <ReactPlayer
                    ref={el => playerRefs.current[index] = el}
                    config={{
                      youtube: {
                        playerVars: { playsinline: 1 }
                      },
                      file: {
                        attributes: {
                          playsInline: true
                        }
                      }
                    }}
                    loop={true}
                    playsinline={true}
                    controls={isProjectOpen}
                    height='200%' width='100%'
                    volume={0.2}
                    url={src}
                    playing={index === slideIndex && isProjectOpen}
                    onReady={() => {
                      handleLoad(index);
                      if (posterTime && playerRefs.current[index]) {
                        playerRefs.current[index].seekTo(posterTime, 'seconds');
                      }
                    }}
                    onStart={() => {
                      if (posterTime && playerRefs.current[index]) {
                        playerRefs.current[index].seekTo(posterTime, 'seconds');
                      }
                      setVideoStarted(prev => ({ ...prev, [index]: true }));
                    }}
                  />
                  {poster && !['mp4', 'webm'].includes(poster.split('.').pop().toLowerCase()) && !videoStarted[index] && (
                    <img
                      src={poster}
                      alt={projectName}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2, pointerEvents: 'none' }}
                    />
                  )}
                </div>
              ) : isVideoLike && poster ? (
                renderPoster(poster, index)
              ): mediaType === 'mio' && isProjectOpen && index === slideIndex ? (
                <MioPlayerWrapper
                  src={src}
                  onLoaded={() => handleLoad(index)}
                />
            ) : null}
            </div>
          );
        })}
      </Carousel>
    </div>
  );
});

export default Slideshow;
