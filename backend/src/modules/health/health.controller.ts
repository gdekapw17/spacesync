import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse as SwaggerApiResponse, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../database/prisma.service';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';

/**
 * Health check controller providing system observability probes.
 * Exposes full aggregate status, liveness, and readiness probes for container orchestration.
 */
@ApiTags('Health & Monitoring')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Full aggregate health check evaluating heap memory allocation and PostgreSQL connectivity.
   */
  @Get()
  @HealthCheck()
  @ResponseMessage('Sistem beroperasi normal')
  @ApiOperation({
    summary: 'Periksa kesehatan menyeluruh sistem (Database & Memori)',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Seluruh subsistem beroperasi secara normal.',
  })
  @SwaggerApiResponse({
    status: 503,
    description: 'Satu atau lebih subsistem mengalami kegagalan.',
  })
  check() {
    return this.health.check([
      // Heap allocation memory threshold check: Alert if heap usage exceeds 300MB
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      // Database ping probe via active Prisma connection pool
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }

  /**
   * Liveness probe for container engines (Docker / Kubernetes livenessProbe).
   * Confirms that the event loop is responsive and memory usage is healthy.
   */
  @Get('liveness')
  @HealthCheck()
  @ResponseMessage('Liveness probe sehat: Event loop dan alokasi memori beroperasi normal')
  @ApiOperation({ summary: 'Liveness probe untuk orchestrator kontainer' })
  @SwaggerApiResponse({
    status: 200,
    description: 'Aplikasi aktif dan event loop berjalan.',
  })
  @SwaggerApiResponse({
    status: 503,
    description: 'Alokasi heap memori melampaui batas aman.',
  })
  checkLiveness() {
    return this.health.check([() => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024)]);
  }

  /**
   * Readiness probe for load balancers (Kubernetes readinessProbe / Ingress).
   * Confirms that Prisma client is ready to accept active transactions.
   */
  @Get('readiness')
  @HealthCheck()
  @ResponseMessage('Readiness probe sehat: Koneksi database PostgreSQL siap menerima query')
  @ApiOperation({ summary: 'Readiness probe keterhubungan basis data' })
  @SwaggerApiResponse({
    status: 200,
    description: 'Koneksi basis data aktif dan siap menerima kueri.',
  })
  @SwaggerApiResponse({
    status: 503,
    description: 'Koneksi basis data terputus atau tidak merespons.',
  })
  checkReadiness() {
    return this.health.check([() => this.prismaHealth.pingCheck('database', this.prisma)]);
  }
}
