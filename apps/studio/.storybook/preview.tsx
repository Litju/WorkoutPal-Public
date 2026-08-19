import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error",
    },
    layout: "fullscreen",
  },
};

export default preview;
