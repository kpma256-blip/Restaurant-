export const USER_ROLES = ["ADMIN", "MANAGER", "STAFF"] as const;

export const WASTE_REASONS = [
  { value: "SPOILED", label: "Spoiled" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "DROPPED", label: "Dropped" },
  { value: "EXPIRED", label: "Expired" },
  { value: "OVERPRODUCTION", label: "Overproduction" },
  { value: "STAFF_MEAL", label: "Staff meal" },
  { value: "OTHER", label: "Other" },
] as const;

export const UNIT_DIMENSIONS = [
  { value: "WEIGHT", label: "Weight" },
  { value: "VOLUME", label: "Volume" },
  { value: "COUNT", label: "Count" },
] as const;

export const STOCK_STATUS = {
  green: { label: "Healthy", color: "emerald" },
  yellow: { label: "Low", color: "amber" },
  red: { label: "Critical", color: "rose" },
} as const;

export const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: "Invalid input. Please check your entries.",
  401: "You are not authorized to perform this action.",
  403: "You do not have permission to access this.",
  404: "The requested resource was not found.",
  409: "This action conflicts with existing data.",
  422: "Please check your input and try again.",
  500: "Server error. Please try again later.",
} as const;

export const getErrorMessage = (error: any): string => {
  if (typeof error === "string") return error;
  if (error?.response?.status) {
    return HTTP_STATUS_MESSAGES[error.response.status] || "An error occurred";
  }
  return error?.message || "An unexpected error occurred";
};
