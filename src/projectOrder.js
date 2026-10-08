// Homepage order: newest year first; within a year, by `yearOrder` (set by
// the project editor's ↑/↓). Projects without one keep their file order
// (Array.sort is stable), after any that have one.
export function compareProjects(a, b) {
  const byYear = Number(b.year) - Number(a.year);
  if (byYear !== 0) {
    return byYear;
  }
  return (a.yearOrder ?? Number.MAX_SAFE_INTEGER) - (b.yearOrder ?? Number.MAX_SAFE_INTEGER);
}
