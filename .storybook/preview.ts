import { createElement } from "react";
import type { Preview } from "@storybook/react-vite";

import "../src/ui-v1/ui-v1.css";

const preview: Preview = {
  decorators: [
    (Story) =>
      createElement(
        "div",
        { className: "mg-theme mg-story-root" },
        createElement(Story),
      ),
  ],
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
