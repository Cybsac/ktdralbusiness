export async function register() {
  console.log("[instrumentation] register called");
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.NEXT_BUILD !== "1"
  ) {
    await import("./src/server/start");
    const { startBirthdayCardMaintenance } = await import("./src/lib/birthdays/card-scheduler");
    startBirthdayCardMaintenance();
    const { startInvitationTemplateMaintenance } =
      await import("./src/lib/invitations/maintenance");
    startInvitationTemplateMaintenance();
  }
  // Socket.IO is now initialized in server.js
}
