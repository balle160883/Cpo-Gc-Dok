import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { SupabaseModule } from './supabase/supabase.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AuthModule } from './auth/auth.module';
import { CrmModule } from './crm/crm.module';
import { RentaModule } from './renta/renta.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    SupabaseModule,
    AuthModule,
    PortfolioModule,
    CrmModule,
    RentaModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
