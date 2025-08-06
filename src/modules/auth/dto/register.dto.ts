import { ApiProperty } from '@nestjs/swagger';
import { Role } from 'src/common/enums/roles.enum';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  email: string;
  @ApiProperty({ example: 'securePassword123' })
  password: string;
  @ApiProperty({ example: 'Nguyen Van A' })
  name?: string;
  @ApiProperty({ enum: Role, isArray: true, example: [Role.NormalUser] })
  roles?: Role[];
}
