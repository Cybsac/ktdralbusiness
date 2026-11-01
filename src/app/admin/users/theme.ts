import { createTheme } from "@mui/material/styles";
// Create theme function that adapts to app theme
export const createAppTheme = (mode: "light" | "dark") =>
  createTheme({
    palette: {
      mode,
      primary: {
        main: mode === "dark" ? "#38bdf8" : "#0ea5e9", // brand-400 for dark, brand-500 for light
        light: "#38bdf8", // brand-400
        dark: "#0284c7", // brand-600
        contrastText: "#ffffff",
      },
      secondary: {
        main: mode === "dark" ? "#0369a1" : "#075985", // brand-700 for dark, brand-800 for light
        light: "#0369a1", // brand-700
        dark: "#0c4a6e", // brand-900
        contrastText: "#ffffff",
      },
      background: {
        default: mode === "dark" ? "#0f172a" : "#f8fafc",
        paper: mode === "dark" ? "#1e293b" : "#ffffff",
      },
      text: {
        primary: mode === "dark" ? "#f1f5f9" : "#1e293b",
        secondary: mode === "dark" ? "#94a3b8" : "#64748b",
      },
    },
    typography: {
      fontFamily: "system-ui, Inter, Segoe UI, Roboto, Arial, sans-serif",
      h4: {
        fontWeight: 600,
        color: mode === "dark" ? "#f1f5f9" : "#1e293b",
      },
      h6: {
        fontWeight: 600,
        color: mode === "dark" ? "#f1f5f9" : "#1e293b",
      },
    },
    components: {
      MuiTableContainer: {
        styleOverrides: {
          root: {
            overflowX: "auto",
            borderRadius: 8,
            backgroundColor: mode === "dark" ? "#1e293b" : "#ffffff",
          },
        },
      },
      MuiTable: {
        styleOverrides: {
          root: {
            minWidth: 800,
            backgroundColor: mode === "dark" ? "#1e293b" : "#ffffff",
            "& .MuiTableCell-root": {
              borderBottom: `1px solid ${mode === "dark" ? "#334155" : "#e2e8f0"}`,
              color: mode === "dark" ? "#f1f5f9" : "#1e293b",
            },
            "& .MuiTableHead-root .MuiTableCell-root": {
              backgroundColor: mode === "dark" ? "#1e293b" : "#f8fafc",
              color: mode === "dark" ? "#f1f5f9" : "#1e293b",
              fontWeight: 600,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            boxShadow:
              mode === "dark"
                ? "0 1px 3px 0 rgb(0 0 0 / 0.3), 0 1px 2px -1px rgb(0 0 0 / 0.3)"
                : "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
            backgroundColor: mode === "dark" ? "#1e293b" : "#ffffff",
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            textTransform: "none",
            fontWeight: 500,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 6,
              backgroundColor: mode === "dark" ? "#1e293b" : "#ffffff",
              "& fieldset": {
                borderColor: mode === "dark" ? "#334155" : "#e2e8f0",
              },
              "&:hover fieldset": {
                borderColor: mode === "dark" ? "#475569" : "#cbd5e1",
              },
              "&.Mui-focused fieldset": {
                borderColor: mode === "dark" ? "#38bdf8" : "#0ea5e9",
              },
            },
            "& .MuiInputLabel-root": {
              color: mode === "dark" ? "#94a3b8" : "#64748b",
            },
            "& .MuiOutlinedInput-input": {
              color: mode === "dark" ? "#f1f5f9" : "#1e293b",
            },
          },
        },
      },
      MuiFormControl: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: 6,
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${mode === "dark" ? "#334155" : "#e2e8f0"}`,
            "& .MuiTab-root": {
              textTransform: "none",
              fontWeight: 500,
              minHeight: 48,
              color: mode === "dark" ? "#94a3b8" : "#64748b",
              "&.Mui-selected": {
                color: mode === "dark" ? "#38bdf8" : "#0ea5e9",
              },
            },
            "& .MuiTabs-indicator": {
              backgroundColor: mode === "dark" ? "#38bdf8" : "#0ea5e9",
            },
          },
        },
      },
    },
  });
