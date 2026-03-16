export class BusinessResponseDto {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  category: string | null;
  logoUrl: string | null;
  walletAddress: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
