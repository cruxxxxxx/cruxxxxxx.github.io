import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $effects } from '../../stores/effects.js';

// letters, digits and spaces stay text; any other character is a star, and
// with "layered" on it's drawn as the stacked layers instead
const isStar = (character) => /[^\p{L}\p{N}\s]/u.test(character);

/** A layer whose star is this draws short lines out from the centre instead of a character. */
export const RAYS = 'rays';

// "✦ new ✦" in the corner of a project marked isNew: grey, with a white
// highlight running across it letter by letter, then a pause (see effects.json).
export function NewBadge({ faded }) {
  const badge = useStore($effects).newBadge;
  const { text, letterMs, pauseMs, sizeEm, topEm, rightEm, grey, layered, layerLight } = badge;
  const visibleLayers = layered ? badge.layers.filter((layer) => layer.on) : [];
  const characters = useMemo(() => [...text], [text]);
  const steps = useMemo(
    () => sweepSteps(characters, layerLight === 'sequence' ? visibleLayers.length : 0),
    [characters, layerLight, visibleLayers.length],
  );
  const [lit, setLit] = useState(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    let step = 0;
    let timer;
    const advance = () => {
      if (step < steps.length) {
        setLit(steps[step]);
        step += 1;
        timer = setTimeout(advance, letterMs);
      } else {
        setLit(null);
        step = 0;
        timer = setTimeout(advance, pauseMs);
      }
    };
    advance();
    return () => clearTimeout(timer);
  }, [steps, letterMs, pauseMs]);

  return (
    <span
      className={`new-badge${faded ? ' faded' : ''}`}
      style={{ fontSize: `${sizeEm}em`, top: `${topEm}em`, right: `${rightEm}em`, color: grey }}
      aria-label="new">
      {characters.map((character, index) => {
        const isLit = lit?.index === index;
        if (visibleLayers.length > 0 && isStar(character)) {
          return (
            <LayeredStar
              key={index}
              placeholder={character}
              layers={visibleLayers}
              litLayer={isLit ? lit.layer : undefined} />
          );
        }
        return (
          <span key={index} className={isLit ? 'lit' : ''} aria-hidden="true">{character}</span>
        );
      })}
    </span>
  );
}

/**
 * The layers drawn on top of each other in one character's space, first
 * layer at the back. litLayer: the index of the lit layer, 'all', or
 * undefined for none.
 */
export function LayeredStar({ placeholder, layers, litLayer }) {
  return (
    <span className="badge-stack" aria-hidden="true">
      {/* holds the character's width; the layers sit over it */}
      <span className="badge-stack-space">{placeholder}</span>
      {layers.map((layer, index) => (
        <span
          key={index}
          className={`badge-layer${litLayer === 'all' || litLayer === index ? ' lit' : ''}`}
          style={{
            '--layer-color': layer.color,
            transform: `translate(${layer.x}em, ${layer.y}em) rotate(${layer.rotate}deg) scale(${layer.scale})`,
          }}>
          <span className={`badge-layer-spin${layer.spinRpm ? ' spinning' : ''}${layer.star === RAYS ? ' holds-rays' : ''}`} style={spinStyle(layer.spinRpm)}>
            {layer.star === RAYS ? <Rays layer={layer} /> : layer.star}
          </span>
        </span>
      ))}
    </span>
  );
}

// Short lines pointing out from the centre, evenly spaced, the first one
// straight up (rotate 45 puts four of them between a ✦'s points). In a
// 100-unit box the size of one character: rayInner is where a line starts,
// rayLength how long it is, rayWidth how thick.
function Rays({ layer }) {
  const { rayCount, rayInner, rayLength, rayWidth } = layer;
  const angles = Array.from({ length: Math.max(1, rayCount) }, (_, i) => (i * 2 * Math.PI) / rayCount);
  return (
    <svg className="badge-rays" viewBox="-50 -50 100 100">
      {angles.map((angle) => (
        <line
          key={angle}
          x1={Math.sin(angle) * rayInner}
          y1={-Math.cos(angle) * rayInner}
          x2={Math.sin(angle) * (rayInner + rayLength)}
          y2={-Math.cos(angle) * (rayInner + rayLength)}
          strokeWidth={rayWidth} />
      ))}
    </svg>
  );
}

// spinRpm: turns per minute, negative for anticlockwise, 0 to stand still
function spinStyle(spinRpm) {
  if (!spinRpm) {
    return undefined;
  }
  return {
    animationDuration: `${60 / Math.abs(spinRpm)}s`,
    animationDirection: spinRpm < 0 ? 'reverse' : 'normal',
  };
}

// The highlight's path: one step per letter; a layered star takes one step
// per layer when they light in sequence, or one step for all of them.
function sweepSteps(characters, sequencedLayers) {
  return characters.flatMap((character, index) => {
    if (!character.trim()) {
      return [];
    }
    if (sequencedLayers > 0 && isStar(character)) {
      return Array.from({ length: sequencedLayers }, (_, layer) => ({ index, layer }));
    }
    return [{ index, layer: 'all' }];
  });
}
