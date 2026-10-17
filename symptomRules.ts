/**
 * Pet Symptom Checker — pure rule engine.
 *
 * Everything here is deterministic, species-aware triage GUIDANCE, never a
 * diagnosis. Urgency levels:
 *   monitor   → "Monitor at home"
 *   vet24h    → "See a vet within 24 hours"
 *   vetToday  → "See a vet today"
 *   emergency → "EMERGENCY — seek care immediately"
 *
 * A visible disclaimer is exported for the UI and is part of every result.
 */

export type CheckerSpecies = 'dog' | 'cat' | 'bird' | 'rabbit' | 'other';
export type DurationId = 'lt12h' | 'h24' | 'd2_3' | 'gt3d';
export type SeverityId = 'mild' | 'moderate' | 'severe';
export type UrgencyLevel = 'monitor' | 'vet24h' | 'vetToday' | 'emergency';

export interface SymptomGuidance {
  /** General, careful wording — "can have several causes", never a diagnosis. */
  whatItCanMean: string;
  /** Safe home-care steps only. */
  homeSteps: string[];
  /** Signs that should trigger an immediate vet visit. */
  watchFor: string[];
}

export interface SymptomDef {
  id: string;
  label: string;
  redFlag: boolean;
  /** Which species show this symptom (base six are on all). */
  species: CheckerSpecies[];
  guidance: SymptomGuidance;
}

const SPECIES_LABEL: Record<CheckerSpecies, string> = {
  dog: 'dog',
  cat: 'cat',
  bird: 'bird',
  rabbit: 'rabbit',
  other: 'pet',
};

/* ---------------- Symptom catalog ---------------- */

const sharedRespiratory: SymptomGuidance = {
  whatItCanMean:
    'Sneezing can have several causes, from mild irritation to respiratory infection.',
  homeSteps: [
    'Keep the pet warm and away from dust, smoke and strong scents.',
    'Make sure fresh water is always available.',
    'Note how often the sneezing happens and whether discharge appears.',
  ],
  watchFor: ['Continuous sneezing', 'Eye or nose discharge', 'Loss of appetite'],
};

const eyeDischargeGuidance: SymptomGuidance = {
  whatItCanMean:
    'Eye discharge can have several causes, including irritation or infection.',
  homeSteps: [
    'Gently wipe the outer eye with a clean damp cloth — never touch the eyeball.',
    'Use a separate cloth for each eye.',
    'Keep the pet from rubbing the eye.',
  ],
  watchFor: ['Swollen or half-closed eye', 'Cloudy or bloody discharge', 'Vision seems affected'],
};

