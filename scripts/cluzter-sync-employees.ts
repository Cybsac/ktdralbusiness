import { config } from "dotenv";
config({ path: ".env", quiet: true });
config({ path: ".env.local", override: true, quiet: true });

async function main() {
  if (!process.argv.includes("--apply"))
    throw new Error("Uso: npx tsx scripts/cluzter-sync-employees.ts --apply");
  const { prisma } = await import("../src/lib/prisma");
  const { lookupDni } = await import("../src/lib/cluzter/dni");
  const { CluzterError } = await import("../src/lib/cluzter/config");
  const { audit } = await import("../src/lib/audit");
  const totals = {
    eligible: 0,
    updated: 0,
    invalidDocument: 0,
    notFound: 0,
    changedDuringLookup: 0,
    failed: 0,
    stopped: false,
  };
  try {
    const users = await prisma.user.findMany({
      where: {
        role: { in: ["STAFF", "COLLAB", "COORDINATOR"] },
        person: { active: true, documentType: "DNI" },
      },
      select: { person: { select: { id: true, dni: true, updatedAt: true } } },
      orderBy: { id: "asc" },
    });
    for (const { person } of users) {
      if (!person.dni || !/^\d{8}$/.test(person.dni)) {
        totals.invalidDocument++;
        continue;
      }
      totals.eligible++;
      try {
        const found = await lookupDni(person.dni);
        const name = [found.names, found.paternalSurname, found.maternalSurname]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (name.length < 2 || name.length > 120) {
          totals.failed++;
          continue;
        }
        const birthday = found.birthDate ? new Date(`${found.birthDate}T00:00:00.000Z`) : null;
        if (birthday && (!Number.isFinite(birthday.getTime()) || birthday.getTime() > Date.now())) {
          totals.failed++;
          continue;
        }
        const updated = await prisma.person.updateMany({
          where: {
            id: person.id,
            dni: person.dni,
            documentType: "DNI",
            updatedAt: person.updatedAt,
            active: true,
          },
          data: {
            name,
            ...(birthday ? { birthday } : {}),
            ...(found.documentSexCode ? { documentSexCode: found.documentSexCode } : {}),
          },
        });
        if (updated.count) totals.updated++;
        else totals.changedDuringLookup++;
      } catch (error) {
        if (error instanceof CluzterError && error.code === "NOT_FOUND") {
          totals.notFound++;
          continue;
        }
        totals.failed++;
        if (
          error instanceof CluzterError &&
          ["AUTH", "QUOTA", "RATE_LIMITED", "UNAVAILABLE", "NOT_CONFIGURED"].includes(error.code)
        ) {
          totals.stopped = true;
          break;
        }
      }
    }
    await audit("CLUZTER_EMPLOYEE_SYNC", "system", totals);
    console.log(JSON.stringify(totals));
    if (totals.stopped || totals.failed || totals.changedDuringLookup) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error("No se pudo completar la sincronización; no se muestran datos personales.");
  process.exitCode = 1;
});
