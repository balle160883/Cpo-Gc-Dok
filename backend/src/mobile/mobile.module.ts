import { Module } from '@nestjs/common';
import { MobileController } from './mobile.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [MobileController],
})
export class MobileModule {}