export const SYMPTOMS: Record<string, SymptomDef> = {
  'appetite-loss': {
    id: 'appetite-loss',
    label: 'Loss of Appetite',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Loss of appetite can have several causes, from stress or a change in food to an underlying health issue.',
      homeSteps: [
        'Offer fresh food and clean water; try a favorite, easily digestible meal.',
        'Keep the feeding area calm and quiet.',
        'Track exactly what and how much is eaten, and water intake.',
      ],
      watchFor: [
        'No eating at all for more than a day',
        'Vomiting or diarrhea alongside the appetite loss',
        'Lethargy or weight loss',
      ],
    },
  },
  vomiting: {
    id: 'vomiting',
    label: 'Vomiting',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Vomiting can have several causes, including eating too fast, mild stomach upset, or something more serious.',
      homeSteps: [
        'Withhold food briefly (a few hours), then offer small amounts of bland food.',
        'Always keep fresh water available; encourage small sips.',
        'Rest the pet and avoid treats or rich food for a day.',
      ],
      watchFor: [
        'Repeated vomiting over many hours',
        'Blood in vomit or dark, coffee-ground appearance',
        'Abdominal swelling or severe lethargy',
      ],
    },
  },
  diarrhea: {
    id: 'diarrhea',
    label: 'Diarrhea',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Diarrhea can have several causes, from a sudden diet change to intestinal upset.',
      homeSteps: [
        'Offer small, frequent bland meals and plenty of fresh water.',
        'Keep the pet clean and comfortable; clean any soiling promptly.',
        'Note frequency, color and whether there is blood.',
      ],
      watchFor: [
        'Bloody or black stools',
        'Diarrhea lasting more than a day with no improvement',
        'Signs of dehydration (dry gums, sunken eyes, lethargy)',
      ],
    },
  },
  coughing: {
    id: 'coughing',
    label: 'Coughing',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Coughing can have several causes, from throat irritation to respiratory issues.',
      homeSteps: [
        'Keep the pet calm — excitement can worsen coughing.',
        'Avoid smoke, dust and strong fragrances.',
        'Use a harness instead of a collar for dogs that pull.',
      ],
      watchFor: ['Persistent or worsening cough', 'Coughing up blood', 'Difficulty breathing'],
    },
  },
  lethargy: {
    id: 'lethargy',
    label: 'Lethargy',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Lethargy can have several causes — it is the body signaling that something is off.',
      homeSteps: [
        'Let the pet rest in a quiet, comfortable spot.',
        'Check whether food, water and bathroom habits are normal.',
        'Take a temperature if you know how to do it safely for the species.',
      ],
      watchFor: [
        'Cannot stand or move normally',
        'Refuses food and water',
        'Rapid breathing or pale gums',
      ],
    },
  },
  'skin-irritation': {
    id: 'skin-irritation',
    label: 'Skin Irritation',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Skin irritation can have several causes, including allergies, parasites or contact with an irritant.',
      homeSteps: [
        'Prevent scratching or biting the area — a cone collar helps.',
        'Check for fleas, ticks or red spots in the fur.',
        'Do not apply human creams or oils without vet advice.',
      ],
      watchFor: ['Spreading redness or swelling', 'Open sores or bad smell', 'Hair loss in patches'],
    },
  },
  'urinary-strain': {
    id: 'urinary-strain',
    label: 'Straining or Unable to Urinate',
    redFlag: true,
    species: ['cat', 'dog', 'other'],
    guidance: {
      whatItCanMean:
        'Straining or inability to urinate can be a sign of a urinary blockage — this is a veterinary emergency, especially in male cats.',
      homeSteps: [
        'Do not wait and watch — contact a veterinarian immediately.',
        'Keep the pet calm and prevent further straining.',
        'Note when the pet last urinated normally.',
      ],
      watchFor: ['Crying in the litter box', 'Repeated trips with little or no urine', 'Bloated or painful belly'],
    },
  },
  'excessive-thirst': {
    id: 'excessive-thirst',
    label: 'Excessive Thirst',
    redFlag: false,
    species: ['cat', 'dog', 'other'],
    guidance: {
      whatItCanMean:
        'Drinking much more than usual can have several causes, including dietary or metabolic changes.',
      homeSteps: [
        'Always keep fresh water available — never restrict water.',
        'Measure roughly how much is drunk per day.',
        'Note any changes in appetite, urination or energy.',
      ],
      watchFor: ['Sudden dramatic increase in drinking', 'Weight loss alongside thirst', 'Lethargy or vomiting'],
    },
  },
  hiding: {
    id: 'hiding',
    label: 'Hiding / Withdrawn Behavior',
    redFlag: false,
    species: ['cat', 'other'],
    guidance: {
      whatItCanMean:
        'Hiding can have several causes — cats often withdraw when they feel unwell or stressed.',
      homeSteps: [
        'Give the cat a safe, quiet hiding spot with food and water nearby.',
        'Avoid forcing interaction.',
        'Check food and litter box use — reduced use is a warning sign.',
      ],
      watchFor: ['Not eating for over a day', 'Avoiding the litter box', 'Aggression when touched'],
    },
  },
  bloating: {
    id: 'bloating',
    label: 'Swollen / Hard Belly (Bloat)',
    redFlag: false,
    species: ['dog', 'other'],
    guidance: {
      whatItCanMean:
        'A swollen, hard belly can have several causes — combined with retching it can signal a dangerous twisting of the stomach in dogs.',
      homeSteps: [
        'Do not feed or offer water until a vet has been consulted.',
        'Keep the dog still and calm.',
        'Watch the belly and breathing closely.',
      ],
      watchFor: ['Retching without bringing anything up', 'Restlessness and pacing', 'Drooling with a tight belly'],
    },
  },
  retching: {
    id: 'retching',
    label: 'Retching Without Vomiting',
    redFlag: false,
    species: ['dog', 'other'],
    guidance: {
      whatItCanMean:
        'Repeated retching without producing anything can have several causes — with a swollen belly it is an emergency sign in dogs.',
      homeSteps: [
        'Check whether the belly is hard or swollen.',
        'Keep the dog calm and do not feed.',
        'Time how long the retching continues.',
      ],
      watchFor: ['Hard, swollen belly alongside the retching', 'Collapse or extreme restlessness', 'Pale gums'],
    },
  },
  limping: {
    id: 'limping',
    label: 'Limping',
    redFlag: false,
    species: ['dog', 'cat', 'other'],
    guidance: {
      whatItCanMean: 'Limping can have several causes, from a minor sprain to a paw injury.',
      homeSteps: [
        'Restrict running and jumping for a day or two.',
        'Check the paw pads for cuts, thorns or swelling.',
        'Apply a cold compress gently if there is swelling.',
      ],
      watchFor: ['Cannot bear any weight on the leg', 'Visible swelling or deformity', 'Limping persists beyond 48 hours'],
    },
  },
  drooling: {
    id: 'drooling',
    label: 'Excessive Drooling',
    redFlag: false,
    species: ['dog', 'cat', 'other'],
    guidance: {
      whatItCanMean:
        'Excessive drooling can have several causes, from mouth irritation to nausea.',
      homeSteps: [
        'Check the mouth gently for stuck objects or redness.',
        'Offer fresh water.',
        'Keep the pet calm and observe breathing.',
      ],
      watchFor: ['Swollen face or mouth', 'Drooling with retching or bloat signs', 'Difficulty swallowing'],
    },
  },
  'fluffed-feathers': {
    id: 'fluffed-feathers',
    label: 'Fluffed-Up Feathers',
    redFlag: false,
    species: ['bird'],
    guidance: {
      whatItCanMean:
        'A bird sitting fluffed up can have several causes — birds hide illness, so fluffed feathers with inactivity is a warning sign.',
      homeSteps: [
        'Keep the bird warm (away from drafts) and quiet.',
        'Make sure food and water are within easy reach.',
        'Watch droppings and whether it is still eating.',
      ],
      watchFor: ['Sitting at the cage bottom', 'Tail bobbing with each breath', 'Discharge from eyes or nostrils'],
    },
  },
  'tail-bobbing': {
    id: 'tail-bobbing',
    label: 'Tail Bobbing / Open-Mouth Breathing',
    redFlag: false,
    species: ['bird'],
    guidance: {
      whatItCanMean:
        'Tail bobbing or open-mouth breathing can signal respiratory difficulty in birds — birds need prompt care for breathing signs.',
      homeSteps: [
        'Minimize handling and stress immediately.',
        'Keep the environment warm and humidified if possible.',
        'Avoid aerosol sprays, candles and non-stick fumes.',
      ],
      watchFor: ['Open-beak breathing at rest', 'Clicking or wheezing sounds', 'Discharge from nostrils'],
    },
  },
  'no-eating-no-droppings': {
    id: 'no-eating-no-droppings',
    label: 'Not Eating + No Droppings',
    redFlag: true,
    species: ['rabbit'],
    guidance: {
      whatItCanMean:
        'A rabbit that stops eating and stops producing droppings may have gastrointestinal stasis — this is an emergency in rabbits.',
      homeSteps: [
        'Contact a rabbit-savvy veterinarian immediately — do not wait.',
        'Keep the rabbit warm and gently offer hay.',
        'Note when it last ate and produced droppings.',
      ],
      watchFor: ['Hunched posture and grinding teeth', 'Bloating of the belly', 'Complete inactivity'],
    },
  },
  'head-tilt': {
    id: 'head-tilt',
    label: 'Head Tilt',
    redFlag: false,
    species: ['rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'A head tilt can have several causes, including ear infection or neurological issues.',
      homeSteps: [
        'Keep the pet in a safe, padded space to prevent injury.',
        'Note whether the tilt came on suddenly.',
        'Offer food and water within easy reach.',
      ],
      watchFor: ['Rolling or unable to stay upright', 'Loss of balance', 'Rapid worsening'],
    },
  },
  sneezing: {
    id: 'sneezing',
    label: 'Sneezing',
    redFlag: false,
    species: ['cat', 'dog', 'bird', 'rabbit', 'other'],
    guidance: sharedRespiratory,
  },
  'eye-discharge': {
    id: 'eye-discharge',
    label: 'Eye Discharge',
    redFlag: false,
    species: ['cat', 'dog', 'bird', 'rabbit', 'other'],
    guidance: eyeDischargeGuidance,
  },
  'weight-loss': {
    id: 'weight-loss',
    label: 'Weight Loss',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Unexplained weight loss can have several causes and always deserves a veterinary check.',
      homeSteps: [
        'Weigh the pet regularly and record the numbers.',
        'Check that it is actually eating its meals.',
        'Review the diet for recent changes.',
      ],
      watchFor: ['Rapid or continued loss', 'Loss despite eating normally', 'Lethargy with the weight loss'],
    },
  },
  'fever-signs': {
    id: 'fever-signs',
    label: 'Fever Signs (warm ears, shivering)',
    redFlag: false,
    species: ['dog', 'cat', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Fever signs can have several causes — fever is the body fighting something off.',
      homeSteps: [
        'Keep the pet comfortable and hydrated.',
        'Do not give human fever medicines — many are toxic to pets.',
        'Note appetite and energy changes.',
      ],
      watchFor: ['Refusal to eat or drink', 'Very hot ears with lethargy', 'Shivering that does not stop'],
    },
  },
  'loss-of-balance': {
    id: 'loss-of-balance',
    label: 'Loss of Balance',
    redFlag: false,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Loss of balance can have several causes, from ear problems to weakness.',
      homeSteps: [
        'Keep the pet away from stairs and edges.',
        'Observe whether it is one-sided or general clumsiness.',
        'Note any head tilt or eye movement.',
      ],
      watchFor: ['Falls over repeatedly', 'Cannot stand at all', 'Sudden onset with disorientation'],
    },
  },
  seizure: {
    id: 'seizure',
    label: 'Seizure',
    redFlag: true,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Seizures can have several causes — any seizure is an emergency that needs a veterinarian.',
      homeSteps: [
        'Stay calm. Clear nearby objects so the pet cannot hurt itself.',
        'Do not hold the pet down or put anything in its mouth.',
        'Time the seizure and contact a veterinarian immediately.',
      ],
      watchFor: ['Seizure lasting more than a few minutes', 'Repeated seizures in one day', 'Not recovering normally'],
    },
  },
  bleeding: {
    id: 'bleeding',
    label: 'Uncontrolled Bleeding',
    redFlag: true,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Uncontrolled bleeding is always an emergency — apply first aid and get to a vet immediately.',
      homeSteps: [
        'Apply firm, steady pressure with a clean cloth or bandage.',
        'Keep the pet still and calm.',
        'Head to the nearest veterinarian or emergency clinic now.',
      ],
      watchFor: ['Bleeding that does not slow with pressure', 'Blood from nose or mouth', 'Signs of shock (pale gums, collapse)'],
    },
  },
  poisoning: {
    id: 'poisoning',
    label: 'Suspected Poisoning',
    redFlag: true,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Suspected poisoning is always an emergency — fast action saves lives.',
      homeSteps: [
        'Remove the pet from the source of the suspected poison.',
        'Do NOT induce vomiting unless a veterinarian instructs you to.',
        'Bring the suspected product or packaging to the clinic.',
      ],
      watchFor: ['Vomiting with tremors or drooling', 'Collapse or seizures', 'Difficulty breathing'],
    },
  },
  'breathing-difficulty': {
    id: 'breathing-difficulty',
    label: 'Difficulty Breathing',
    redFlag: true,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean:
        'Difficulty breathing is always an emergency — this cannot wait.',
      homeSteps: [
        'Keep the pet calm and still; stress makes breathing harder.',
        'Ensure the airway is clear and the area is well ventilated.',
        'Go to the nearest veterinarian or emergency clinic immediately.',
      ],
      watchFor: ['Blue or pale gums', 'Open-mouth breathing at rest', 'Gasping or noisy breathing'],
    },
  },
  collapse: {
    id: 'collapse',
    label: 'Collapse / Unconscious',
    redFlag: true,
    species: ['dog', 'cat', 'bird', 'rabbit', 'other'],
    guidance: {
      whatItCanMean: 'Collapse is always an emergency — get veterinary help immediately.',
      homeSteps: [
        'Check breathing and keep the airway clear.',
        'Keep the pet warm and still.',
        'Transport to the nearest veterinarian or emergency clinic at once.',
      ],
      watchFor: ['Not breathing normally', 'No response when called', 'Stiff or limp body'],
    },
  },
};

