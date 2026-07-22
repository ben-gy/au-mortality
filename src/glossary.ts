// Every piece of jargon this dataset forces on a reader, defined in plain
// English. Assume the reader knows nothing: most people arrive here after a
// local news story, not from a public-health degree.

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  asr: {
    term: 'Age-standardised rate',
    definition:
      'A death rate adjusted so that every region is compared as though it had the same age structure as a standard population. Without this, a retirement town always looks deadly and a mining town always looks healthy — because older people die more often, wherever they live. This is the only fair way to compare mortality between places.',
  },
  crude: {
    term: 'Crude rate',
    definition:
      'Deaths divided by population, with no adjustment for age. Easy to compute and almost always misleading when comparing regions: it mostly measures how old a place is. Bribie Island has one of the highest crude death rates in Australia and one of the lowest age-standardised rates.',
  },
  pad: {
    term: 'Potentially avoidable death',
    definition:
      'A death before age 75 from a cause that could potentially have been avoided — either prevented (through public health measures, or by reducing smoking, alcohol and road trauma) or treated (through timely and effective healthcare). It is a measure of the health system and its context, not of any individual. Nationally about half of all deaths under 75 fall into this category.',
  },
  premature: {
    term: 'Premature death',
    definition:
      'A death occurring before age 75. The threshold is a convention used by the AIHW and the OECD so that "dying early" means the same thing in every region.',
  },
  pyll: {
    term: 'Potential years of life lost',
    definition:
      'For every death before 75, the number of years between the age at death and 75, added up. A death at 25 contributes 50 years; a death at 70 contributes 5. It weights mortality by how early it happens, so it surfaces places losing young people even when their total death count is small.',
  },
  medianAge: {
    term: 'Median age at death',
    definition:
      'The age at which half of a region’s deaths happen before, and half after. It is NOT life expectancy: a region full of young workers has few elderly residents to die old, so its median age at death is pulled down by who lives there as much as by how long people live.',
  },
  rateRatio: {
    term: 'Rate ratio',
    definition:
      'A region’s age-standardised rate divided by the national rate. 1.00 means exactly the national average; 1.50 means 50% higher; 0.80 means 20% lower.',
  },
  sa3: {
    term: 'SA3 region',
    definition:
      'Statistical Area Level 3 — an ABS geography of roughly 30,000 to 130,000 people, usually a group of suburbs or a whole regional town and its surrounds. There are 342 of them covering all of Australia. Big enough for mortality rates to be stable, small enough to be local.',
  },
  lga: {
    term: 'Local government area',
    definition:
      'A council area. Familiar to residents, but they vary enormously in size — from a few hundred people to over a million — so small ones have unstable rates.',
  },
  phn: {
    term: 'Primary Health Network',
    definition:
      'One of 31 regions used to commission and coordinate primary healthcare in Australia. The unit health planners actually work in.',
  },
  remoteness: {
    term: 'Remoteness area',
    definition:
      'The ABS classification of how far a place is from services, in five steps from Major Cities to Very Remote. It is based on road distance to service centres, not population density.',
  },
  seg: {
    term: 'Socioeconomic group',
    definition:
      'Areas ranked by relative disadvantage (the ABS index of education, income, occupation and housing) and split into five equal groups. Quintile 1 is the most disadvantaged fifth of areas, Quintile 5 the least.',
  },
  suppressed: {
    term: 'Not published',
    definition:
      'Where a population is too small for a rate to be reliable or for the data to stay confidential, the AIHW withholds it. A withheld value is not zero — it is unknown. This site leaves those regions blank rather than guessing, because treating them as zero would rank the smallest and most remote communities as the healthiest in Australia.',
  },
  icd: {
    term: 'ICD-10 code',
    definition:
      'The World Health Organization’s International Classification of Diseases, 10th revision — the standard code assigned to each cause of death. "I20–I25" is coronary heart disease.',
  },
  standardPopulation: {
    term: 'Standard population',
    definition:
      'The reference age structure that all regions are adjusted to. The AIHW uses the Australian population as at 30 June 2001, which is why the standardised rates look a little different from raw death rates.',
  },
};

let popover: HTMLDivElement | null = null;

function ensurePopover(): HTMLDivElement {
  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'glossary-popover';
    popover.setAttribute('role', 'dialog');
    popover.hidden = true;
    document.body.appendChild(popover);
  }
  return popover;
}

export function hideGlossary(): void {
  if (popover) popover.hidden = true;
}

function show(anchor: Element, key: string): void {
  const entry = GLOSSARY[key];
  if (!entry) return;
  const el = ensurePopover();
  el.innerHTML = '';
  const h = document.createElement('h4');
  h.textContent = entry.term;
  const p = document.createElement('p');
  p.textContent = entry.definition;
  const close = document.createElement('button');
  close.className = 'glossary-close';
  close.setAttribute('aria-label', 'Close definition');
  close.textContent = '×';
  close.addEventListener('click', hideGlossary);
  el.append(close, h, p);
  el.hidden = false;

  // Position near the anchor, flipped away from the viewport edges.
  const r = anchor.getBoundingClientRect();
  const pr = el.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 8;
  if (left + pr.width + 12 > window.innerWidth) left = window.innerWidth - pr.width - 12;
  if (top + pr.height + 12 > window.innerHeight) top = Math.max(12, r.top - pr.height - 8);
  el.style.left = `${Math.max(12, left)}px`;
  el.style.top = `${top}px`;
}

/**
 * Delegated: any element carrying data-term opens its definition. Click
 * anywhere else, or press Escape, to dismiss.
 */
export function initGlossary(): void {
  document.addEventListener('click', (e) => {
    const t = (e.target as Element | null)?.closest?.('[data-term]');
    if (t) {
      e.preventDefault();
      e.stopPropagation();
      const key = t.getAttribute('data-term') ?? '';
      if (popover && !popover.hidden && popover.dataset.key === key) {
        hideGlossary();
        return;
      }
      show(t, key);
      if (popover) popover.dataset.key = key;
      return;
    }
    if (popover && !popover.hidden && !(e.target as Element).closest('.glossary-popover')) {
      hideGlossary();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideGlossary();
  });
}

/** Inline jargon marker: the term plus a click-to-define info affordance. */
export function term(key: string, label?: string): string {
  const entry = GLOSSARY[key];
  const text = label ?? entry?.term ?? key;
  return `<span class="glossary-link" data-term="${key}" tabindex="0" role="button" aria-label="What is ${
    entry?.term ?? key
  }?">${text}<span class="glossary-icon" aria-hidden="true">i</span></span>`;
}
