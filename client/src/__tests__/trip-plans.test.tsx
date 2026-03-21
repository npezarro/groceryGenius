// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TripPlans from "../components/trip-plans";
import { TripPlan } from "../lib/types";

function makePlan(overrides: Partial<TripPlan> = {}): TripPlan {
  return {
    stores: [
      {
        store: { id: "s1", name: "Trader Joe's", address: "123 Main St", lat: 49.28, lng: -123.12 },
        items: [
          { id: "i1", name: "Milk" },
          { id: "i2", name: "Bread" },
        ],
        subtotal: 12.5,
      },
    ],
    totalCost: 12.5,
    totalTime: 25,
    totalDistance: 3.2,
    score: 85,
    coverage: 1.0,
    ...overrides,
  };
}

describe("TripPlans component", () => {
  const defaultProps = {
    tripPlans: [] as TripPlan[],
    isLoading: false,
    onSelectPlan: vi.fn(),
    userCoordinates: { lat: 49.28, lng: -123.12 },
  };

  it("renders loading state", () => {
    render(<TripPlans {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Calculating optimal routes...")).toBeInTheDocument();
  });

  it("renders empty state when no plans", () => {
    render(<TripPlans {...defaultProps} />);
    expect(screen.getByTestId("no-results")).toBeInTheDocument();
    expect(screen.getByText("No trip plans found")).toBeInTheDocument();
  });

  it("renders trip plans", () => {
    const plan = makePlan();
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByTestId("trip-plans")).toBeInTheDocument();
    expect(screen.getByTestId("trip-plan-0")).toBeInTheDocument();
  });

  it("displays plan cost", () => {
    const plan = makePlan({ totalCost: 42.99 });
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("$42.99")).toBeInTheDocument();
  });

  it("displays store names", () => {
    const plan = makePlan();
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument();
  });

  it("displays coverage badge", () => {
    const plan = makePlan({ coverage: 0.75 });
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("75% coverage")).toBeInTheDocument();
  });

  it("displays item names", () => {
    const plan = makePlan();
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("Milk")).toBeInTheDocument();
    expect(screen.getByText("Bread")).toBeInTheDocument();
  });

  it("calls onSelectPlan when Choose button clicked", async () => {
    const onSelectPlan = vi.fn();
    const plan = makePlan();
    render(<TripPlans {...defaultProps} tripPlans={[plan]} onSelectPlan={onSelectPlan} />);

    await userEvent.click(screen.getByTestId("button-select-plan-0"));
    expect(onSelectPlan).toHaveBeenCalledWith(plan);
  });

  it("labels single store trip correctly", () => {
    const plan = makePlan();
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("Single Store Trip")).toBeInTheDocument();
  });

  it("labels multi-store combo correctly", () => {
    const plan = makePlan({
      stores: [
        { store: { id: "s1", name: "Store A", address: "a", lat: 49.1, lng: -123.1 }, items: [{ id: "i1", name: "Milk" }], subtotal: 5 },
        { store: { id: "s2", name: "Store B", address: "b", lat: 49.2, lng: -123.2 }, items: [{ id: "i2", name: "Bread" }], subtotal: 7 },
      ],
    });
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("2 Store Combo")).toBeInTheDocument();
  });

  it("disables map buttons when no coordinates", () => {
    const plan = makePlan();
    render(<TripPlans {...defaultProps} tripPlans={[plan]} userCoordinates={null} />);
    expect(screen.getByTestId("button-google-maps-0")).toBeDisabled();
    expect(screen.getByTestId("button-apple-maps-0")).toBeDisabled();
  });

  it("renders multiple plans", () => {
    const plans = [makePlan({ score: 90 }), makePlan({ score: 70, totalCost: 15 })];
    render(<TripPlans {...defaultProps} tripPlans={plans} />);
    expect(screen.getByTestId("trip-plan-0")).toBeInTheDocument();
    expect(screen.getByTestId("trip-plan-1")).toBeInTheDocument();
  });

  it("displays travel time formatted", () => {
    const plan = makePlan({ totalTime: 90 });
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });

  it("displays distance", () => {
    const plan = makePlan({ totalDistance: 7.5 });
    render(<TripPlans {...defaultProps} tripPlans={[plan]} />);
    expect(screen.getByText("7.5 mi")).toBeInTheDocument();
  });
});