/* ---------------- Symptom selection ---------------- */

export function symptomsForSpecies(species: CheckerSpecies): SymptomDef[] {
  return Object.values(SYMPTOMS).filter((s) => s.species.includes(species));
}

export const DURATION_OPTIONS: { id: DurationId; label: string }[] = [
  { id: 'lt12h', label: 'Less than 12 hours' },
  { id: 'h24', label: 'About 24 hours' },
  { id: 'd2_3', label: '2–3 days' },
  { id: 'gt3d', label: 'More than 3 days' },
];

export const SEVERITY_OPTIONS: { id: SeverityId; label: string; hint: string }[] = [
  { id: 'mild', label: 'Mild', hint: 'Noticeable but the pet still eats, drinks and moves normally' },
  {
    id: 'moderate',
    label: 'Moderate',
    hint: 'Clearly unwell — reduced appetite or activity',
  },
  {
    id: 'severe',
    label: 'Severe',
    hint: 'Very unwell — barely eats, moves little, or seems in distress',
  },
];

/* ---------------- Urgency evaluation ---------------- */

const RED_FLAG_COMBOS: { ids: string[]; reason: string }[] = [
  {
    ids: ['bloating', 'retching'],
    reason: 'Swollen hard belly with retching can signal a life-threatening stomach twist in dogs.',
  },
];

