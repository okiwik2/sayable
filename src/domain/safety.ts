// Text for the emergency screen and "Where does it hurt?". Pure functions, so they can be tested.
import type { Settings } from './settings';
import type { Lang } from './types';

export const BODY_PARTS = [
  { id: 'head', en: 'head', zh: '头' },
  { id: 'eyes', en: 'eyes', zh: '眼睛', plural: true },
  { id: 'ears', en: 'ears', zh: '耳朵', plural: true },
  { id: 'teeth', en: 'teeth', zh: '牙', plural: true },
  { id: 'throat', en: 'throat', zh: '喉咙' },
  { id: 'neck', en: 'neck', zh: '脖子' },
  { id: 'chest', en: 'chest', zh: '胸口' },
  { id: 'stomach', en: 'stomach', zh: '肚子' },
  { id: 'back', en: 'back', zh: '背' },
  { id: 'arm', en: 'arm', zh: '手臂' },
  { id: 'hand', en: 'hand', zh: '手' },
  { id: 'leg', en: 'leg', zh: '腿' },
  { id: 'knee', en: 'knee', zh: '膝盖' },
  { id: 'foot', en: 'foot', zh: '脚' },
] as const;

export type BodyPartId = (typeof BODY_PARTS)[number]['id'];

/** Words for each part of the 0–10 scale. */
export function painWord(level: number, lang: Lang): string {
  const en = ['no pain', 'a little', 'a little', 'a little', 'quite a lot', 'quite a lot', 'quite a lot', 'a lot', 'a lot', 'a lot', 'the worst'];
  const zh = ['不疼', '有点疼', '有点疼', '有点疼', '比较疼', '比较疼', '比较疼', '很疼', '很疼', '很疼', '疼得受不了'];
  return (lang === 'zh' ? zh : en)[Math.max(0, Math.min(10, Math.round(level)))]!;
}

/** "My stomach hurts. 7 out of 10." / "我肚子疼，疼痛是7分（满分10分）。" */
export function painMessage(parts: BodyPartId[], level: number | null, lang: Lang): string {
  const chosen = BODY_PARTS.filter((p) => parts.includes(p.id));
  if (lang === 'zh') {
    const where = chosen.length ? `我${chosen.map((p) => p.zh).join('和')}疼` : '我疼';
    return level === null ? `${where}。` : `${where}，疼痛是${level}分（满分10分）。`;
  }
  let where = 'It hurts.';
  if (chosen.length) {
    const names = chosen.map((p) => `my ${p.en}`);
    const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const plural = chosen.length > 1 || ('plural' in chosen[0]! && chosen[0]!.plural);
    where = `${list.charAt(0).toUpperCase()}${list.slice(1)} ${plural ? 'hurt' : 'hurts'}.`;
  }
  return level === null ? where : `${where} ${level} out of 10.`;
}

export type SafetyLabels = Record<
  'myName' | 'howICommunicate' | 'medicalInfo' | 'allergies' | 'dob' | 'conditions' | 'medications' | 'nhi' | 'emergencyContact' | 'howToHelp',
  string
>;

/** The lines shown under the emergency message: About me, plus the medical card when it is switched on. */
export function aboutMeLines(s: Settings, l: SafetyLabels): string[] {
  const me = s.aboutMe;
  const line = (label: string, value: string | undefined) => (value?.trim() ? `${label}: ${value.trim()}` : '');
  const lines = [
    line(l.myName, me.name),
    s.medicalCard ? line(l.dob, me.dob) : '',
    line(l.howICommunicate, me.communication),
    s.medicalCard ? line(l.howToHelp, me.howToHelp) : '',
    line(l.medicalInfo, me.medical),
    s.medicalCard ? line(l.conditions, me.conditions) : '',
    s.medicalCard ? line(l.medications, me.medications) : '',
    line(l.allergies, me.allergies),
    s.medicalCard ? line(l.nhi, me.nhi) : '',
    s.medicalCard && (me.emergencyName?.trim() || me.emergencyPhone?.trim())
      ? `${l.emergencyContact}: ${[me.emergencyName?.trim(), me.emergencyPhone?.trim()].filter(Boolean).join(', ')}`
      : '',
    me.other?.trim() ?? '',
  ];
  return lines.filter(Boolean);
}

/** Coordinates as a helper can read them out: "-36.84846, 174.76333 (within 20 m)". */
export function formatCoords(lat: number, lon: number, accuracyM: number, withinWord: string): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)} (${withinWord} ${Math.round(accuracyM)} m)`;
}
