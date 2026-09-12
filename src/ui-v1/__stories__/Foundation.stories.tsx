import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import MeganotDialog from "../overlays/MeganotDialog";
import MeganotMenu from "../overlays/MeganotMenu";
import Pressable from "../primitives/Pressable";
import Surface from "../primitives/Surface";

function FoundationShowcase() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <main style={{ display: "grid", gap: "24px", maxWidth: "720px", margin: "0 auto" }}>
      <section style={{ display: "grid", gap: "8px" }}>
        <span className="mg-type-eyebrow">MEGANOT UI 1.0</span>
        <h1 className="mg-type-display">Foundation</h1>
        <p className="mg-type-body" style={{ maxWidth: "54ch" }}>
          Токены, типографика, материалы, движение и overlay-поведение живут отдельно от экранов.
        </p>
      </section>

      <section style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Surface tone="base" style={{ padding: "20px" }}>
          <span className="mg-type-eyebrow">Base</span>
          <h2 className="mg-type-heading" style={{ marginTop: "8px" }}>Основная поверхность</h2>
        </Surface>
        <Surface tone="elevated" style={{ padding: "20px" }}>
          <span className="mg-type-eyebrow">Elevated</span>
          <h2 className="mg-type-heading" style={{ marginTop: "8px" }}>Поднятый материал</h2>
        </Surface>
        <Surface tone="glass" style={{ padding: "20px" }}>
          <span className="mg-type-eyebrow">Glass</span>
          <h2 className="mg-type-heading" style={{ marginTop: "8px" }}>Полупрозрачный слой</h2>
        </Surface>
      </section>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
        <Pressable
          type="button"
          onClick={() => setDialogOpen(true)}
          style={{
            minHeight: "44px",
            padding: "0 16px",
            border: "1px solid var(--mg-color-border)",
            borderRadius: "var(--mg-radius-sm)",
            background: "var(--mg-color-surface-2)",
            color: "var(--mg-color-text-strong)",
          }}
        >
          Открыть Meganot Dialog
        </Pressable>

        <MeganotMenu
          trigger={
            <Pressable
              type="button"
              style={{
                minHeight: "44px",
                padding: "0 16px",
                border: "1px solid var(--mg-color-border)",
                borderRadius: "var(--mg-radius-sm)",
                background: "var(--mg-color-surface-2)",
                color: "var(--mg-color-text-strong)",
              }}
            >
              Открыть Meganot Menu
            </Pressable>
          }
          items={[
            { id: "open", label: "Открыть", detail: "Обычное действие" },
            { id: "disabled", label: "Недоступно", disabled: true },
            { id: "delete", label: "Удалить", detail: "Опасное действие", danger: true },
          ]}
        />
      </div>

      <MeganotDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Системный overlay"
        description="Radix отвечает за поведение и доступность. Внешний вид остаётся Meganot-specific."
      >
        <p className="mg-type-body">
          Этот слой рендерится через общий Layer Host и уважает системную настройку reduced motion.
        </p>
      </MeganotDialog>
    </main>
  );
}

const meta = {
  title: "UI v1/Foundation/System",
  component: FoundationShowcase,
  tags: ["autodocs"],
} satisfies Meta<typeof FoundationShowcase>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
