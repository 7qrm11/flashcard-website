"use client";

import { Box } from "@mui/material";
import { useMemo } from "react";

type P5SketchFrameProps = Readonly<{
  code: string;
  width: number | null;
  height: number | null;
  title?: string;
}>;

function safeScript(code: string) {
  return code.replaceAll("</script>", "<\\/script>");
}

export default function P5SketchFrame({ code, width, height, title }: P5SketchFrameProps) {
  const w = Number.isFinite(width) && width ? Math.floor(width) : 640;
  const h = Number.isFinite(height) && height ? Math.floor(height) : 360;

  const srcDoc = useMemo(() => {
    const userCode = safeScript(code);
    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
      #root { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
      canvas { max-width: 100% !important; height: auto !important; display: block; }
      .err { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
             font-size: 12px; padding: 12px; color: #b00020; white-space: pre-wrap; word-break: break-word; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.9.2/lib/p5.min.js"></script>
    <script>
      (() => {
        const WIDTH = ${w};
        const HEIGHT = ${h};
        const mount = document.getElementById("root");
        try {
          new p5((p) => {
            ${userCode}
          }, mount);
        } catch (err) {
          mount.innerHTML = '<div class="err"></div>';
          const el = mount.querySelector('.err');
          if (el) el.textContent = String(err && err.stack ? err.stack : err);
        }
      })();
    </script>
  </body>
</html>`;
  }, [code, w, h]);

  return (
    <Box sx={{ width: "100%" }}>
      <Box
        sx={{
          position: "relative",
          width: "100%",
          aspectRatio: `${w}/${h}`,
          borderRadius: 1,
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper",
        }}
      >
        <iframe
          sandbox="allow-scripts"
          srcDoc={srcDoc}
          title={title ?? "p5 sketch"}
          style={{ border: 0, width: "100%", height: "100%" }}
        />
      </Box>
    </Box>
  );
}

