import type { Meta, StoryObj } from "@storybook/react-vite"

import UiV1App from "./UiV1App"
import "./styles.css"

const meta = {
  title: "UI 1.0/Isolated App",
  component: UiV1App,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof UiV1App>

export default meta

type Story = StoryObj<typeof meta>

export const Home: Story = {}
