import { Body, Controller, Get, Param, Post, UseGuards, Request, Query } from '@nestjs/common';
import { CrmService } from './crm.service';
import { AuthGuard } from '@nestjs/passport';
import { RentaGuard } from '../renta/renta.guard';

@UseGuards(AuthGuard('jwt'), RentaGuard)
@Controller('crm')
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post('interacciones')
  async registrarInteraccion(@Request() req: any, @Body() data: any) {
    return this.crmService.registrarInteraccion({
      ...data,
      gestor_id: req.user.userId, // Asociar interacción al usuario real
    });
  }

  @Post('promesas')
  async registrarPromesa(@Body() data: any) {
    return this.crmService.registrarPromesa(data);
  }

  @Get('socios/:id/historial')
  async getHistorial(@Param('id') id: string) {
    return this.crmService.getInteraccionesSocio(Number(id));
  }

  @Get('socio/:socioId/expediente360')
  async getExpediente360(@Param('socioId') socioId: string) {
    return this.crmService.getExpediente360(socioId);
  }

  @Get('interacciones')
  async getInteracciones(
    @Request() req: any, 
    @Query('gestorId') gestorId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const rawGestorId = req.user.rol === 'admin' ? gestorId : req.user.gestorId;
    const effectiveGestorId = (rawGestorId && rawGestorId.trim() !== '') ? rawGestorId : undefined;
    return this.crmService.getInteracciones(effectiveGestorId, startDate, endDate);
  }

  @Get('promesas/pendientes')
  async getPromesasPendientes(
    @Request() req: any, 
    @Query('gestorId') gestorId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const rawGestorId = req.user.rol === 'admin' ? gestorId : req.user.gestorId;
    const effectiveGestorId = (rawGestorId && rawGestorId.trim() !== '') ? rawGestorId : undefined;
    return this.crmService.getPromesasPendientes(effectiveGestorId, startDate, endDate);
  }
}
