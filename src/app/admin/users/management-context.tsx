"use client";
import { createContext, useContext } from "react";
import { SelectInput, useRecordContext } from "react-admin";
import { assignableRoles } from "@/lib/users/policy";
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
