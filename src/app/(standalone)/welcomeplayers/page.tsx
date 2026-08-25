import { Metadata } from "next";
import WelcomePlayersClient from "./WelcomePlayersClient";
import styles from "./welcomeplayers.module.css";

export const metadata: Metadata = {
  title: "Welcome Players",
  description: "Ruleta pública táctil para premios aleatorios en formato vertical 9:16.",
};

export default function WelcomePlayersPage() {
  return (
    <main className={styles.scene}>
      <div className="relative z-[2] flex h-full w-full">
        <WelcomePlayersClient />
      </div>
    </main>
  );
}
