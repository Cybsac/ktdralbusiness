"use client";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Box, Button } from "@mui/material";
import {
  Create,
  DateInput,
  PasswordInput,
  required,
  SaveButton,
  SelectInput,
  SimpleForm,
  TextInput,
  Toolbar,
  useRedirect,
  useResourceContext,
} from "react-admin";

import { DOCUMENT_SEX_CODE_CHOICES, DOCUMENT_TYPE_CHOICES } from "@/lib/users/document";
import { AREA_CHOICES, USER_POLICY } from "@/lib/users/policy";

import { DniLookup } from "./DniLookup";
import { ManagedRoleInput } from "./management-context";

const CustomToolbar = () => {
  const redirect = useRedirect();
  const resource = useResourceContext();

  return (
    <Toolbar
      sx={{
        display: "flex",
        flexDirection: { xs: "column-reverse", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        justifyContent: "space-between",
        gap: { xs: 1.5, sm: 2 },
        mt: { xs: 2, sm: 0 },
      }}
    >
      <Button
        variant="outlined"
        startIcon={<ArrowBackIcon />}
        onClick={() => redirect("list", resource ?? "users")}
        sx={{ minWidth: { xs: "100%", sm: "auto" } }}
      >
        Volver a lista
      </Button>
      <SaveButton label="Guardar usuario" sx={{ width: { xs: "100%", sm: "auto" } }} />
    </Toolbar>
  );
};

export const UserCreate = (props: any) => (
  <Create {...props}>
    <SimpleForm
      toolbar={<CustomToolbar />}
      defaultValues={{ role: "STAFF" }}
      sx={{
        maxWidth: { xs: "100%", sm: "95%", md: "85%", lg: 1200 },
        mx: "auto",
        px: { xs: 1.5, sm: 3, md: 4 },
        "& .MuiTextField-root": {
          mb: 2,
        },
        "& .MuiFormControl-root": {
          mb: 2,
        },
      }}
    >
      {/* Primera fila: Username y Password */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(280px, 1fr))" },
          gap: { xs: 1.5, sm: 2.5 },
          width: "100%",
          mb: { xs: 2, sm: 2.5 },
        }}
      >
        <TextInput source="username" label="Usuario" validate={required()} fullWidth />
        <PasswordInput
          source="password"
          label="Contraseña"
          validate={[
            required(),
            (value) =>
              value && value.length < USER_POLICY.passwordMin
                ? `Mínimo ${USER_POLICY.passwordMin} caracteres`
                : undefined,
          ]}
          fullWidth
        />
      </Box>

      {/* Segunda fila: Name y DNI */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(280px, 1fr))" },
          gap: { xs: 1.5, sm: 2.5 },
          width: "100%",
          mb: { xs: 2, sm: 2.5 },
        }}
      >
        <TextInput source="dni" label="Número de documento" validate={required()} fullWidth />
        <TextInput source="personName" label="Nombre completo" validate={required()} fullWidth />
      </Box>

      <SelectInput
        source="documentType"
        label="Tipo de documento"
        choices={[...DOCUMENT_TYPE_CHOICES]}
        validate={required()}
        fullWidth
      />
      <DniLookup />
      <SelectInput
        source="documentSexCode"
        label="Sexo según documento"
        choices={[...DOCUMENT_SEX_CODE_CHOICES]}
        helperText="Código recibido del proveedor; verifica su equivalencia antes de interpretarlo."
        fullWidth
      />
      {/* Tercera fila: Role y Area */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(280px, 1fr))" },
          gap: { xs: 1.5, sm: 2.5 },
          width: "100%",
          mb: { xs: 2, sm: 2.5 },
        }}
      >
        <ManagedRoleInput label="Rol" source="role" validate={required()} fullWidth />
        <SelectInput
          label="Área"
          source="area"
          choices={AREA_CHOICES}
          validate={required()}
          fullWidth
        />
      </Box>

      {/* Cuarta fila: WhatsApp y Birthday */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(280px, 1fr))" },
          gap: { xs: 1.5, sm: 2.5 },
          width: "100%",
        }}
      >
        <TextInput source="whatsapp" label="WhatsApp" validate={required()} fullWidth />
        <DateInput source="birthday" label="Cumpleaños" validate={required()} fullWidth />
      </Box>
    </SimpleForm>
  </Create>
);
