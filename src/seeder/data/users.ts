import { UserRole } from '../../users/entities/user.entity';

export const users = [
  {
    email: 'admin@trustpay.app',
    password: '123456',
    fullName: 'Administrador',
    role: UserRole.ADMIN,
    country: 'Bolivia',
  },
  {
    email: 'merchant@trustpay.app',
    password: '123456',
    fullName: 'Comerciante Demo',
    role: UserRole.MERCHANT,
    country: 'Bolivia',
  },
];
