import { z } from "zod";

export const inviteSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  role: z.enum(["restaurant_admin", "user"]),
});

export type InviteValues = z.infer<typeof inviteSchema>;
