// Homepage order: newest year first; within a year, by `yearOrder` (set by
// dragging in the project editor). Projects without one keep their file order
// (Array.sort is stable), after any that have one.
//
// yearOrderOverrides (editor, dev only): { [name]: { year, yearOrder } } for
// order changes saved since the page loaded; one applies only while the
// project is still in that year.
export function projectComparator(yearOrderOverrides = {}) {
  const yearOrderOf = (project) => {
    const override = yearOrderOverrides[project.name];
    if (override && override.year === project.year) {
      return override.yearOrder;
    }
    return project.yearOrder ?? Number.MAX_SAFE_INTEGER;
  };
  return (a, b) => {
    const byYear = Number(b.year) - Number(a.year);
    if (byYear !== 0) {
      return byYear;
    }
    return yearOrderOf(a) - yearOrderOf(b);
  };
}

export const compareProjects = projectComparator();
