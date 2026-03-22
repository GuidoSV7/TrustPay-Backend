import { z } from 'zod';

export const updateBusinessSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable().transform((v) => v ?? null),
  category: z.string().max(100).optional().nullable().transform((v) => v ?? null),
  logoUrl: z.string().optional().nullable().transform((v) => v ?? null),
  walletAddress: z.string().min(1).max(255).optional(),
  /** Solo administradores pueden reactivar/desactivar vía PATCH (ver lógica en servicio) */
  isActive: z.boolean().optional(),
});

export type UpdateBusinessDto = z.infer<typeof updateBusinessSchema>;
