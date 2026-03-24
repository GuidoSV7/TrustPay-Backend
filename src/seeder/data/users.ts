import { UserRole } from '../../users/entities/user.entity';

/** Direcciones base58 válidas (devnet/demo) — distintas por usuario */
export const users = [
  {
    email: 'admin@trustpay.app',
    password: '123456',
    fullName: 'Administrador',
    role: UserRole.ADMIN,
    country: 'Bolivia',
    walletAddress: '11111111111111111111111111112',
  },
  {
    email: 'merchant@trustpay.app',
    password: '123456',
    fullName: 'Comerciante Demo',
    role: UserRole.MERCHANT,
    country: 'Bolivia',
    /** Misma que `TEST_WALLET` en Frontend de Prueba `index.html` */
    walletAddress: '5m6WCVCXebea5ZfCxYm2yDkvDuyYnPUqMoCXVkP3tK5U',
  },
];
