import { Controller, Get, Param, Query, UseGuards, Request, Patch, Body, Post, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PortfolioService } from './portfolio.service';
import { AuthGuard } from '@nestjs/passport';
import { RentaGuard } from '../renta/renta.guard';

@UseGuards(AuthGuard('jwt'), RentaGuard)
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('socios')
  async getSocios(@Request() req: any, @Query('limit') limit: number, @Query('gestorId') gestorId?: string) {
    const rawGestorId = req.user.rol === 'admin' ? gestorId : req.user.gestorId;
    const effectiveGestorId = (rawGestorId && rawGestorId.trim() !== '') ? rawGestorId : undefined;
    return this.portfolioService.getSocios(limit, effectiveGestorId);
  }

  @Get('socios/:id/prestamos')
  async getPrestamos(@Request() req: any, @Param('id') id: string) {
    // Para préstamos específicos, el service ya maneja si el admin puede verlo (si no pasa gestorId)
    const effectiveGestorId = req.user.rol === 'admin' ? undefined : req.user.gestorId;
    return this.portfolioService.getPrestamosPorSocio(Number(id), effectiveGestorId);
  }

  @Get('vencida')
  async getCarteraVencida(@Request() req: any, @Query('gestorId') gestorId?: string) {
    const rawGestorId = req.user.rol === 'admin' ? gestorId : req.user.gestorId;
    const effectiveGestorId = (rawGestorId && rawGestorId.trim() !== '') ? rawGestorId : undefined;
    return this.portfolioService.getCarteraVencida(effectiveGestorId);
  }

  @Get('asignaciones')
  async getAsignaciones(
    @Request() req: any,
    @Query('limit') limit: number,
    @Query('gestorId') gestorId?: string,
  ) {
    const rawGestorId = req.user.rol === 'admin' ? gestorId : (gestorId || req.user.gestorId);
    const effectiveGestorId = (rawGestorId && rawGestorId.trim() !== '') ? rawGestorId : undefined;
    return this.portfolioService.getAsignaciones(limit, effectiveGestorId);
  }

  @Get('recuperacion')
  async getRecuperacion(
    @Request() req: any, 
    @Query('gestorId') gestorId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string
  ) {
    const rawGestorId = req.user.rol === 'admin' ? gestorId : req.user.gestorId;
    const effectiveGestorId = (rawGestorId && rawGestorId.trim() !== '') ? rawGestorId : undefined;
    return this.portfolioService.getRecuperacion(effectiveGestorId, startDate, endDate);
  }
  
  @Get('locations')
  async getLocations() {
    return this.portfolioService.getAllGestoresLocations();
  }

  @Post('location')
  async saveLocation(@Request() req: any, @Body() body: { latitud: number; longitud: number }) {
    const gestorId = req.user.userId || req.user.id;
    return this.portfolioService.saveGestorLocation(gestorId, body.latitud, body.longitud);
  }


  @Get('gestores')
  async getGestores() {
    return this.portfolioService.getAllGestores();
  }

  @Patch('asignaciones/:noCuenta')
  async updateAsignacion(@Param('noCuenta') noCuenta: string, @Body() data: any) {
    return this.portfolioService.updateAsignacion(noCuenta, data);
  }

  @Post('import-avales')
  @UseInterceptors(FileInterceptor('file'))
  async importAvales(@UploadedFile() file: Express.Multer.File) {
    return this.portfolioService.importAvales(file.buffer);
  }
}
