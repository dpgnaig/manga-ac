import {
    Injectable,
    UnauthorizedException,
    ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from 'src/common/enums/roles.enum';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
    ) { }

    async register(registerDto: RegisterDto) {
        const existing = await this.usersService.findByEmail(registerDto.email);
        if (existing) {
            throw new ConflictException('Email already exists');
        }

        const hashedPassword = await bcrypt.hash(registerDto.password, 10);
        const user = await this.usersService.create({
            ...registerDto,
            password: hashedPassword,
            roles: registerDto.roles || [Role.NormalUser],
        });
        console.log(user);
        return { message: 'User registered successfully' };
    }

    async login(loginDto: LoginDto) {
        const user = await this.usersService.findByEmail(loginDto.email);
        if (!user) throw new UnauthorizedException('Invalid credentials');

        const isMatch = await bcrypt.compare(loginDto.password, user.password);
        if (!isMatch) throw new UnauthorizedException('Invalid credentials');

        await this.usersService.updateLoginAt(user._id);

        const payload = {
            sub: user._id,
            email: user.email,
            name: user.name,
            roles: user.roles,
        };

        return {
            access_token: this.jwtService.sign(payload),
        };
    }
}
