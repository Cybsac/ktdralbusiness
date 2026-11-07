import { Prisma } from "@prisma/client";
import { z } from "zod";

import { formatBirthdayLabel } from "@/lib/birthday";
import { prisma } from "@/lib/prisma";

import type { UserActor } from "./access";
import { USER_POLICY as P } from "./policy";
export const userSelection = {
  id: true,
  username: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  person: {
    select: {
      id: true,
      code: true,
      name: true,
      dni: true,
      documentType: true,
      area: true,
      jobTitle: true,
      whatsapp: true,
      birthday: true,
      documentSexCode: true,
      active: true,
    },
  },
} satisfies Prisma.UserSelect;
export function userDto(user: Prisma.UserGetPayload<{ select: typeof userSelection }>) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    personCode: user.person.code,
    personName: user.person.name,
    dni: user.person.dni,
    documentType: user.person.documentType,
    area: user.person.area,
    jobTitle: user.person.jobTitle,
    whatsapp: user.person.whatsapp,
    birthday: user.person.birthday?.toISOString().slice(0, 10) || null,
    birthdayLabel: formatBirthdayLabel(user.person.birthday),
    documentSexCode: user.person.documentSexCode,
    active: user.person.active,
  };
}
export async function listUsers(req: Request, actor: UserActor) {
  const url = new URL(req.url);
  const parse = (name: string, fallback: unknown) => {
    const value = url.searchParams.get(name);
    return value ? JSON.parse(value) : fallback;
  };
  const filter = z
    .object({
      id: z.array(z.string()).optional(),
      username: z.string().optional(),
      personName: z.string().optional(),
      dni: z.string().optional(),
      area: z.string().optional(),
      role: z.string().optional(),
      q: z.string().optional(),
    })
    .strict()
    .parse(parse("filter", {}));
  const range = url.searchParams.has("range")
    ? z
        .tuple([z.number().int().nonnegative(), z.number().int().nonnegative()])
        .refine(([start, end]) => end >= start && end - start < P.maxPageSize)
        .parse(parse("range", null))
    : null;
  const [field, direction] = z
    .tuple([z.string(), z.enum(["ASC", "DESC"])])
    .parse(parse("sort", ["personCode", "ASC"]));
  const where: Prisma.UserWhereInput = { person: { active: true } };
  if (actor.role === "COORDINATOR") where.role = { not: "ADMIN" };
  if (filter.id) where.id = { in: filter.id };
  if (filter.role)
    where.role = actor.role === "COORDINATOR" ? { equals: filter.role, not: "ADMIN" } : filter.role;
  const person: Prisma.PersonWhereInput = { active: true };
  if (filter.personName) person.name = { contains: filter.personName, mode: "insensitive" };
  if (filter.dni) person.dni = { contains: filter.dni, mode: "insensitive" };
  if (filter.area) person.area = filter.area;
  where.person = person;
  if (filter.username) where.username = { contains: filter.username, mode: "insensitive" };
  if (filter.q)
    where.OR = [
      { username: { contains: filter.q, mode: "insensitive" } },
      { person: { name: { contains: filter.q, mode: "insensitive" } } },
    ];
  const order = direction === "ASC" ? "asc" : "desc";
  const direct = ["username", "role", "createdAt", "updatedAt", "id"];
  const personFields: Record<string, string> = {
    personCode: "code",
    personName: "name",
    dni: "dni",
    area: "area",
    whatsapp: "whatsapp",
    birthday: "birthday",
  };
  const orderBy: Prisma.UserOrderByWithRelationInput = direct.includes(field)
    ? { [field]: order }
    : personFields[field]
      ? { person: { [personFields[field]]: order } }
      : { person: { code: "asc" } };
  const [rows, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: userSelection,
      orderBy: [orderBy, { id: "asc" }],
      ...(range ? { skip: range[0], take: range[1] - range[0] + 1 } : {}),
    }),
    prisma.user.count({ where }),
  ]);
  const users = rows.map(userDto);
  return { ok: true, data: users, users, total };
}
