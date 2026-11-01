"use client";
import { AREA_CHOICES, canManageTarget } from "@/lib/users/policy";
import { useUserManagementActor } from "./management-context";
import { useRecordContext } from "react-admin";

import {
  List,
  Datagrid,
  TextField,
  DateField,
  EditButton,
  DeleteButton,
  Filter,
  TextInput,
  SelectInput,
} from "react-admin";

const ManagedEditButton = () => {
  const actor = useUserManagementActor();
  const record = useRecordContext();
  return record &&
    canManageTarget(actor, { id: String(record.id), role: String(record.role || "") }) ? (
    <EditButton />
  ) : null;
};
const ManagedDeleteButton = () => {
  const actor = useUserManagementActor();
  const record = useRecordContext();
  return record &&
    record.id !== actor.userId &&
    canManageTarget(actor, { id: String(record.id), role: String(record.role || "") }) ? (
    <DeleteButton mutationMode="pessimistic" />
  ) : null;
};

const UserFilter = (props: any) => (
  <Filter {...props}>
    <TextInput label="Username" source="username" alwaysOn />
    <TextInput label="Name" source="personName" />
    <TextInput label="DNI" source="dni" />
    <SelectInput label="Area" source="area" choices={AREA_CHOICES} />
  </Filter>
);

export const UserList = (props: any) => (
  <div>
    <List {...props} filters={<UserFilter />} sort={{ field: "createdAt", order: "DESC" }}>
      <Datagrid
        bulkActionButtons={false}
        sx={{
          "& .RaDatagrid-headerCell": {
            fontWeight: "bold",
            backgroundColor: "var(--color-bg-soft)",
            color: "var(--color-text-primary)",
          },
          "& .RaDatagrid-row": {
            "&:hover": {
              backgroundColor: "var(--color-bg)",
            },
          },
          "& .RaDatagrid-rowCell": {
            color: "var(--color-text-primary)",
          },
          // Responsive table styles
          "@media (max-width: 768px)": {
            "& .RaDatagrid-headerCell": {
              padding: "8px 4px",
              fontSize: "0.75rem",
            },
            "& .RaDatagrid-rowCell": {
              padding: "8px 4px",
              fontSize: "0.75rem",
            },
          },
          "@media (max-width: 640px)": {
            "& .RaDatagrid-headerCell:nth-of-type(n+6)": {
              display: "none",
            },
            "& .RaDatagrid-rowCell:nth-of-type(n+6)": {
              display: "none",
            },
          },
        }}
      >
        <TextField source="username" />
        <TextField source="personName" label="Name" />
        <TextField source="role" />
        <TextField source="area" />
        <TextField source="dni" />
        <TextField source="whatsapp" />
        <DateField source="createdAt" />
        <ManagedEditButton />
        <ManagedDeleteButton />
      </Datagrid>
    </List>
  </div>
);
