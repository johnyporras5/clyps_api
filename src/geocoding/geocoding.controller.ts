import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GeocodingService } from './geocoding.service';
import { QueryCitiesDto } from './dto/query-cities.dto';
import type { CitiesResponse } from './dto/city-result.dto';

@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('cities')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  searchCities(@Query() query: QueryCitiesDto): Promise<CitiesResponse> {
    return this.geocodingService.searchCities(query);
  }
}
