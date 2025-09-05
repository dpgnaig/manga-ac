import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { StatesService } from './states.service';
import { User } from 'src/common/decorator/user.decorator';
import { StateRequestDto } from './dto/state.dto';
import { ApiParam } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';

@Controller('states')
export class StatesController {
    constructor(private statesService: StatesService) { }

    // @Auth()
    @Post()
    async saveState(@User() user: any, @Body() request: StateRequestDto) {
        const userId = user.id;
        return await this.statesService.updateState(
            userId,
            request.manga_readed_id,
            request.chapter_readed_id,
        );
    }

    @Auth()
    @Get('user-state/:id')
    @ApiParam({ name: 'id', type: String, description: 'Get user reader states' })
    getChapterInfo(@Param('id') id: string) {
        return this.statesService.getStatesByUser(id);
    }

    @Auth()
    @Delete('deleted/:mangaId')
    @ApiParam({ name: 'mangaId', type: String, description: 'Delete state by mangaId' })
    deleteState(@User() user: any, @Param('mangaId') mangaId: number) {
        return this.statesService.deleteState(user.sub, mangaId);
    }


}
