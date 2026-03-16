import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { loginSchema } from './schemas/login.schema';
import { registerSchema } from './schemas/register.schema';
import { changePasswordSchema } from './schemas/change-password.schema';
import { verifyPasswordSchema } from './schemas/verify-password.schema';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body(new ZodValidationPipe(loginSchema)) loginDto: z.infer<typeof loginSchema>) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body(new ZodValidationPipe(registerSchema)) registerDto: z.infer<typeof registerSchema>) {
    return this.authService.register(registerDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser() user: User) {
    return this.authService.getProfile(user);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  changePassword(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
  ) {
    return this.authService.changePassword(
      user,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Post('verify-password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  verifyPassword(
    @CurrentUser() user: User,
    @Body(new ZodValidationPipe(verifyPasswordSchema)) dto: z.infer<typeof verifyPasswordSchema>,
  ) {
    return this.authService.verifyPassword(user, dto.password);
  }
}
