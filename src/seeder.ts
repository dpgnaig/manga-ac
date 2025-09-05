// src/seeder.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { UsersService } from './modules/users/users.service';
import { Role } from './common/enums/roles.enum';
import * as bcrypt from 'bcrypt';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const usersService = app.get(UsersService);

    const adminEmail = 'dpgnaig@gmail.com';
    const existing = await usersService.findByEmail(adminEmail);

    if (!existing) {
        const hashedPassword = await bcrypt.hash('DucG1@ng', 10);

        await usersService.create({
            email: adminEmail,
            password: hashedPassword,
            name: 'Phó Đức Giang',
            roles: [Role.Administrator],
        });

        console.log('✅ Admin user created.');
    } else {
        console.log('ℹ️ Admin user already exists.');
    }

    await app.close();
}

bootstrap();
