"use client";
import {
  Datagrid,
  DateField,
  DeleteButton,
  EditButton,
  Filter,
  List,
  SelectInput,
  TextField,
  TextInput,
  useRecordContext,
} from "react-admin";

import { AREA_CHOICES, canManageTarget } from "@/lib/users/policy";

import { useUserManagementActor } from "./management-context";

const ManagedEditButton = () => {
  const actor = useUserManagementActor();
  const record = useRecordContext();
  return record &&
    canManageTarget(actor, { id: String(record.id), role: String(record.role || "") }) ? (
    <EditButton label="Editar" />
  ) : null;
};
const AttendanceLink = () => {
  const record = useRecordContext();
  return record?.personCode ? (
    <a
      className="px-2 text-sm text-blue-700 underline dark:text-blue-300"
      href={`/admin/attendance?person=${encodeURIComponent(record.personCode)}`}
    >
      Asistencia
    </a>
  ) : null;
};
export const ManagedDeleteButton = () => {
  const actor = useUserManagementActor();
  const record = useRecordContext();
  return record &&
    record.id !== actor.userId &&
    canManageTarget(actor, { id: String(record.id), role: String(record.role || "") }) ? (
    <DeleteButton
      mutationMode="pessimistic"
      label="Retirar acceso"
      confirmTitle="Retirar acceso"
      confirmContent="La cuenta quedará inactiva y no podrá iniciar sesión. Se conservará su historial."
    />
  ) : null;
};

const UserFilter = (props: any) => (
  <Filter {...props}>
    <TextInput label="Usuario" source="username" alwaysOn />
    <TextInput label="Nombre" source="personName" />
    <TextInput label="DNI" source="dni" />
    <SelectInput label="Área" source="area" choices={AREA_CHOICES} />
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
            "& .RaDatagrid-headerCell:nth-of-type(6), & .RaDatagrid-headerCell:nth-of-type(7)": {
              display: "none",
            },
            "& .RaDatagrid-rowCell:nth-of-type(6), & .RaDatagrid-rowCell:nth-of-type(7)": {
              display: "none",
            },
          },
        }}
      >
        <TextField source="username" label="Usuario" />
        <TextField source="personName" label="Nombre" />
        <TextField source="role" label="Rol" />
        <TextField source="area" label="Área" />
        <TextField source="dni" />
        <TextField source="whatsapp" />
        <DateField source="createdAt" label="Creado" />
        <AttendanceLink />
        <ManagedEditButton />
        <ManagedDeleteButton />
      </Datagrid>
    </List>
  </div>
);
