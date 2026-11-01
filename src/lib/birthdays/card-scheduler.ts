import { schedule, validate } from "node-cron";
import { BIRTHDAY_POLICY as P } from "./policy";
import { cleanupBirthdayCardsOnce } from "./card-maintenance";

const key = Symbol.for("tokensapp.birthday-card-maintenance");
interface Maintenance {
  task: ReturnType<typeof schedule>;
  running: boolean;
}
const state = globalThis as typeof globalThis & { [key]?: Maintenance };
/** Independent of the optional global tokens scheduler. One task per server process. */
export function startBirthdayCardMaintenance() {
  if (state[key]) return;
  if (!validate(P.cleanupSchedule)) throw new Error("Invalid BIRTHDAY_CLEANUP_CRON");
  const run = async () => {
    const current = state[key];
    if (!current || current.running) return;
    current.running = true;
    try {
      const result = await cleanupBirthdayCardsOnce();
      if (result.cardsPurged || result.orphansQueued || result.removed || result.failed)
        console.info("birthday.cards.maintenance", result);
    } catch (error) {
      console.error("birthday.cards.maintenance.failed", error);
    } finally {
      current.running = false;
    }
  };
  const task = schedule(P.cleanupSchedule, run, { timezone: P.timezone });
  state[key] = { task, running: false };
  void run();
}
export function stopBirthdayCardMaintenance() {
  state[key]?.task.stop();
  delete state[key];
}
