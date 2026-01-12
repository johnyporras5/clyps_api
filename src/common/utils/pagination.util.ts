import { Repository, SelectQueryBuilder, ObjectLiteral } from 'typeorm';

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginationResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export async function paginate<T extends ObjectLiteral>(
  repositoryOrQueryBuilder: Repository<T> | SelectQueryBuilder<T>,
  options: PaginationOptions,
  whereConditions: any = {},
  relations: string[] = []
): Promise<PaginationResult<T>> {
  const { page, limit } = options;
  const skip = (page - 1) * limit;

  let data: T[];
  let total: number;

  if (repositoryOrQueryBuilder instanceof SelectQueryBuilder) {
    // Si es QueryBuilder
    const query = repositoryOrQueryBuilder.skip(skip).take(limit);
    [data, total] = await query.getManyAndCount();
  } else {
    // Si es Repository
    [data, total] = await repositoryOrQueryBuilder.findAndCount({
      where: whereConditions,
      relations,
      take: limit,
      skip,
    });
  }

  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNext,
      hasPrev,
    },
  };
}