import EvolucionDashboardPage from '@/components/evolucion/EvolucionDashboardPage';
import { currentBusinessDay } from '@/lib/attendanceDay';

export const dynamic = 'force-dynamic';

export default function AdminEvolucionPage() {
  return <EvolucionDashboardPage initialDay={currentBusinessDay()} showComments />;
}
