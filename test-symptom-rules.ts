/**
 * Symptom Checker rule-engine unit tests (run with tsx). Pure functions — no Supabase.
 *   npx tsx scripts/test-symptom-rules.ts
 * Covers red-flag emergency detection, the escalation matrix, species-specific
 * symptom lists, Maruf's example end to end, the safety disclaimer, and the
 * phase-2 photoNote hook.
 */
import {
  evaluateCheck,
  symptomsForSpecies,
  urgencyLabel,
  DISCLAIMER,
  DURATION_OPTIONS,
  SEVERITY_OPTIONS,
} from '../src/lib/symptomRules.js';
import type { CheckInput, UrgencyLevel } from '../src/lib/symptomRules.js';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failures++;
};

const ev = (
  species: CheckInput['species'],
  symptomIds: string[],
  duration: CheckInput['duration'],
  severity: CheckInput['severity'],
  petName = 'TestPet',
) =>
  evaluateCheck({ species, petName, symptomIds, duration, severity });

const ids = (s: string) => symptomsForSpecies(s).map((x) => x.id);

// ---------- Species-specific lists ----------
const baseSix = ['appetite-loss', 'vomiting', 'diarrhea', 'coughing', 'lethargy', 'skin-irritation'];
for (const sp of ['dog', 'cat', 'bird', 'rabbit', 'other'] as const) {
  check(`${sp} list contains the base six`, baseSix.every((id) => ids(sp).includes(id)));
}
check('bird list has bird-specific items', ['fluffed-feathers', 'tail-bobbing'].every((id) => ids('bird').includes(id)));
check('bird list excludes cat urinary item', !ids('bird').includes('urinary-strain'));
check('cat list has urinary item', ids('cat').includes('urinary-strain'));
check('cat list has hiding + excessive-thirst', ['hiding', 'excessive-thirst'].every((id) => ids('cat').includes(id)));
check('dog list has bloating/limping/drooling', ['bloating', 'retching', 'limping', 'drooling'].every((id) => ids('dog').includes(id)));
check('rabbit list has head-tilt + GI-stasis item', ['head-tilt', 'no-eating-no-droppings'].every((id) => ids('rabbit').includes(id)));
check('shared symptoms present everywhere', ['seizure', 'poisoning', 'breathing-difficulty', 'bleeding', 'collapse'].every((id) => ids('dog').includes(id) && ids('cat').includes(id)));

// ---------- Red-flag emergencies ----------
const redFlags: { species: CheckInput['species']; id: string; label: string }[] = [
  { species: 'cat', id: 'urinary-strain', label: 'cat unable-to-urinate (mild, <12h)' },
  { species: 'dog', id: 'poisoning', label: 'poisoning' },
  { species: 'cat', id: 'breathing-difficulty', label: 'breathing difficulty' },
  { species: 'bird', id: 'seizure', label: 'seizure' },
  { species: 'rabbit', id: 'collapse', label: 'collapse' },
  { species: 'dog', id: 'bleeding', label: 'uncontrolled bleeding' },
  { species: 'rabbit', id: 'no-eating-no-droppings', label: 'rabbit GI stasis' },
];
for (const rf of redFlags) {
  const r = ev(rf.species, [rf.id], 'lt12h', 'mild');
  check(`EMERGENCY: ${rf.label}`, r.urgency === 'emergency' && r.isEmergency, `-> ${r.urgencyLabel}`);
}
{
  const r = ev('dog', ['bloating', 'retching'], 'lt12h', 'mild');
  check('EMERGENCY: dog bloat + retching combo', r.urgency === 'emergency' && r.isEmergency);
  check('combo emergency has reason text', r.emergencyReasons.length > 0);
}

// ---------- Escalation matrix ----------
{
  const r = ev('dog', ['vomiting'], 'lt12h', 'mild');
  check('single mild vomiting <12h → monitor', r.urgency === 'monitor', `-> ${r.urgency}`);
}
{
  const r = ev('cat', ['vomiting'], 'gt3d', 'mild');
  check('duration >3 days bumps to vet24h', r.urgency === 'vet24h', `-> ${r.urgency}`);
}
{
  const r = ev('dog', ['coughing'], 'lt12h', 'severe');
  check('severe severity → vet today', r.urgency === 'vetToday', `-> ${r.urgency}`);
}
{
  const r = ev('cat', ['vomiting', 'diarrhea', 'lethargy'], 'h24', 'moderate');
  check('vomiting+diarrhea+lethargy 24h moderate → vet today', r.urgency === 'vetToday', `-> ${r.urgency}`);
}
{
  const r = ev('dog', ['vomiting', 'diarrhea'], 'd2_3', 'moderate');
  check('vomiting+diarrhea 2-3d moderate → vet24h', r.urgency === 'vet24h', `-> ${r.urgency}`);
}
{
  const r = ev('bird', ['sneezing'], 'h24', 'mild');
  check('single mild sneezing 24h → monitor', r.urgency === 'monitor', `-> ${r.urgency}`);
}
{
  const r = ev('cat', [], 'h24', 'mild');
  check('no symptoms → monitor (no crash)', r.urgency === 'monitor' && r.summaryGuidance.length > 0);
}

// ---------- Maruf's exact example ----------
// Cat + Loss of Appetite + 24 Hours → monitor/contact-vet guidance + disclaimer
{
  const r = ev('cat', ['appetite-loss'], 'h24', 'moderate', 'Luna');
  check("Maruf example urgency → monitor", r.urgency === 'monitor', `-> ${r.urgency}`);
  check(
    "Maruf example guidance wording",
    r.summaryGuidance.includes('can have several causes') &&
      r.summaryGuidance.includes('contact a veterinarian promptly'),
    `"${r.summaryGuidance.slice(0, 90)}…"`,
  );
  check('result carries the disclaimer', r.disclaimer === DISCLAIMER && r.disclaimer.includes('not a diagnosis'));
  check('per-symptom guidance present', r.symptoms.length === 1 && r.symptoms[0].guidance.homeSteps.length > 0);
  check('vet recommendation present', r.vetRecommendation.length > 20);
}

// ---------- Labels & disclaimer ----------
check('urgency labels', (['monitor', 'vet24h', 'vetToday', 'emergency'] as UrgencyLevel[]).every((u) => urgencyLabel(u).length > 3));
check('duration options = 4', DURATION_OPTIONS.length === 4);
check('severity options = 3', SEVERITY_OPTIONS.length === 3);
check(
  'disclaimer covers the three emergency examples',
  DISCLAIMER.includes('cat that cannot urinate') &&
    DISCLAIMER.includes('difficulty breathing') &&
    DISCLAIMER.includes('suspected poisoning'),
);

// ---------- Phase-2 photoNote hook ----------
{
  const r = evaluateCheck({
    species: 'dog',
    petName: 'Bruno',
    symptomIds: ['limping'],
    duration: 'h24',
    severity: 'mild',
    photoNote: 'future AI observation placeholder',
  });
  check('photoNote passes through to result', r.photoNote === 'future AI observation placeholder');
  const r2 = ev('dog', ['limping'], 'h24', 'mild');
  check('photoNote optional (undefined when absent)', r2.photoNote === undefined);
}

console.log(`\n${failures === 0 ? 'ALL SYMPTOM-RULE TESTS PASSED' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
