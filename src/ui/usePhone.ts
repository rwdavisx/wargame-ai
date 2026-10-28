// Whether the screen is phone-sized, so the interface can switch to its compact layout.
import { useEffect, useState } from 'react';

const PHONE = '(max-width: 820px), (max-height: 520px)';
/** A phone held upright, where the orders panel becomes a bottom sheet. */
export const PORTRAIT_PHONE = '(max-width: 820px) and (min-height: 521px)';

export function usePhone(query = PHONE): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return phone;
}
