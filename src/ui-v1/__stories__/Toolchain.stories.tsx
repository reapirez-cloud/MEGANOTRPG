import type { Meta, StoryObj } from "@storybook/react-vite";

function ToolchainProbe() {
  return (
    <main
      aria-label="MEGANOT UI v1 toolchain probe"
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <section>
        <h1>MEGANOT UI v1.0</h1>
        <p>Storybook is connected and ready for the new UI foundation.</p>
      </section>
    </main>
  );
}

const meta = {
  title: "UI v1/Foundation/Toolchain",
  component: ToolchainProbe,
  tags: ["autodocs"],
} satisfies Meta<typeof ToolchainProbe>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
