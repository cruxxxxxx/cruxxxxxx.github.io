import React from 'react';

// Project descriptions are plain text with Markdown-style links:
// `[label](https://example.com)` shows "label" as a link. Only http(s) and
// mailto targets become links; anything else stays as written.
const LINK_PATTERN = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g;

/** description: one string, or a list of paragraphs (as in the project JSON). */
export function DescriptionText({ description }) {
  const text = [].concat(description ?? []).join('');
  return <div className="project-description-text">{withLinks(text)}</div>;
}

function withLinks(text) {
  const parts = [];
  let last = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const [whole, label, href] = match;
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    parts.push(
      <a key={match.index} href={href} target="_blank" rel="noopener noreferrer">{label}</a>,
    );
    last = match.index + whole.length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}
