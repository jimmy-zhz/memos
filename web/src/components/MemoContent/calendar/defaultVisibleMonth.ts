export interface VisibleMonth {
  year: number;
  month: number; // 0-indexed
}

export function defaultVisibleMonth(): VisibleMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}
