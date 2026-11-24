import { Metadata } from "next";
import PublicRoulettePage from "./PublicRoulettePage";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: "Ruleta de Premios",
  description: "Gira la ruleta y descubre tu premio en Go Lounge!",
};

interface RuletaSearchParams {
  tokenId?: string;
  theme?: string;
}

export default function RuletaPage({ searchParams }: { searchParams: RuletaSearchParams }) {
  return <PublicRoulettePage tokenId={searchParams.tokenId ?? ''} theme={searchParams.theme} />;
}
