"use client";
import {
  DateInput,
  Edit,
  PasswordInput,
  required,
  SaveButton,
  SelectInput,
  SimpleForm,
  TextInput,
  Toolbar,
} from "react-admin";

import { DOCUMENT_SEX_CODE_CHOICES, DOCUMENT_TYPE_CHOICES } from "@/lib/users/document";
import { USER_POLICY } from "@/lib/users/policy";

import { DniLookup } from "./DniLookup";
import { ManagedAreaInput, ManagedRoleInput } from "./management-context";
import { ManagedDeleteButton } from "./UserList";

const validateNewPassword = (value?: string) => {
  if (!value || value.trim() === "") return undefined;
  return value.length >= USER_POLICY.passwordMin
    ? undefined
    : `La contraseña debe tener al menos ${USER_POLICY.passwordMin} caracteres`;
};

export const UserEdit = (props: any) => (
  <Edit {...props}>
    <SimpleForm
      toolbar={
        <Toolbar>
          <SaveButton label="Guardar cambios" />
          <ManagedDeleteButton />
        </Toolbar>
      }
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
      <TextInput source="username" label="Usuario" validate={required()} fullWidth />
      <PasswordInput
        source="password"
        label="Nueva contraseña (opcional)"
        helperText={`Déjala vacía para conservar la actual. Mínimo ${USER_POLICY.passwordMin} caracteres.`}
        validate={validateNewPassword}
        fullWidth
      />
      <TextInput source="personName" label="Nombre completo" validate={required()} fullWidth />
      <SelectInput
        source="documentType"
        label="Tipo de documento"
        choices={[...DOCUMENT_TYPE_CHOICES]}
        fullWidth
      />
      <TextInput source="dni" label="Número de documento" fullWidth />
      <DniLookup />
      <ManagedRoleInput label="Rol" source="role" validate={required()} fullWidth />
      <ManagedAreaInput label="Área" source="area" fullWidth />
      <TextInput source="whatsapp" label="WhatsApp" fullWidth />
      <DateInput source="birthday" label="Cumpleaños" fullWidth />
      <SelectInput
        source="documentSexCode"
        label="Sexo según documento"
        choices={[...DOCUMENT_SEX_CODE_CHOICES]}
        helperText="Código recibido del proveedor."
        fullWidth
      />
    </SimpleForm>
  </Edit>
);
