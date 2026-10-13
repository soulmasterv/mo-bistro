export function testEnvironmentAllowed() {
  if (process.env.VERCEL_ENV)
    return (
      process.env.VERCEL_ENV === "preview" ||
      process.env.VERCEL_ENV === "development"
    );
  return process.env.NODE_ENV === "development";
}
