"use client";
import { createAppTheme } from "./theme";
import { UserManagementContext } from "./management-context";

import { ChangeEvent, useMemo, useRef, useState } from "react";
import { Admin, Resource } from "react-admin";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import {
  CssBaseline,
  Tabs,
  Tab,
  Box,
  Stack,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useTheme } from "@/components/theme/ThemeProvider";
import { dataProvider } from "@/lib/react-admin-data-provider";
import { UserList } from "./UserList";
import { UserCreate } from "./UserCreate";
import { UserEdit } from "./UserEdit";

// Custom layout without AppBar
const CustomLayout = ({ children }: any) => (
  <Box
    sx={{
      minHeight: "100vh",
      backgroundColor: "var(--color-bg-soft)",
      px: { xs: 1.5, sm: 3, md: 4 },
      py: { xs: 2, sm: 3, md: 4 },
    }}
  >
    {children}
  </Box>
);

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

type FeedbackSeverity = "success" | "error" | "info" | "warning";

interface FeedbackState {
  open: boolean;
  message: string;
  severity: FeedbackSeverity;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`users-tabpanel-${index}`}
      aria-labelledby={`users-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ width: "100%", px: { xs: 0, sm: 2 }, py: { xs: 2, sm: 3 } }}>{children}</Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `users-tab-${index}`,
    "aria-controls": `users-tabpanel-${index}`,
  };
}

export default function UsersWithTabs({ actor }: { actor: { userId: string; role: string } }) {
  const { resolved } = useTheme();
  const [tabValue, setTabValue] = useState(0);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [isResettingPasswords, setIsResettingPasswords] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>({
    open: false,
    message: "",
    severity: "success",
  });

  // Create theme based on current app theme
  const theme = useMemo(() => createAppTheme(resolved), [resolved]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleFeedback = (message: string, severity: FeedbackSeverity = "success") => {
    setFeedback({ open: true, message, severity });
  };

  const handleFeedbackClose = () => {
    setFeedback((prev) => ({ ...prev, open: false }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setBackupFile(file);
  };

  const downloadCredentials = (
    credentials: Array<{ username: string; password: string }> | undefined
  ) => {
    if (!credentials?.length) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), credentials }, null, 2)], {
        type: "application/json",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `claves-temporales-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const handleDownloadBackup = async () => {
    setIsDownloadingBackup(true);
    try {
      const response = await fetch("/api/admin/users/backup", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        let errorMessage = "No se pudo descargar el backup.";
        try {
          const data = await response.json();
          errorMessage = data?.error || data?.message || errorMessage;
        } catch (error) {
          console.error("Error parsing backup download response", error);
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const fallbackName = `usuarios_backup_${new Date().toISOString().split("T")[0]}.json`;
      const filename = match?.[1] ?? fallbackName;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      handleFeedback("Backup descargado correctamente.", "success");
    } catch (error: any) {
      console.error("Error downloading backup", error);
      handleFeedback(error?.message || "Error al descargar el backup.", "error");
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleRestoreBackup = async () => {
    if (
      !window.confirm(
        "¿Restaurar perfiles desde el archivo? Las cuentas nuevas recibirán claves temporales individuales."
      )
    )
      return;
    if (!backupFile) {
      handleFeedback("Selecciona un archivo de backup antes de restaurar.", "error");
      return;
    }

    setIsRestoringBackup(true);
    try {
      const formData = new FormData();
      formData.append("backup", backupFile);

      const response = await fetch("/api/admin/users/backup", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch (error) {
        console.error("Error parsing restore backup response", error);
      }

      if (!response.ok) {
        const errorMessage = data?.error || data?.message || "No se pudo restaurar el backup.";
        throw new Error(errorMessage);
      }

      downloadCredentials(data?.credentials);
      handleFeedback(data?.message || "Backup restaurado correctamente.", "success");
      setBackupFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("Error restoring backup", error);
      handleFeedback(error?.message || "Error al restaurar el backup.", "error");
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleResetPasswords = async () => {
    if (
      !window.confirm(
        "¿Generar claves temporales individuales para las otras cuentas activas? Se descargará un archivo para distribuirlas."
      )
    )
      return;
    setIsResettingPasswords(true);
    try {
      const response = await fetch("/api/admin/users/reset-passwords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
        credentials: "include",
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch (error) {
        console.error("Error parsing reset passwords response", error);
      }

      if (!response.ok) {
        const errorMessage =
          data?.error || data?.message || "No se pudieron resetear las contraseñas.";
        throw new Error(errorMessage);
      }

      downloadCredentials(data?.credentials);
      const successMessage = data?.message
        ? `${data.message} Las cuentas afectadas deben actualizar su contraseña.`
        : "Contraseñas actualizadas correctamente. Las cuentas afectadas deben cambiar su contraseña.";
      handleFeedback(successMessage, "success");
    } catch (error: any) {
      console.error("Error resetting passwords", error);
      handleFeedback(error?.message || "Error al resetear contraseñas.", "error");
    } finally {
      setIsResettingPasswords(false);
    }
  };

  return (
    <UserManagementContext.Provider value={actor}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: "100vh",
            backgroundColor: "var(--color-bg-soft)",
            px: { xs: 1.5, sm: 3, md: 4 },
            py: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Box sx={{ maxWidth: 1400, width: "100%", mx: "auto" }}>
            <Typography
              component="h1"
              sx={{
                fontSize: { xs: "1.75rem", sm: "2rem" },
                fontWeight: 700,
                mb: 2.5,
                color: resolved === "dark" ? "#f1f5f9" : "#1e293b",
              }}
            >
              Gestión de Usuarios
            </Typography>

            <Box
              sx={{
                borderBottom: 1,
                borderColor: "divider",
                display: "flex",
                justifyContent: { xs: "flex-start", md: "center" },
              }}
            >
              <Tabs
                value={tabValue}
                onChange={handleTabChange}
                aria-label="users tabs"
                variant="scrollable"
                scrollButtons="auto"
                allowScrollButtonsMobile
              >
                <Tab label="Usuarios" {...a11yProps(0)} />
                {actor.role === "ADMIN" && <Tab label="Acciones de ADMIN" {...a11yProps(1)} />}
              </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0}>
              <Box sx={{ position: "relative", minHeight: 400, width: "100%" }}>
                <Admin
                  dataProvider={dataProvider}
                  theme={theme}
                  disableTelemetry
                  layout={CustomLayout}
                >
                  <Resource name="users" list={UserList} create={UserCreate} edit={UserEdit} />
                </Admin>
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <Stack spacing={2.5} sx={{ width: "100%" }}>
                {/* User Actions Section */}
                <Box
                  sx={{
                    backgroundColor: resolved === "dark" ? "#1e293b" : "#ffffff",
                    borderRadius: 2,
                    border: `1px solid ${resolved === "dark" ? "#334155" : "#e2e8f0"}`,
                    px: { xs: 2, sm: 3 },
                    py: { xs: 2.5, sm: 3 },
                  }}
                >
                  <Typography
                    component="h2"
                    sx={{
                      fontSize: { xs: "1.3rem", sm: "1.5rem" },
                      fontWeight: 700,
                      mb: { xs: 2, sm: 2.5 },
                      color: resolved === "dark" ? "#f1f5f9" : "#1e293b",
                    }}
                  >
                    Acciones de ADMIN
                  </Typography>

                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(auto-fit, minmax(260px, 1fr))",
                      },
                      gap: { xs: 2, sm: 3 },
                    }}
                  >
                    {/* Backup Download */}
                    <Card
                      elevation={0}
                      sx={{
                        height: "100%",
                        borderRadius: 2,
                        border: `1px solid ${resolved === "dark" ? "#475569" : "#cbd5e1"}`,
                        backgroundColor: resolved === "dark" ? "#0f172a" : "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <CardContent sx={{ pb: 1.5 }}>
                        <Typography
                          component="h3"
                          sx={{
                            fontSize: "1.05rem",
                            fontWeight: 600,
                            color: resolved === "dark" ? "#f1f5f9" : "#1e293b",
                          }}
                        >
                          📥 Descargar Backup
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            color: resolved === "dark" ? "#94a3b8" : "#64748b",
                          }}
                        >
                          Descargar perfiles y configuración de personal, sin contraseñas ni
                          historial operativo.
                        </Typography>
                      </CardContent>
                      <CardActions sx={{ mt: "auto", pt: 0, px: 2, pb: 2 }}>
                        <Button
                          variant="contained"
                          fullWidth
                          sx={{
                            backgroundColor: "#0ea5e9",
                            "&:hover": { backgroundColor: "#0284c7" },
                          }}
                          onClick={handleDownloadBackup}
                          disabled={isDownloadingBackup}
                          startIcon={
                            isDownloadingBackup ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : undefined
                          }
                        >
                          {isDownloadingBackup ? "Descargando..." : "Descargar Backup"}
                        </Button>
                      </CardActions>
                    </Card>

                    {/* Backup Restore */}
                    <Card
                      elevation={0}
                      sx={{
                        height: "100%",
                        borderRadius: 2,
                        border: `1px solid ${resolved === "dark" ? "#475569" : "#cbd5e1"}`,
                        backgroundColor: resolved === "dark" ? "#0f172a" : "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <CardContent sx={{ pb: 1.5 }}>
                        <Typography
                          component="h3"
                          sx={{
                            fontSize: "1.05rem",
                            fontWeight: 600,
                            color: resolved === "dark" ? "#f1f5f9" : "#1e293b",
                          }}
                        >
                          📤 Restaurar Backup
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            color: resolved === "dark" ? "#94a3b8" : "#64748b",
                          }}
                        >
                          Restaurar usuarios desde un archivo de backup previamente descargado.
                        </Typography>
                        <Box sx={{ mt: 2 }}>
                          <Button
                            variant="outlined"
                            component="label"
                            fullWidth
                            sx={{
                              color: resolved === "dark" ? "#38bdf8" : "#0ea5e9",
                              borderColor: resolved === "dark" ? "#38bdf8" : "#0ea5e9",
                              "&:hover": {
                                borderColor: resolved === "dark" ? "#0ea5e9" : "#0284c7",
                                backgroundColor: "transparent",
                              },
                            }}
                          >
                            Seleccionar archivo
                            <input
                              hidden
                              type="file"
                              accept=".json,.sql"
                              onChange={handleFileChange}
                              ref={fileInputRef}
                            />
                          </Button>
                          {backupFile && (
                            <Typography
                              variant="caption"
                              sx={{
                                display: "block",
                                mt: 1,
                                color: resolved === "dark" ? "#cbd5f9" : "#475569",
                                wordBreak: "break-word",
                              }}
                            >
                              Archivo seleccionado: {backupFile.name}
                            </Typography>
                          )}
                        </Box>
                      </CardContent>
                      <CardActions sx={{ mt: "auto", pt: 0, px: 2, pb: 2 }}>
                        <Button
                          variant="contained"
                          fullWidth
                          sx={{
                            backgroundColor: "#10b981",
                            "&:hover": { backgroundColor: "#059669" },
                          }}
                          onClick={handleRestoreBackup}
                          disabled={isRestoringBackup || !backupFile}
                          startIcon={
                            isRestoringBackup ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : undefined
                          }
                        >
                          {isRestoringBackup ? "Restaurando..." : "Restaurar Backup"}
                        </Button>
                      </CardActions>
                    </Card>

                    {/* Reset Passwords */}
                    <Card
                      elevation={0}
                      sx={{
                        height: "100%",
                        borderRadius: 2,
                        border: `1px solid ${resolved === "dark" ? "#475569" : "#cbd5e1"}`,
                        backgroundColor: resolved === "dark" ? "#0f172a" : "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <CardContent sx={{ pb: 1.5 }}>
                        <Typography
                          component="h3"
                          sx={{
                            fontSize: "1.05rem",
                            fontWeight: 600,
                            color: resolved === "dark" ? "#f1f5f9" : "#1e293b",
                          }}
                        >
                          🔑 Reset de Contraseñas
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            color: resolved === "dark" ? "#94a3b8" : "#64748b",
                          }}
                        >
                          Genera claves temporales distintas para las otras cuentas activas y
                          descarga el archivo de entrega.
                        </Typography>
                      </CardContent>
                      <CardActions sx={{ mt: "auto", pt: 0, px: 2, pb: 2 }}>
                        <Button
                          variant="contained"
                          fullWidth
                          sx={{
                            backgroundColor: "#f59e0b",
                            "&:hover": { backgroundColor: "#d97706" },
                          }}
                          onClick={handleResetPasswords}
                          disabled={isResettingPasswords}
                          startIcon={
                            isResettingPasswords ? (
                              <CircularProgress size={18} color="inherit" />
                            ) : undefined
                          }
                        >
                          {isResettingPasswords ? "Reseteando..." : "Reset Passwords"}
                        </Button>
                      </CardActions>
                    </Card>

                    {/* Bulk User Operations */}
                    <Card
                      elevation={0}
                      sx={{
                        height: "100%",
                        borderRadius: 2,
                        border: `1px solid ${resolved === "dark" ? "#475569" : "#cbd5e1"}`,
                        backgroundColor: resolved === "dark" ? "#0f172a" : "#f8fafc",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <CardContent sx={{ pb: 1.5 }}>
                        <Typography
                          component="h3"
                          sx={{
                            fontSize: "1.05rem",
                            fontWeight: 600,
                            color: resolved === "dark" ? "#f1f5f9" : "#1e293b",
                          }}
                        >
                          👥 Operaciones Masivas
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            mt: 1,
                            color: resolved === "dark" ? "#94a3b8" : "#64748b",
                          }}
                        >
                          Activar, desactivar o eliminar múltiples usuarios simultáneamente.
                        </Typography>
                      </CardContent>
                      <CardActions sx={{ mt: "auto", pt: 0, px: 2, pb: 2 }}>
                        <Button
                          variant="contained"
                          fullWidth
                          sx={{
                            backgroundColor: "#8b5cf6",
                            "&:hover": { backgroundColor: "#7c3aed" },
                          }}
                        >
                          Operaciones Masivas
                        </Button>
                      </CardActions>
                    </Card>
                  </Box>
                </Box>
              </Stack>
            </TabPanel>
          </Box>
        </Box>
        <Snackbar
          open={feedback.open}
          autoHideDuration={6000}
          onClose={handleFeedbackClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert
            onClose={handleFeedbackClose}
            severity={feedback.severity}
            sx={{ width: "100%" }}
            variant="filled"
          >
            {feedback.message}
          </Alert>
        </Snackbar>
      </MuiThemeProvider>
    </UserManagementContext.Provider>
  );
}
