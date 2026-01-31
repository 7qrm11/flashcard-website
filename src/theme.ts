import { createTheme } from "@mui/material/styles";

export type ThemeMode = "light" | "dark";

export function createAppTheme(mode: ThemeMode) {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: "#1a73e8",
      },
      secondary: {
        main: "#ea4335",
      },
      success: {
        main: "#34a853",
      },
      warning: {
        main: "#fbbc04",
      },
      background:
        mode === "dark"
          ? {
              default: "#202124",
              paper: "#303134",
            }
          : {
              default: "#f8f9fa",
              paper: "#ffffff",
            },
    },
    typography: {
      fontFamily: '"Roboto","Helvetica","Arial",sans-serif',
      h5: { fontWeight: 500 },
      h6: { fontWeight: 500 },
    },
    shape: {
      borderRadius: 16,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            colorScheme: mode,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            textTransform: "none",
            borderRadius: 999,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: "none",
          },
        },
      },
    },
  });
}
