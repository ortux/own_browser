import type { FilterRule } from './FilterRule';
import type { ResourceType } from './RequestContext';

const supportedResourceTypes = new Set<ResourceType>([
  'main_frame', 'sub_frame', 'script', 'stylesheet', 'image', 'font',
  'media', 'websocket', 'xhr', 'fetch', 'other',
]);

function tokensFor(pattern: string): string[] {
  return [...new Set(pattern
    .replace(/[^a-z0-9]/gi, ' ')
    .split(' ')
    .filter((part) => part.length >= 3)
    .map((part) => part.toLowerCase()))]
    .sort((left, right) => right.length - left.length)
    .slice(0, 4);
}

function parseRegex(value: string): { source: string; flags: string } | null {
  if (!value.startsWith('/') || value.length < 3) return null;
  const end = value.lastIndexOf('/');
  if (end <= 0) return null;
  const source = value.slice(1, end);
  const flags = value.slice(end + 1);
  if (!/^[imsuy]*$/.test(flags) || new Set(flags).size !== flags.length) return null;
  if (source.length > 1024 || /\([^)]*[+*][^)]*\)[+*]/.test(source) || /\.\*.*\.\*/.test(source)) {
    return null;
  }
  try {
    new RegExp(source, flags);
    return { source, flags };
  } catch {
    return null;
  }
}

export function parseRule(rawInput: string): FilterRule | null {
  const raw = rawInput.trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('#') || raw.includes('##')) return null;

  let value = raw;
  const exception = value.startsWith('@@');
  if (exception) value = value.slice(2);

  const optionIndex = value.indexOf('$');
  const patternValue = optionIndex === -1 ? value : value.slice(0, optionIndex);
  const options = optionIndex === -1 ? [] : value.slice(optionIndex + 1).split(',').filter(Boolean);
  if (!patternValue) return null;

  const domains: string[] = [];
  const excludedDomains: string[] = [];
  const resourceTypes: ResourceType[] = [];
  let thirdParty: boolean | undefined;
  let firstParty: boolean | undefined;
  let important = false;

  for (const option of options) {
    if (supportedResourceTypes.has(option as ResourceType)) {
      resourceTypes.push(option as ResourceType);
    } else if (option === 'third-party') {
      thirdParty = true;
    } else if (option === '~third-party') {
      firstParty = true;
    } else if (option === 'important') {
      important = true;
    } else if (option === 'badfilter') {
      return null;
    } else if (option.startsWith('domain=')) {
      for (const domain of option.slice(7).split('|')) {
        if (!domain) continue;
        (domain.startsWith('~') ? excludedDomains : domains).push(domain.replace(/^~/, '').toLowerCase());
      }
    }
  }

  const isAnchoredDomain = patternValue.startsWith('||') && patternValue.endsWith('^');
  const isPlainDomain = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(patternValue);
  const regex = !isAnchoredDomain && !isPlainDomain ? parseRegex(patternValue) : null;
  if (patternValue.startsWith('/') && !regex) return null;
  const domainPattern = isAnchoredDomain || isPlainDomain;
  const pattern = isAnchoredDomain
    ? patternValue.slice(2, -1).toLowerCase()
    : patternValue.replace(/^\|\|/, '').replace(/\^$/, '').toLowerCase();

  return {
    raw,
    pattern,
    exception,
    important,
    domainPattern,
    domains,
    excludedDomains,
    resourceTypes,
    thirdParty,
    firstParty,
    tokens: tokensFor(regex?.source ?? pattern),
    regexSource: regex?.source,
    regexFlags: regex?.flags,
  };
}

function withoutBadfilter(raw: string): string {
  const index = raw.indexOf('$');
  if (index === -1) return raw;
  const options = raw.slice(index + 1).split(',').filter((option) => option !== 'badfilter');
  return options.length > 0 ? `${raw.slice(0, index)}$${options.join(',')}` : raw.slice(0, index);
}

export function parseRules(text: string): FilterRule[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const disabled = new Set(
    lines
      .filter((line) => /(?:^|,)badfilter(?:,|$)/.test(line.slice(line.indexOf('$') + 1)))
      .map((line) => withoutBadfilter(line))
  );
  const rules: FilterRule[] = [];
  for (const line of lines) {
    if (disabled.has(line)) continue;
    const rule = parseRule(line);
    if (rule) rules.push(rule);
  }
  return rules;
}
