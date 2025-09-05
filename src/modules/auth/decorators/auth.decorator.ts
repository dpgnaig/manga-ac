import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth } from '@nestjs/swagger';

export function Auth() {
    return applyDecorators(
        UseGuards(AuthGuard('jwt')),
        ApiBearerAuth('access-token') // 👈 Swagger support
    );
}
