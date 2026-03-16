export class CompleteUserDto {
  id: string;
  email: string;
  fullName: string | null;
  role: string;
  country: string;
  walletAddress: string | null;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