export interface PerSymptomResult {
  id: string;
  label: string;
  guidance: SymptomGuidance;
}

export interface CheckInput {
  species: CheckerSpecies;
  petName: string;
  symptomIds: string[];
  duration: DurationId;
  severity: SeverityId;
  /**
   * Phase-2 hook: optional photo/video AI-observation note. Unused by the
   * current engine and UI — reserved so a future add-on can attach an
   * observation note to a check without a data migration.
   */
  photoNote?: string;
}

export interface CheckResult {
  urgency: UrgencyLevel;
  urgencyLabel: string;
  isEmergency: boolean;
  emergencyReasons: string[];
  symptoms: PerSymptomResult[];
  summaryGuidance: string;
  disclaimer: string;
  /** Copy shown under every result — never a diagnosis. */
  vetRecommendation: string;
  /**
   * Phase-2 hook: optional photo/video AI-observation note (passed through
   * from input). Unused for now.
   */
  photoNote?: string;
}

export const DISCLAIMER =
  'This tool provides general guidance only and is not a diagnosis. It is not a substitute for a veterinarian. ' +
  'If your pet has emergency signs — a cat that cannot urinate, difficulty breathing, or suspected poisoning — ' +
  'seek veterinary care immediately.';

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  monitor: 'Monitor at home',
  vet24h: 'See a vet within 24 hours',
  vetToday: 'See a vet today',
  emergency: 'EMERGENCY — seek care immediately',
};

