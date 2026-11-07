"use client";
import { createContext, useContext } from "react";
import { SelectInput, useRecordContext } from "react-admin";

import { AREA_CHOICES, assignableRoles } from "@/lib/users/policy";
export const UserManagementContext = createContext({ userId: "", role: "" });
export const useUserManagementActor = () => useContext(UserManagementContext);
export function ManagedRoleInput(props: any) {
  const actor = useUserManagementActor();
  const record = useRecordContext();
  const choices = assignableRoles(actor.role);
  if (record?.role && !choices.some((c) => c.id === record.role))
    choices.push({ id: record.role, name: record.role });
  return <SelectInput {...props} choices={choices} />;
}

/** Keep historical area values visible until an operator explicitly changes them. */
export function ManagedAreaInput(props: any) {
  const record = useRecordContext();
  const choices = [...AREA_CHOICES];
  if (record?.area && !choices.some((choice) => choice.id === record.area))
    choices.push({ id: record.area, name: record.area });
  return <SelectInput {...props} choices={choices} />;
}
