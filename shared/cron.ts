const cronPart = /^\*|\d+(-\d+)?(,\d+(-\d+)?)*$/;

export function isValidCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }
  return parts.every((part) => cronPart.test(part));
}

export function nextCronRun(from: Date, cron: string): Date | null {
  if (!isValidCron(cron)) {
    return null;
  }
  const [minPart, hourPart, dayPart, monthPart, weekPart] = cron.split(/\s+/);

  for (let i = 1; i <= 60 * 24 * 30; i += 1) {
    const candidate = new Date(from.getTime() + i * 60000);
    const minute = candidate.getUTCMinutes();
    const hour = candidate.getUTCHours();
    const day = candidate.getUTCDate();
    const month = candidate.getUTCMonth() + 1;
    const week = candidate.getUTCDay();
    if (
      matchesPart(minPart, minute) &&
      matchesPart(hourPart, hour) &&
      matchesPart(dayPart, day) &&
      matchesPart(monthPart, month) &&
      matchesPart(weekPart, week)
    ) {
      return candidate;
    }
  }
  return null;
}

function matchesPart(part: string, value: number): boolean {
  if (part === "*") {
    return true;
  }
  const segments = part.split(",");
  return segments.some((segment) => {
    if (segment.includes("-")) {
      const [start, end] = segment.split("-").map(Number);
      return value >= start && value <= end;
    }
    return value === Number(segment);
  });
}
