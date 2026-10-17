// Emergency screen: the emergency message in very large text, spoken aloud, with the person's
// details. It never calls or messages anyone; it is for showing to people nearby.
import { useEffect, useRef, useState } from 'react';
import { useStore, useT } from '../state/store';
import { aboutMeLines, formatCoords, type SafetyLabels } from '../domain/safety';
import { playAttention, stopAttention } from '../services/alarm';
import { speech } from '../services/speech';
import { HoldButton } from './common';
import { Icon } from './Icon';
import { PainScale } from './PainScale';
import { guideSay } from './VoiceGuide';
import { isNative } from '../services/platform';

const isChinese = (text: string) => /[㐀-鿿]/.test(text);

export function useSafetyLabels(): SafetyLabels {
  const t = useT();
  return {
    myName: t('myName'), howICommunicate: t('howICommunicate'), medicalInfo: t('medicalInfo'), allergies: t('allergies'),
    dob: t('dob'), conditions: t('conditions'), medications: t('medications'), nhi: t('nhi'),
    emergencyContact: t('emergencyContact'), howToHelp: t('howToHelp'),
  };
}

export function EmergencyScreen({ onClose }: { onClose: () => void }) {
  const t = useT();
  const s = useStore((st) => st.settings);
  const labels = useSafetyLabels();
  const message = s.emergencyMessage || t('emergencyDefault');
  const details = aboutMeLines(s, labels);
  const contacts = s.contacts.filter((c) => c.name.trim() || c.phone.trim());
  const [repeating, setRepeating] = useState(s.emergencyRepeat);
  const [flipped, setFlipped] = useState(false);
  const [location, setLocation] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [pain, setPain] = useState(false);
  const alive = useRef(true);

  const sayOnce = async (withSound: boolean) => {
    if (withSound && s.attentionSound) await playAttention();
    if (!alive.current) return;
    useStore.getState().sayWord(message, isChinese(message) ? 'zh' : 'en');
  };

  // Speak once when the screen opens, then repeat if switched on.
  useEffect(() => {
    alive.current = true;
    guideSay(t('emergencyTitle'), { page: true });
    void sayOnce(true);
    return () => {
      alive.current = false;
      stopAttention();
      speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!repeating) return;
    const id = setInterval(() => void sayOnce(true), Math.max(5, s.emergencyRepeatSec) * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeating, s.emergencyRepeatSec]);

  const stop = () => {
    setRepeating(false);
    stopAttention();
    speech.stop();
  };

  const findMe = () => {
    setLocating(true);
    if (isNative) {
      void import('@capacitor/geolocation')
        .then(({ Geolocation }) => Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }))
        .then((p) => setLocation(formatCoords(p.coords.latitude, p.coords.longitude, p.coords.accuracy, t('within'))))
        .catch(() => setLocation(t('locationUnavailable')))
        .finally(() => setLocating(false));
      return;
    }
    if (!('geolocation' in navigator)) {
      setLocating(false);
      return setLocation(t('locationUnavailable'));
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setLocation(formatCoords(p.coords.latitude, p.coords.longitude, p.coords.accuracy, t('within')));
      },
      () => {
        setLocating(false);
        setLocation(t('locationUnavailable'));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  };

  return (
    <div className={`show-screen emergency emergency-screen ${flipped ? 'flipped' : ''}`} role="dialog" aria-modal="true" aria-label={t('emergencyTitle')}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="emergency-body show-text" lang={isChinese(message) ? 'zh' : 'en'}>
        <p className="emergency-message">{message}</p>
        {details.length > 0 && (
          <ul className="emergency-details">
            {details.map((d) => <li key={d}>{d}</li>)}
          </ul>
        )}
        {contacts.length > 0 && (
          <div className="emergency-contacts">
            <h2>{t('contacts')}</h2>
            <ul>
              {contacts.map((c) => (
                <li key={c.id}><strong>{c.name}</strong>{c.relation ? ` (${c.relation})` : ''} <span className="phone-number">{c.phone}</span></li>
              ))}
            </ul>
          </div>
        )}
        {location && <p className="emergency-location"><Icon name="pin" /> {t('myLocation')}: {location}</p>}
      </div>
      <div className="show-bar">
        {repeating || s.attentionSound ? (
          <button className="btn btn-danger-solid" onClick={stop}><Icon name="stop" filled /> {t('stopRepeating')}</button>
        ) : null}
        <button className="btn" onClick={() => void sayOnce(false)}><Icon name="speak" /> {t('speak')}</button>
        <button className="btn" aria-pressed={flipped} onClick={() => setFlipped(!flipped)}><Icon name="flip" /> {t('flip')}</button>
        {s.painScale && <button className="btn" onClick={() => { stop(); setPain(true); }}><Icon name="person" /> {t('whereHurts')}</button>}
        {s.shareLocation && (
          <button className="btn" onClick={findMe} disabled={locating}><Icon name="pin" /> {locating ? t('locating') : t('addLocation')}</button>
        )}
        <HoldButton holdMs={800} onHold={onClose} className="btn btn-primary" hint={t('holdToClose')}>
          <Icon name="clear" /> {t('holdToClose')}
        </HoldButton>
      </div>
      {pain && <PainScale onClose={() => setPain(false)} />}
    </div>
  );
}
