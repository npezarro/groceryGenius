// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LocationPreferences from "../components/location-preferences";

// Mock useToast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// Mock apiUrl
vi.mock("@/lib/api", () => ({
  apiUrl: (path: string) => path,
}));

const defaultProps = {
  location: "",
  coordinates: null,
  radius: 10,
  weights: { price: 0.5, time: 0.3, distance: 0.2 },
  userHasMembership: false,
  onLocationChange: vi.fn(),
  onCoordinatesChange: vi.fn(),
  onRadiusChange: vi.fn(),
  onWeightsChange: vi.fn(),
  onMembershipChange: vi.fn(),
  onGeneratePlans: vi.fn(),
  isGenerating: false,
};

describe("LocationPreferences component", () => {
  it("renders location input", () => {
    render(<LocationPreferences {...defaultProps} />);
    expect(screen.getByTestId("input-location")).toBeInTheDocument();
  });

  it("renders Generate Trip Plans button", () => {
    render(<LocationPreferences {...defaultProps} />);
    expect(screen.getByTestId("button-generate-plans")).toBeInTheDocument();
    expect(screen.getByText("Generate Trip Plans")).toBeInTheDocument();
  });

  it("disables generate button without coordinates", () => {
    render(<LocationPreferences {...defaultProps} coordinates={null} />);
    expect(screen.getByTestId("button-generate-plans")).toBeDisabled();
  });

  it("enables generate button with coordinates", () => {
    render(
      <LocationPreferences
        {...defaultProps}
        coordinates={{ lat: 49.28, lng: -123.12 }}
      />
    );
    expect(screen.getByTestId("button-generate-plans")).not.toBeDisabled();
  });

  it("shows Generating... when isGenerating", () => {
    render(
      <LocationPreferences
        {...defaultProps}
        coordinates={{ lat: 49.28, lng: -123.12 }}
        isGenerating={true}
      />
    );
    expect(screen.getByText("Generating...")).toBeInTheDocument();
  });

  it("calls onGeneratePlans when button clicked", async () => {
    const onGeneratePlans = vi.fn();
    render(
      <LocationPreferences
        {...defaultProps}
        coordinates={{ lat: 49.28, lng: -123.12 }}
        onGeneratePlans={onGeneratePlans}
      />
    );
    await userEvent.click(screen.getByTestId("button-generate-plans"));
    expect(onGeneratePlans).toHaveBeenCalled();
  });

  it("displays found coordinates text", () => {
    render(
      <LocationPreferences
        {...defaultProps}
        coordinates={{ lat: 49.2827, lng: -123.1207 }}
      />
    );
    expect(screen.getByText(/Found: 49.2827, -123.1207/)).toBeInTheDocument();
  });

  it("renders weight percentages", () => {
    render(<LocationPreferences {...defaultProps} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
  });

  it("displays radius value", () => {
    render(<LocationPreferences {...defaultProps} radius={15} />);
    expect(screen.getByText(/15 miles/)).toBeInTheDocument();
  });

  it("shows membership toggle", () => {
    render(<LocationPreferences {...defaultProps} />);
    expect(screen.getByTestId("switch-membership")).toBeInTheDocument();
  });

  it("shows member text when membership enabled", () => {
    render(<LocationPreferences {...defaultProps} userHasMembership={true} />);
    expect(
      screen.getByText(/Member pricing and exclusive deals/)
    ).toBeInTheDocument();
  });

  it("shows non-member text when membership disabled", () => {
    render(<LocationPreferences {...defaultProps} userHasMembership={false} />);
    expect(screen.getByText(/Enable to see member discounts/)).toBeInTheDocument();
  });

  it("calls onLocationChange when typing in location input", async () => {
    const onLocationChange = vi.fn();
    render(
      <LocationPreferences {...defaultProps} onLocationChange={onLocationChange} />
    );
    await userEvent.type(screen.getByTestId("input-location"), "A");
    expect(onLocationChange).toHaveBeenCalled();
  });
});
