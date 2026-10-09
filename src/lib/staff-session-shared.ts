export type StaffRole = "manager" | "reception";

export type StaffSession = {
  id: number;
  username: string;
  role: StaffRole;
};

export const COOKIE_NAME = "restaurant_staff_session";
