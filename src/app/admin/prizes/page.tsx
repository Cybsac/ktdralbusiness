import { getPrizeAdminData } from "@/lib/prize-games/admin-data";

import PrizesClient from "./PrizesClient";
export const metadata = { title: "Gestionar premios" };
export const dynamic = "force-dynamic";
export default async function PrizesPage() {
  return <PrizesClient initialData={await getPrizeAdminData()} />;
}
