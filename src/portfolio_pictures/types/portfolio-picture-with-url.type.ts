import { PortfolioPictures } from '../entities/portfolio_pictures.entity';

export type PortfolioPictureWithUrl = PortfolioPictures & {
  pictureUrl: string;
};
