import React from 'react';
import variants from '../../data/media-variants.json';

// Desktop gets the original file; touch screens get the lighter copy made by
// `npm run media:mobile` (or the project editor), when there is one.
// Same "phone" test the header uses.
const PHONE_QUERY = '(hover: none) and (pointer: coarse)';

const mobileCopyOf = (src) => (variants[src] ? `/${variants[src]}` : null);

/** Video URL for this device. */
export function videoSourceFor(src) {
  const mobileCopy = mobileCopyOf(src);
  if (mobileCopy && window.matchMedia(PHONE_QUERY).matches) {
    return mobileCopy;
  }
  return src;
}

/**
 * <img> that the browser swaps for the mobile copy on touch screens. A plain
 * <picture>, so onLoad (which the loading gate counts) fires as usual.
 */
export function ResponsiveImage({ src, ...imgProps }) {
  const mobileCopy = mobileCopyOf(src);
  if (!mobileCopy) {
    return <img src={src} {...imgProps} />;
  }
  return (
    <picture className="responsive-media">
      <source media={PHONE_QUERY} srcSet={mobileCopy} type="image/webp" />
      <img src={src} {...imgProps} />
    </picture>
  );
}
