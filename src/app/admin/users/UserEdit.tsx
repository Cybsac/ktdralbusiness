"use client";
import { AREA_CHOICES, USER_POLICY } from "@/lib/users/policy";
import { ManagedRoleInput } from "./management-context";

import {
  Edit,
  SimpleForm,
  TextInput,
  PasswordInput,
  SelectInput,
  DateInput,
  required,
} from "react-admin";

const validateNewPassword = (value?: string) => {
  if (!value || value.trim() === "") return undefined;
  return value.length >= USER_POLICY.passwordMin
    ? undefined
    : "La contraseña debe tener al menos 8 caracteres";
};

export const UserEdit = (props: any) => (
  <Edit {...props}>
    <SimpleForm
      sx={{
        maxWidth: 600,
        mx: "auto",
        px: { xs: 2, sm: 3 },
        "& .MuiTextField-root": {
          mb: { xs: 2, sm: 1 },
        },
        "& .MuiFormControl-root": {
          mb: { xs: 2, sm: 1 },
        },
      }}
    >
      <TextInput source="username" validate={required()} fullWidth />
      <PasswordInput
        source="password"
        label="Nueva contraseña (opcional)"
        helperText="Déjala vacía para conservar la actual. Mínimo 8 caracteres."
        validate={validateNewPassword}
        fullWidth
      />
      <TextInput source="personName" label="Name" validate={required()} fullWidth />
      <TextInput source="dni" fullWidth />
      <ManagedRoleInput source="role" validate={required()} fullWidth />
      <SelectInput source="area" choices={AREA_CHOICES} fullWidth />
      <TextInput source="whatsapp" fullWidth />
      <DateInput source="birthday" label="Birthday" fullWidth />
    </SimpleForm>
  </Edit>
);
