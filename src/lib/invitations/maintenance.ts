import { schedule, validate } from "node-cron";
import { cleanupInvitationTemplatesOnce } from "./template-assets";
import { INVITATION_POLICY as P } from "./policy";
const key = Symbol.for("tokensapp.invitation-template-maintenance");
const state = globalThis as typeof globalThis & {
  [key]?: { task: ReturnType<typeof schedule>; running: boolean };
};
export function startInvitationTemplateMaintenance() {
  if (state[key]) return;
  if (!validate(P.cleanupSchedule)) throw new Error("Invalid INVITATION_CLEANUP_CRON");
  const run = async () => {
    const current = state[key];
    if (!current || current.running) return;
    current.running = true;
    try {
      const result = await cleanupInvitationTemplatesOnce();
      if (result.removed || result.failed) console.info("invitation.templates.cleanup", result);
    } catch (error) {
      console.error("invitation.templates.cleanup.failed", error);
    } finally {
      current.running = false;
    }
  };
  state[key] = { task: schedule(P.cleanupSchedule, run, { timezone: P.timezone }), running: false };
  void run();
}
