import { describe, it, expect } from 'vitest';
import { painMessage, painWord, aboutMeLines, formatCoords, type SafetyLabels } from '../../src/domain/safety';
import { defaultSettings, migrateSettings } from '../../src/domain/settings';

const labels: SafetyLabels = {
  myName: 'My name', howICommunicate: 'How I communicate', medicalInfo: 'Medical', allergies: 'Allergies', dob: 'Date of birth',
  conditions: 'Conditions', medications: 'Medications', nhi: 'NHI number', emergencyContact: 'Emergency contact', howToHelp: 'How to help me',
};

describe('safety features', () => {
  it('are all off by default, and old profiles get them switched off', () => {
    const s = defaultSettings();
    for (const k of ['helpButton', 'emergencyRepeat', 'attentionSound', 'medicalCard', 'painScale', 'shareLocation'] as const) expect(s[k]).toBe(false);
    const old = migrateSettings({ aboutMe: { name: 'Mere', communication: '', medical: '', allergies: '', other: '' } } as never);
    expect(old.helpButton).toBe(false);
    expect(old.aboutMe.name).toBe('Mere');
    expect(old.aboutMe.medications).toBe('');
  });

  it('builds "where does it hurt" sentences in English and Mandarin', () => {
    expect(painMessage(['stomach'], 7, 'en')).toBe('My stomach hurts. 7 out of 10.');
    expect(painMessage(['head', 'teeth'], null, 'en')).toBe('My head and my teeth hurt.');
    expect(painMessage(['eyes'], 3, 'en')).toBe('My eyes hurt. 3 out of 10.');
    expect(painMessage(['head', 'back', 'foot'], 10, 'en')).toBe('My head, my back and my foot hurt. 10 out of 10.');
    expect(painMessage([], 5, 'en')).toBe('It hurts. 5 out of 10.');
    expect(painMessage(['stomach'], 7, 'zh')).toBe('我肚子疼，疼痛是7分（满分10分）。');
    expect(painMessage(['head', 'stomach'], null, 'zh')).toBe('我头和肚子疼。');
    expect(painWord(0, 'en')).toBe('no pain');
    expect(painWord(10, 'zh')).toBe('疼得受不了');
  });

  it('shows the medical card only when it is switched on', () => {
    const s = defaultSettings();
    s.aboutMe = { ...s.aboutMe, name: 'Mere', medications: 'Insulin', allergies: 'Peanuts', emergencyName: 'Aroha', emergencyPhone: '021 000 000' };
    expect(aboutMeLines(s, labels)).toEqual(['My name: Mere', 'Allergies: Peanuts']);
    s.medicalCard = true;
    expect(aboutMeLines(s, labels)).toEqual(['My name: Mere', 'Medications: Insulin', 'Allergies: Peanuts', 'Emergency contact: Aroha, 021 000 000']);
  });

  it('formats a location so it can be read out', () => {
    expect(formatCoords(-36.848461, 174.763336, 19.6, 'within')).toBe('-36.84846, 174.76334 (within 20 m)');
  });
});