export function urgencyLabel(level: UrgencyLevel): string {
  return URGENCY_LABELS[level];
}

const durationLabel = (d: DurationId): string =>
  DURATION_OPTIONS.find((o) => o.id === d)?.label ?? d;

export function evaluateCheck(input: CheckInput): CheckResult {
  const { species, petName, symptomIds, duration, severity } = input;
  const petWord = SPECIES_LABEL[species] ?? 'pet';
  const name = petName?.trim() || `your ${petWord}`;

  const defs = symptomIds
    .map((id) => SYMPTOMS[id])
    .filter((d): d is SymptomDef => Boolean(d));

  // --- Emergency detection ---
  const emergencyReasons: string[] = [];
  for (const d of defs) {
    if (d.redFlag) emergencyReasons.push(d.guidance.whatItCanMean);
  }
  for (const combo of RED_FLAG_COMBOS) {
    if (combo.ids.every((id) => symptomIds.includes(id))) {
      emergencyReasons.push(combo.reason);
    }
  }

  let urgency: UrgencyLevel;
  if (emergencyReasons.length > 0) {
    urgency = 'emergency';
  } else if (defs.length === 0) {
    urgency = 'monitor';
  } else {
    let score = 0;
    if (severity === 'moderate') score += 1;
    if (severity === 'severe') score += 3;
    if (duration === 'd2_3') score += 1;
    if (duration === 'gt3d') score += 2;
    if (defs.length >= 3) score += 1;
    const hasV = symptomIds.includes('vomiting');
    const hasD = symptomIds.includes('diarrhea');
    const hasL = symptomIds.includes('lethargy');
    if (hasV && hasD && hasL) score += 2;
    else if ((hasV && hasD) || (hasV && hasL) || (hasD && hasL)) score += 1;

    if (score >= 4) urgency = 'vetToday';
    else if (score >= 2) urgency = 'vet24h';
    else urgency = 'monitor';

    // Hard escalations regardless of score
    if (severity === 'severe') urgency = 'vetToday'; // severe always means "see a vet today" (red flags go above to emergency)
    if (duration === 'gt3d' && urgency === 'monitor') urgency = 'vet24h';
  }

  // --- Summary guidance (general wording, never a diagnosis) ---
  const firstLabel = defs[0]?.label.toLowerCase() ?? 'these signs';
  let summaryGuidance: string;
  if (defs.length === 0) {
    summaryGuidance = `No symptoms were selected for ${name}. If you are still worried about ${name}, watch for any changes and contact a veterinarian.`;
  } else if (urgency === 'emergency') {
    summaryGuidance =
      `${name} is showing signs that can be an emergency. Do not wait to see if it improves — ` +
      `contact a veterinarian or an emergency clinic immediately and describe the symptoms you selected.`;
  } else if (defs.length === 1) {
    summaryGuidance =
      `${defs[0].label} can have several causes. Monitor ${name}'s condition and contact a veterinarian promptly, ` +
      `especially if other symptoms appear or the condition persists.`;
  } else {
    const rest = defs
      .slice(1)
      .map((d) => d.label.toLowerCase())
      .join(', ');
    summaryGuidance =
      `${firstLabel.charAt(0).toUpperCase() + firstLabel.slice(1)}${rest ? ` together with ${rest}` : ''} ` +
      `can have several causes. Monitor ${name}'s condition over the next ${durationLabel(duration).toLowerCase()} ` +
      `and contact a veterinarian promptly, especially if symptoms worsen or new ones appear.`;
  }

  return {
    urgency,
    urgencyLabel: URGENCY_LABELS[urgency],
    isEmergency: urgency === 'emergency',
    emergencyReasons,
    symptoms: defs.map((d) => ({ id: d.id, label: d.label, guidance: d.guidance })),
    summaryGuidance,
    disclaimer: DISCLAIMER,
    vetRecommendation:
      urgency === 'emergency'
        ? 'Skip the wait — take your pet to a veterinarian or emergency clinic now. You can find clinics in the Services directory.'
        : urgency === 'monitor'
          ? 'A check-up is still a good idea if anything changes. You can book a routine visit from Pet Care & Vets.'
          : 'Contact a veterinarian as advised above. You can book an appointment from Pet Care & Vets or find clinics in the Services directory.',
    photoNote: input.photoNote,
  };
}

