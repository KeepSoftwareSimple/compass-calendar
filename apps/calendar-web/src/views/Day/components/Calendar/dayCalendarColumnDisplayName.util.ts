const parseEmailCalendarName = (
  name: string,
): { domain: string; local: string } | null => {
  const trimmed = name.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at >= trimmed.length - 1 || trimmed.includes(" ")) {
    return null;
  }
  return { local: trimmed.slice(0, at), domain: trimmed.slice(at + 1) };
};

/** Domain label without a trailing TLD segment (e.g. tylerdane.com → tylerdane). */
export const emailDomainStem = (domain: string): string => {
  const parts = domain.trim().toLowerCase().split(".").filter(Boolean);
  if (parts.length >= 2 && parts[parts.length - 1].length <= 3) {
    return parts[parts.length - 2] ?? domain;
  }
  return parts[0] ?? domain;
};

export const defaultDayCalendarColumnDisplayName = (name: string): string => {
  const email = parseEmailCalendarName(name);
  return email?.local ?? name.trim();
};

const countLabels = (labels: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
};

const duplicateLabelKeys = (labels: readonly string[]): Set<string> => {
  const counts = countLabels(labels);
  const duplicates = new Set<string>();
  for (const [label, count] of counts) {
    if (count > 1) {
      duplicates.add(label);
    }
  }
  return duplicates;
};

/**
 * Short labels for day-view column headers. Full names stay in tooltips and a11y.
 * Email calendars use the local part unless that collides, then the domain stem.
 */
export const dayCalendarColumnDisplayNames = (
  names: readonly string[],
): string[] => {
  const emails = names.map(parseEmailCalendarName);
  let labels = names.map((name) => defaultDayCalendarColumnDisplayName(name));

  let duplicates = duplicateLabelKeys(labels);
  if (duplicates.size === 0) {
    return labels;
  }

  labels = labels.map((label, index) => {
    if (!duplicates.has(label)) {
      return label;
    }
    const email = emails[index];
    if (!email) {
      return label;
    }
    return emailDomainStem(email.domain);
  });

  duplicates = duplicateLabelKeys(labels);
  if (duplicates.size === 0) {
    return labels;
  }

  return labels.map((label, index) => {
    if (!duplicates.has(label)) {
      return label;
    }
    const email = emails[index];
    if (!email) {
      return label;
    }
    const domainParts = email.domain
      .trim()
      .toLowerCase()
      .split(".")
      .filter(Boolean);
    const domainHint =
      domainParts.length >= 3 ? domainParts[0] : emailDomainStem(email.domain);
    return `${email.local}@${domainHint}`;
  });
};

export const formatDayCalendarColumnDisplayName = (name: string): string =>
  dayCalendarColumnDisplayNames([name])[0] ?? name.trim();
