import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  role: z.string().min(1, "Please select a role or category"),
});

export type InviteValues = z.infer<typeof inviteSchema>;