/* ---------------- History ---------------- */

export interface SymptomCheckHistoryEntry {
  id: string;
  ts: number;
  userId: string;
  petName: string;
  species: CheckerSpecies;
  symptomIds: string[];
  symptomLabels: string[];
  duration: DurationId;
  severity: SeverityId;
  urgency: UrgencyLevel;
  urgencyLabel: string;
  /**
   * Phase-2 hook: optional photo/video AI-observation note. Unused for now —
   * reserved so a future add-on can attach an observation note to a check
   * without a data migration.
   */
  photoNote?: string;
}

export function historyKeyFor(userId: string | null | undefined): string {
  return `pawmatch_symptom_history_${userId || 'guest'}`;
}

export function loadSymptomHistory(userId: string | null | undefined): SymptomCheckHistoryEntry[] {
  try {
    const raw = localStorage.getItem(historyKeyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSymptomHistory(
  userId: string | null | undefined,
  entries: SymptomCheckHistoryEntry[],
): void {
  try {
    localStorage.setItem(historyKeyFor(userId), JSON.stringify(entries));
  } catch {
    /* storage full — history stays in memory */
  }
}

export function addSymptomHistoryEntry(
  userId: string | null | undefined,
  entry: Omit<SymptomCheckHistoryEntry, 'id' | 'ts' | 'userId'>,
): SymptomCheckHistoryEntry[] {
  const full: SymptomCheckHistoryEntry = {
    ...entry,
    id: `sym-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    ts: Date.now(),
    userId: userId || 'guest',
  };
  const entries = [full, ...loadSymptomHistory(userId)];
  saveSymptomHistory(userId, entries);
  return entries;
}

export function deleteSymptomHistoryEntry(
  userId: string | null | undefined,
  id: string,
): SymptomCheckHistoryEntry[] {
  const entries = loadSymptomHistory(userId).filter((e) => e.id !== id);
  saveSymptomHistory(userId, entries);
  return entries;
}

export function clearSymptomHistory(userId: string | null | undefined): SymptomCheckHistoryEntry[] {
  saveSymptomHistory(userId, []);
  return [];
}
