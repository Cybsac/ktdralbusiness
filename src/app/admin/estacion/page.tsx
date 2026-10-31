import StationClient from '@/app/u/estacion/StationClient';

export const dynamic = 'force-dynamic';

export default function AdminStationPage() {
  return <StationClient backHref="/admin" />;
}
