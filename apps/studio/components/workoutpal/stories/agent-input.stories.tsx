import type { Meta, StoryObj } from "@storybook/react";
import {
  PromptInput,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";

const meta = {
  title: "Agent/Prompt input",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  render: () => (
    <main className="wp-auth-shell">
      <section className="wp-story-card wp-story-card-narrow">
        <p className="wp-overline">AI Elements · Eve transport boundary</p>
        <h1>Ask WorkoutPal</h1>
        <p className="wp-story-copy">
          The input is composable; the authenticated Eve session and server
          tools remain the source of authority.
        </p>
        <PromptInput aria-label="Agent input story" onSubmit={() => undefined}>
          <PromptInputTextarea
            aria-label="Ask about stored records"
            placeholder="Ask about stored records…"
          />
          <PromptInputSubmit />
        </PromptInput>
      </section>
    </main>
  ),
};
