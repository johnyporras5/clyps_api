import { CompanyPortfolioPictures } from '../entities/company_portfolio_pictures.entity';

export type CompanyPortfolioPictureWithUrl = CompanyPortfolioPictures & {
  pictureUrl: string;
};
