import BrandLogo from '@/components/brand/BrandLogo';
import { DateTime } from 'luxon';
import { getGameCalendar } from '@/lib/prize-games/calendar';
import messages from '../../../public/preloader-messages.json';
import styles from './smartPreloader.module.css';

type Message = { title: string; subtitle?: string };
type Messages = { default: Message; byWeekday?: Record<string, Message>; byDate?: Record<string, Message>; byMonthDay?: Record<string, Message> };

export function getPreloaderMessage(config: Messages, now: DateTime): Message {
  const date = now.toISODate();
  const monthDay = now.toFormat('MM-dd');
  const weekday = now.setLocale('en-US').toFormat('cccc').toLowerCase();
  return (date && config.byDate?.[date]) || config.byMonthDay?.[monthDay] || config.byWeekday?.[weekday] || config.default;
}

/** Render configured copy on the server, without a second browser request. */
export default function SmartPreloader() {
  let message: Message = messages.default;
  try { message = getPreloaderMessage(messages, DateTime.now().setZone(getGameCalendar().timeZone)); }
  catch { /* Misconfigured calendar must not break the loading boundary. */ }
  return (
    <div className={styles.root} role="status" aria-live="polite">
      <div className={styles.logoTight}><BrandLogo animated={false} /></div>
      <div className={styles.message}>
        <div className={`${styles.title} text-xl sm:text-2xl`}>{message.title}</div>
        {message.subtitle && <div className={styles.subtitle}>{message.subtitle}</div>}
      </div>
    </div>
  );
}
