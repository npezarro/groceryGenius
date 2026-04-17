// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SavedShoppingList } from "../lib/types";

// --- Skip-to-content link tests (App.tsx) ---

// Mock all App dependencies
vi.mock("@tanstack/react-query", () => ({
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/hooks/use-auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/ui/toaster", () => ({
  Toaster: () => null,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("wouter", () => ({
  Switch: ({ children }: { children: React.ReactNode }) => children,
  Route: () => null,
  Router: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/queryClient", () => ({
  queryClient: {},
}));
vi.mock("@/lib/api", () => ({
  BASE_PATH: "",
  apiUrl: (path: string) => path,
}));
vi.mock("../components/LoadTestDataBar", () => ({
  default: () => null,
}));

import App from "../App";

describe("Skip-to-content link", () => {
  it("renders as first focusable element with correct href", () => {
    render(<App />);
    const skipLink = screen.getByText("Skip to main content");
    expect(skipLink).toBeDefined();
    expect(skipLink.getAttribute("href")).toBe("#main-content");
    expect(skipLink.tagName).toBe("A");
  });

  it("has sr-only class for visual hiding", () => {
    render(<App />);
    const skipLink = screen.getByText("Skip to main content");
    expect(skipLink.className).toContain("sr-only");
  });
});

// --- List selector accessibility tests ---

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) => <button {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron-down" />,
  Plus: () => <span data-testid="plus" />,
  Trash2: () => <span data-testid="trash" />,
  Check: () => <span data-testid="check" />,
  X: () => <span data-testid="x" />,
  Loader2: () => <span data-testid="loader" />,
}));

import ListSelector from "../components/list-selector";
import userEvent from "@testing-library/user-event";

const mockLists: SavedShoppingList[] = [
  { id: "1", name: "Weekly Groceries", items: [{ id: "i1", name: "milk" }, { id: "i2", name: "eggs" }], userId: null, createdAt: null, updatedAt: null },
  { id: "2", name: "Party Supplies", items: [{ id: "i3", name: "chips" }], userId: null, createdAt: null, updatedAt: null },
];

const listProps = {
  lists: mockLists,
  activeListId: "1",
  activeListName: "Weekly Groceries",
  isSaving: false,
  onSwitch: vi.fn(),
  onCreate: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
};

describe("ListSelector accessibility", () => {
  it("dropdown trigger has aria-expanded and aria-label", () => {
    render(<ListSelector {...listProps} />);
    const trigger = screen.getByRole("button", { name: /switch shopping list/i });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-label")).toContain("Weekly Groceries");
  });

  it("list items have aria-label for screen readers", async () => {
    const user = userEvent.setup();
    render(<ListSelector {...listProps} />);
    const trigger = screen.getByRole("button", { name: /switch shopping list/i });
    await user.click(trigger);

    const switchBtn = screen.getByRole("button", { name: "Switch to Party Supplies" });
    expect(switchBtn).toBeDefined();
  });

  it("dropdown has listbox role", async () => {
    const user = userEvent.setup();
    render(<ListSelector {...listProps} />);
    const trigger = screen.getByRole("button", { name: /switch shopping list/i });
    await user.click(trigger);

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeDefined();
    expect(listbox.getAttribute("aria-label")).toBe("Shopping lists");
  });
});
