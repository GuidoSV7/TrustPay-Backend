export class BusinessResponseDto {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  category: string | null;
  logoUrl: string | null;
  walletAddress: string;
  isActive: boolean;
  isVerified: boolean;
  solanaTxRegister: string | null;
  solanaTxVerify: string | null;
  createdAt: Date;
  updatedAt: Date;
}
